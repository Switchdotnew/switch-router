import log from '../../utils/logging.js';
import { logWarn } from '../../utils/logging.js';
import { EventEmitter } from 'events';
import type { HealthStatus } from '../types/metrics-types.js';

export interface HealthCheck {
  name: string;
  check: () => Promise<HealthCheckResult>;
  intervalMs: number;
  timeoutMs: number;
  retries: number;
  critical: boolean;
  enabled: boolean;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  metadata?: Record<string, unknown>;
  duration: number;
}

export interface HealthMonitorConfig {
  enabled: boolean;
  globalTimeoutMs: number;
  defaultIntervalMs: number;
  degradedThreshold: number;
  unhealthyThreshold: number;
  enableDetailedLogging: boolean;
}

export class HealthMonitor extends EventEmitter {
  private config: HealthMonitorConfig;
  private checks: Map<string, HealthCheck> = new Map();
  private lastResults: Map<string, HealthCheckResult> = new Map();
  private checkIntervals: Map<string, NodeJS.Timeout> = new Map();
  private consecutiveFailures: Map<string, number> = new Map();
  private startTime: number = Date.now();

  constructor(config: HealthMonitorConfig) {
    super();
    this.config = config;

    if (this.config.enabled) {
      this.registerDefaultChecks();
    }
  }

  public registerCheck(check: HealthCheck): void {
    this.checks.set(check.name, check);
    this.consecutiveFailures.set(check.name, 0);

    if (check.enabled && this.config.enabled) {
      this.startCheck(check);
    }

    log.debug(`Health check registered: ${check.name}`);
  }

  public unregisterCheck(name: string): void {
    const interval = this.checkIntervals.get(name);
    if (interval) {
      clearInterval(interval);
      this.checkIntervals.delete(name);
    }

    this.checks.delete(name);
    this.lastResults.delete(name);
    this.consecutiveFailures.delete(name);

    log.debug(`Health check unregistered: ${name}`);
  }

  private registerDefaultChecks(): void {
    // Memory usage check
    this.registerCheck({
      name: 'memory_usage',
      check: async () => this.checkMemoryUsage(),
      intervalMs: 30000,
      timeoutMs: 1000,
      retries: 1,
      critical: false,
      enabled: true,
    });

    // Event loop lag check
    this.registerCheck({
      name: 'event_loop_lag',
      check: async () => this.checkEventLoopLag(),
      intervalMs: 15000,
      timeoutMs: 5000,
      retries: 1,
      critical: true,
      enabled: true,
    });

    // File system check
    this.registerCheck({
      name: 'filesystem',
      check: async () => this.checkFileSystem(),
      intervalMs: 60000,
      timeoutMs: 5000,
      retries: 2,
      critical: false,
      enabled: true,
    });
  }

  private async checkMemoryUsage(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const memUsage = process.memoryUsage();
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    const rssUsedMB = memUsage.rss / (1024 * 1024);

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let message = `Heap: ${heapUsedPercent.toFixed(1)}%, RSS: ${rssUsedMB.toFixed(1)}MB`;

    if (heapUsedPercent > 90) {
      status = 'unhealthy';
      message = `Critical memory usage: ${heapUsedPercent.toFixed(1)}%`;
    } else if (heapUsedPercent > 75) {
      status = 'degraded';
      message = `High memory usage: ${heapUsedPercent.toFixed(1)}%`;
    }

    return {
      status,
      message,
      duration: Date.now() - startTime,
      metadata: {
        heapUsedPercent,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        rss: memUsage.rss,
        external: memUsage.external,
      },
    };
  }

  private async checkEventLoopLag(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const measureStart = process.hrtime.bigint();

      globalThis.setImmediate(() => {
        const measureEnd = process.hrtime.bigint();
        const lagNs = Number(measureEnd - measureStart);
        const lagMs = lagNs / 1_000_000;

        let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
        let message = `Event loop lag: ${lagMs.toFixed(2)}ms`;

        if (lagMs > 100) {
          status = 'unhealthy';
          message = `Critical event loop lag: ${lagMs.toFixed(2)}ms`;
        } else if (lagMs > 50) {
          status = 'degraded';
          message = `High event loop lag: ${lagMs.toFixed(2)}ms`;
        }

        resolve({
          status,
          message,
          duration: Date.now() - startTime,
          metadata: {
            lagMs,
            lagNs,
          },
        });
      });
    });
  }

  private async checkFileSystem(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const fs = await import('fs/promises');
      const tempFile = `/tmp/health-check-${Date.now()}`;

      // Test write
      await fs.writeFile(tempFile, 'health check');

      // Test read
      const content = await fs.readFile(tempFile, 'utf-8');

      // Cleanup
      await fs.unlink(tempFile);

      if (content !== 'health check') {
        throw new Error('File content mismatch');
      }

      return {
        status: 'healthy',
        message: 'File system read/write operations successful',
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `File system error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: Date.now() - startTime,
        metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  private startCheck(check: HealthCheck): void {
    // Run initial check
    this.runCheck(check);

    // Set up interval
    const interval = setInterval(() => {
      this.runCheck(check);
    }, check.intervalMs);

    this.checkIntervals.set(check.name, interval);
  }

  private async runCheck(check: HealthCheck): Promise<void> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= check.retries) {
      try {
        const result = await this.executeCheckWithTimeout(check);

        // Reset consecutive failures on success
        if (result.status === 'healthy') {
          this.consecutiveFailures.set(check.name, 0);
        } else {
          const failures = this.consecutiveFailures.get(check.name) || 0;
          this.consecutiveFailures.set(check.name, failures + 1);
        }

        this.lastResults.set(check.name, result);

        if (this.config.enableDetailedLogging) {
          log.debug(`Health check completed: ${check.name}`, {
            status: result.status,
            duration: result.duration,
            message: result.message,
          });
        }

        // Emit events
        this.emit('checkCompleted', check.name, result);

        if (result.status !== 'healthy') {
          this.emit('checkFailed', check.name, result);
        }

        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempt++;

        if (attempt <= check.retries) {
          logWarn(
            `Health check ${check.name} failed (attempt ${attempt}), retrying: ${lastError.message}`
          );
          await this.sleep(1000 * attempt); // Exponential backoff
        }
      }
    }

    // All attempts failed
    const failures = this.consecutiveFailures.get(check.name) || 0;
    this.consecutiveFailures.set(check.name, failures + 1);

    const failureResult: HealthCheckResult = {
      status: 'unhealthy',
      message: `Check failed after ${check.retries + 1} attempts: ${lastError?.message || 'Unknown error'}`,
      duration: check.timeoutMs,
      metadata: { error: lastError?.message, attempts: attempt },
    };

    this.lastResults.set(check.name, failureResult);
    this.emit('checkCompleted', check.name, failureResult);
    this.emit('checkFailed', check.name, failureResult);

    log.error(
      `Health check ${check.name} failed after all retries:`,
      lastError?.message || 'Unknown error'
    );
  }

  private async executeCheckWithTimeout(check: HealthCheck): Promise<HealthCheckResult> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Health check timeout after ${check.timeoutMs}ms`));
      }, check.timeoutMs);
    });

    return Promise.race([check.check(), timeoutPromise]);
  }

  public getHealthStatus(): HealthStatus {
    const now = Date.now();
    const checks: HealthStatus['checks'] = {};

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let criticalIssues = 0;
    let degradedIssues = 0;

    for (const [name, check] of this.checks.entries()) {
      if (!check.enabled) continue;

      const result = this.lastResults.get(name);
      const consecutiveFailures = this.consecutiveFailures.get(name) || 0;

      if (!result) {
        checks[name] = {
          status: 'unhealthy',
          message: 'Check not yet executed',
          duration: 0,
        };
        if (check.critical) criticalIssues++;
        continue;
      }

      checks[name] = result;

      // Evaluate consecutive failures
      if (consecutiveFailures >= this.config.unhealthyThreshold) {
        checks[name].status = 'unhealthy';
        if (check.critical) criticalIssues++;
      } else if (consecutiveFailures >= this.config.degradedThreshold) {
        checks[name].status = 'degraded';
        degradedIssues++;
      }

      // Track issues for overall status
      if (result.status === 'unhealthy' && check.critical) {
        criticalIssues++;
      } else if (result.status === 'degraded' || result.status === 'unhealthy') {
        degradedIssues++;
      }
    }

    // Determine overall status
    if (criticalIssues > 0) {
      overallStatus = 'unhealthy';
    } else if (degradedIssues > 0) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      timestamp: now,
      checks,
      uptime: now - this.startTime,
      version: '1.0.0',
    };
  }

  public async runAllChecks(): Promise<HealthStatus> {
    const promises = Array.from(this.checks.values())
      .filter((check) => check.enabled)
      .map((check) => this.runCheck(check));

    await Promise.allSettled(promises);
    return this.getHealthStatus();
  }

  public getCheckResult(name: string): HealthCheckResult | null {
    return this.lastResults.get(name) || null;
  }

  public getConsecutiveFailures(name: string): number {
    return this.consecutiveFailures.get(name) || 0;
  }

  public enableCheck(name: string): void {
    const check = this.checks.get(name);
    if (check) {
      check.enabled = true;
      if (this.config.enabled) {
        this.startCheck(check);
      }
      log.debug(`Health check enabled: ${name}`);
    }
  }

  public disableCheck(name: string): void {
    const check = this.checks.get(name);
    if (check) {
      check.enabled = false;

      const interval = this.checkIntervals.get(name);
      if (interval) {
        clearInterval(interval);
        this.checkIntervals.delete(name);
      }

      log.debug(`Health check disabled: ${name}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public stop(): void {
    for (const interval of this.checkIntervals.values()) {
      clearInterval(interval);
    }
    this.checkIntervals.clear();

    log.info('Health monitoring stopped');
  }

  public destroy(): void {
    this.stop();
    this.removeAllListeners();
    this.checks.clear();
    this.lastResults.clear();
    this.consecutiveFailures.clear();
  }
}
