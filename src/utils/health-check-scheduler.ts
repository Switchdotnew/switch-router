import log from './logging.js';
import { config } from '../config.js';
import type { OpenAICompatibleClient } from './openai-client.js';
import type { ProviderHealthManager } from './provider-health-manager.js';
import type { HealthCheckConfig } from '../types/shared/config.js';

/**
 * Semaphore implementation for controlling concurrent health check operations
 */
class Semaphore {
  private permits: number;
  private waitQueue: (() => void)[] = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    const next = this.waitQueue.shift();
    if (next) {
      this.permits--;
      next();
    }
  }

  get availablePermits(): number {
    return this.permits;
  }

  get queueLength(): number {
    return this.waitQueue.length;
  }
}

/**
 * Health check task with priority and metadata
 */
interface IHealthCheckTask {
  modelName: string;
  providerId: string;
  priority: number;
  client: OpenAICompatibleClient;
  retryCount: number;
  lastAttempt?: Date;
  timeoutMs: number;
}

/**
 * Health check configuration extends the schema config
 */
type IHealthCheckConfig = Required<HealthCheckConfig>;

/**
 * Health check metrics for monitoring
 */
interface IHealthCheckMetrics {
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  timeoutChecks: number;
  averageResponseTime: number;
  concurrentChecks: number;
  queueLength: number;
  lastCycleTime: number;
  checksPerSecond: number;
}

/**
 * Parallel health check scheduler with intelligent concurrency control
 * Transforms sequential health checks into efficient parallel execution
 */
export class HealthCheckScheduler {
  private semaphore: Semaphore;
  private config: IHealthCheckConfig;
  private healthManager: ProviderHealthManager;
  private clients: Map<string, OpenAICompatibleClient>;
  private tasks: Map<string, IHealthCheckTask> = new Map();
  private metrics: IHealthCheckMetrics;
  private schedulerInterval: Timer | null = null;
  private running = false;

  // Dedicated HTTP client for health checks to avoid resource contention
  private healthCheckClient: typeof fetch;

  constructor(
    healthManager: ProviderHealthManager,
    clients: Map<string, OpenAICompatibleClient>
  ) {
    this.healthManager = healthManager;
    this.clients = clients;
    
    // Initialize configuration from global config with defaults
    const defaultHealthCheckConfig: IHealthCheckConfig = {
      maxConcurrentChecks: 20,
      defaultTimeoutMs: 5000,
      primaryProviderIntervalMs: 30000,
      fallbackProviderIntervalMs: 45000,
      failedProviderIntervalMs: 15000,
      maxRetries: 3,
      retryDelayMs: 1000,
      enablePrioritization: true,
      enableAdaptiveIntervals: true,
    };

    // Override with user configuration if available
    this.config = {
      ...defaultHealthCheckConfig,
      ...config.routing?.healthCheck,
    };

    // Maintain backward compatibility with existing healthCheckInterval
    if (config.routing?.healthCheckInterval && !config.routing?.healthCheck?.primaryProviderIntervalMs) {
      this.config.primaryProviderIntervalMs = config.routing.healthCheckInterval;
    }

    this.semaphore = new Semaphore(this.config.maxConcurrentChecks);
    
    // Initialize metrics
    this.metrics = {
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      timeoutChecks: 0,
      averageResponseTime: 0,
      concurrentChecks: 0,
      queueLength: 0,
      lastCycleTime: 0,
      checksPerSecond: 0,
    };

    // Create dedicated HTTP client for health checks
    this.healthCheckClient = fetch;
  }

  /**
   * Register a provider for health check scheduling
   */
  public registerProvider(
    modelName: string,
    providerId: string,
    client: OpenAICompatibleClient,
    priority: number = 5
  ): void {
    const task: IHealthCheckTask = {
      modelName,
      providerId,
      priority,
      client,
      retryCount: 0,
      timeoutMs: this.config.defaultTimeoutMs,
    };

    this.tasks.set(providerId, task);
    
    if (!config.performance?.disable_debug_logging) {
      log.debug(`Registered provider ${providerId} for health checks with priority ${priority}`);
    }
  }

  /**
   * Start the parallel health check scheduler
   */
  public start(): void {
    if (this.running) {
      log.warn('Health check scheduler already running');
      return;
    }

    this.running = true;
    
    // Start scheduler with base interval (use fastest interval for scheduling)
    const baseInterval = Math.min(
      this.config.primaryProviderIntervalMs,
      this.config.fallbackProviderIntervalMs,
      this.config.failedProviderIntervalMs
    );

    this.schedulerInterval = setInterval(() => {
      this.scheduleHealthChecks();
    }, baseInterval / 3); // Check 3x more frequently than the fastest interval

    log.info(`Health check scheduler started with ${this.config.maxConcurrentChecks} max concurrent checks`);
  }

  /**
   * Stop the health check scheduler
   */
  public stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }

    // Clear all pending tasks
    this.tasks.clear();
    
    log.info('Health check scheduler stopped');
  }

  /**
   * Get current health check metrics
   */
  public getMetrics(): IHealthCheckMetrics {
    return {
      ...this.metrics,
      concurrentChecks: this.config.maxConcurrentChecks - this.semaphore.availablePermits,
      queueLength: this.semaphore.queueLength,
    };
  }

  /**
   * Get current scheduler configuration (read-only)
   */
  public getConfig(): Readonly<IHealthCheckConfig> {
    return { ...this.config };
  }

  /**
   * Update scheduler configuration
   */
  public updateConfig(newConfig: Partial<IHealthCheckConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Update semaphore if max concurrent checks changed
    if (newConfig.maxConcurrentChecks) {
      this.semaphore = new Semaphore(newConfig.maxConcurrentChecks);
    }
    
    log.info('Health check scheduler configuration updated', newConfig);
  }

  /**
   * Schedule health checks based on provider state and priority
   */
  private scheduleHealthChecks(): void {
    const now = Date.now();
    const cycleStartTime = now;
    
    // Get tasks that need health checks
    const tasksToRun = this.getTasksToRun(now);
    
    if (tasksToRun.length === 0) {
      return;
    }

    // Sort and prioritize tasks
    const prioritizedTasks = this.prioritizeTasks(tasksToRun);
    
    // Execute health checks in intelligent batches
    this.executeBatchedHealthChecks(prioritizedTasks, cycleStartTime);
  }

  /**
   * Prioritize tasks based on multiple factors
   */
  private prioritizeTasks(tasks: IHealthCheckTask[]): IHealthCheckTask[] {
    if (!this.config.enablePrioritization) {
      return tasks;
    }

    return tasks.sort((a, b) => {
      // Priority 1: Provider state (failed providers first for quick recovery)
      const aState = this.healthManager.getProviderState(a.providerId);
      const bState = this.healthManager.getProviderState(b.providerId);
      
      // Open/failed providers get highest priority
      if (aState === 'open' && bState !== 'open') return -1;
      if (bState === 'open' && aState !== 'open') return 1;
      
      // Half-open providers get second priority
      if (aState === 'half-open' && bState === 'closed') return -1;
      if (bState === 'half-open' && aState === 'closed') return 1;
      
      // Priority 2: User-defined priority (lower number = higher priority)
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      
      // Priority 3: Time since last check (older checks first)
      const aLastCheck = a.lastAttempt?.getTime() || 0;
      const bLastCheck = b.lastAttempt?.getTime() || 0;
      
      return aLastCheck - bLastCheck;
    });
  }

  /**
   * Execute health checks in intelligent batches to optimize resource usage
   */
  private executeBatchedHealthChecks(tasks: IHealthCheckTask[], cycleStartTime: number): void {
    // Separate tasks into priority groups
    const criticalTasks = tasks.filter(task => {
      const state = this.healthManager.getProviderState(task.providerId);
      return state === 'open' || state === 'half-open' || task.priority <= 2;
    });
    
    const normalTasks = tasks.filter(task => {
      const state = this.healthManager.getProviderState(task.providerId);
      return state === 'closed' && task.priority > 2 && task.priority <= 5;
    });
    
    const backgroundTasks = tasks.filter(task => {
      const state = this.healthManager.getProviderState(task.providerId);
      return state === 'closed' && task.priority > 5;
    });

    // Execute critical tasks first (immediate)
    const criticalPromises = criticalTasks.map(task => this.executeHealthCheck(task));
    
    // Execute normal tasks with slight delay to avoid thundering herd
    const normalPromises = normalTasks.map((task, index) => 
      new Promise<void>(resolve => {
        setTimeout(() => {
          this.executeHealthCheck(task).finally(resolve);
        }, index * 50); // 50ms stagger
      })
    );
    
    // Execute background tasks with longer delays
    const backgroundPromises = backgroundTasks.map((task, index) => 
      new Promise<void>(resolve => {
        setTimeout(() => {
          this.executeHealthCheck(task).finally(resolve);
        }, 500 + (index * 100)); // 500ms initial delay, 100ms stagger
      })
    );

    // Combine all promises and track metrics
    const allPromises = [...criticalPromises, ...normalPromises, ...backgroundPromises];
    
    Promise.allSettled(allPromises).then(() => {
      const cycleTime = Date.now() - cycleStartTime;
      this.metrics.lastCycleTime = cycleTime;
      this.metrics.checksPerSecond = tasks.length / (cycleTime / 1000);
      
      if (!config.performance?.disable_debug_logging && tasks.length > 0) {
        log.debug(`Health check cycle completed: ${tasks.length} checks (${criticalTasks.length} critical, ${normalTasks.length} normal, ${backgroundTasks.length} background) in ${cycleTime}ms`);
      }
    });
  }

  /**
   * Get tasks that need health checks based on their intervals
   */
  private getTasksToRun(now: number): IHealthCheckTask[] {
    const tasksToRun: IHealthCheckTask[] = [];

    // Use Array.from to avoid iterator issues
    const tasks = Array.from(this.tasks.values());
    for (const task of tasks) {
      const shouldRun = this.shouldRunHealthCheck(task, now);
      if (shouldRun) {
        tasksToRun.push(task);
      }
    }

    return tasksToRun;
  }

  /**
   * Determine if a task should run based on its schedule and state
   */
  private shouldRunHealthCheck(task: IHealthCheckTask, now: number): boolean {
    // Skip if not running
    if (!this.running) {
      return false;
    }

    // Check if enough time has passed based on provider state
    const interval = this.getProviderInterval(task.providerId);
    const lastAttempt = task.lastAttempt?.getTime() || 0;
    
    return (now - lastAttempt) >= interval;
  }

  /**
   * Get health check interval based on provider state and priority
   */
  private getProviderInterval(providerId: string): number {
    if (!this.config.enableAdaptiveIntervals) {
      return this.config.primaryProviderIntervalMs;
    }

    const state = this.healthManager.getProviderState(providerId);
    const metrics = this.healthManager.getProviderMetrics(providerId);
    const task = this.tasks.get(providerId);

    // Failed providers get more frequent checks for faster recovery
    if (state === 'open' || (metrics && metrics.consecutiveFailures > 0)) {
      // Apply exponential backoff for persistent failures to avoid overwhelming failed providers
      const backoffMultiplier = Math.min(4, Math.pow(1.5, (metrics?.consecutiveFailures || 1) - 1));
      return Math.min(
        this.config.failedProviderIntervalMs * backoffMultiplier,
        this.config.primaryProviderIntervalMs
      );
    }

    // Half-open providers get moderately frequent checks
    if (state === 'half-open') {
      return Math.floor(this.config.primaryProviderIntervalMs * 0.75);
    }

    // Healthy primary providers (priority 1-3) get normal intervals
    if (task && task.priority <= 3) {
      return this.config.primaryProviderIntervalMs;
    }

    // Medium priority providers (priority 4-6) get slightly longer intervals
    if (task && task.priority <= 6) {
      return Math.floor(this.config.primaryProviderIntervalMs * 1.25);
    }

    // Low priority/fallback providers get less frequent checks
    return this.config.fallbackProviderIntervalMs;
  }

  /**
   * Execute a health check with semaphore-based concurrency control
   */
  private async executeHealthCheck(task: IHealthCheckTask): Promise<void> {
    // Acquire semaphore permit
    await this.semaphore.acquire();
    
    try {
      task.lastAttempt = new Date();
      this.metrics.totalChecks++;
      
      const startTime = Date.now();
      
      // Execute health check with timeout
      const success = await this.performHealthCheck(task);
      
      const responseTime = Date.now() - startTime;
      this.updateMetrics(success, responseTime);
      
      // Reset retry count on success
      if (success) {
        task.retryCount = 0;
        this.metrics.successfulChecks++;
      } else {
        task.retryCount++;
        this.metrics.failedChecks++;
        
        // Schedule retry if within retry limit
        if (task.retryCount < this.config.maxRetries) {
          setTimeout(() => {
            if (this.running) {
              this.executeHealthCheck(task);
            }
          }, this.config.retryDelayMs * task.retryCount); // Exponential backoff
        }
      }
      
    } catch (error) {
      this.metrics.failedChecks++;
      
      if (error instanceof Error && error.message.includes('timeout')) {
        this.metrics.timeoutChecks++;
      }
      
      log.warn(`Health check failed for ${task.providerId}: ${String(error)}`);
      
    } finally {
      // Always release semaphore permit
      this.semaphore.release();
    }
  }

  /**
   * Perform the actual health check operation
   */
  private async performHealthCheck(task: IHealthCheckTask): Promise<boolean> {
    try {
      // Use the provider's health check method with our dedicated timeout
      const healthCheckPromise = task.client.healthCheck();
      
      // Apply timeout using AbortController
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Health check timeout after ${task.timeoutMs}ms`));
        }, task.timeoutMs);
      });

      const result = await Promise.race([healthCheckPromise, timeoutPromise]);
      return result;
      
    } catch (error) {
      // Let the health manager handle the error and update circuit breaker state
      await this.healthManager.executeWithProvider(
        task.providerId,
        () => Promise.reject(error)
      ).catch(() => {
        // Expected to fail, error handling is done by health manager
      });
      
      return false;
    }
  }

  /**
   * Update health check metrics
   */
  private updateMetrics(success: boolean, responseTime: number): void {
    // Update average response time using moving average
    const alpha = 0.1; // Smoothing factor
    this.metrics.averageResponseTime = 
      (this.metrics.averageResponseTime * (1 - alpha)) + (responseTime * alpha);
  }
}