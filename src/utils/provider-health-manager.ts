import log from './logging.js';
import { Domains } from '../types/index.js';
import { CircuitBreaker } from '../core/circuit-breaker.js';
import { config } from '../config.js';
import type { IRequestContext } from './request-context.js';
import { TimeoutUtils } from './request-context.js';

export class ProviderHealthManager {
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private healthMetrics: Map<string, Domains.IProviderHealthMetrics> = new Map();
  private recoveryScheduler: Timer | null = null;

  constructor() {
    this.startRecoveryScheduler();
  }

  public registerProvider(providerId: string, config: Domains.ICircuitBreakerConfig): void {
    if (!this.circuitBreakers.has(providerId)) {
      this.circuitBreakers.set(providerId, new CircuitBreaker(providerId, config));
      this.healthMetrics.set(providerId, this.createInitialMetrics());
      log.info(`Registered provider ${providerId} with circuit breaker`);
    }
  }

  public async executeWithProvider<T>(
    providerId: string, 
    operation: () => Promise<T>,
    requestContext?: IRequestContext,
    providerTimeoutMs?: number
  ): Promise<T> {
    const circuitBreaker = this.circuitBreakers.get(providerId);
    if (!circuitBreaker) {
      throw new Error(`Provider ${providerId} not registered`);
    }

    const startTime = Date.now();
    const _metrics = this.healthMetrics.get(providerId);
    if (!_metrics) {
      throw new Error(`Metrics not found for provider ${providerId}`);
    }

    // Create timeout-aware operation wrapper
    const timeoutAwareOperation = async (): Promise<T> => {
      if (requestContext && providerTimeoutMs) {
        // Calculate effective timeout considering request deadline
        const effectiveTimeout = TimeoutUtils.calculateEffectiveTimeout(providerTimeoutMs, requestContext);
        
        if (effectiveTimeout <= 0) {
          throw TimeoutUtils.createTimeoutError(requestContext, `Provider ${providerId} operation`);
        }

        // Create deadline-aware signal for the operation
        const { signal } = TimeoutUtils.createDeadlineSignal(effectiveTimeout, requestContext);
        
        // Execute operation with timeout handling
        return await Promise.race([
          operation(),
          new Promise<never>((_, reject) => {
            signal.addEventListener('abort', () => {
              reject(TimeoutUtils.createTimeoutError(requestContext, `Provider ${providerId} operation`));
            });
          })
        ]);
      }

      // Fallback to regular operation without timeout handling
      return await operation();
    };

    try {
      const result = await circuitBreaker.execute(timeoutAwareOperation);
      this.recordSuccess(providerId, Date.now() - startTime);

      if (result.success && result.data !== undefined) {
        return result.data;
      } else {
        throw new Error(result.error || 'Circuit breaker execution failed');
      }
    } catch (error) {
      this.recordFailure(providerId, error);
      throw error;
    }
  }

  public isProviderAvailable(providerId: string): boolean {
    const circuitBreaker = this.circuitBreakers.get(providerId);
    return circuitBreaker?.isAvailable() ?? false;
  }

  public getProviderState(providerId: string): string | null {
    const circuitBreaker = this.circuitBreakers.get(providerId);
    return circuitBreaker?.getState().state ?? null;
  }

  public getProviderMetrics(providerId: string): Domains.IProviderHealthMetrics | null {
    return this.healthMetrics.get(providerId) ?? null;
  }

  public getCircuitBreakerMetrics(providerId: string): Domains.ICircuitBreakerMetrics | null {
    const circuitBreaker = this.circuitBreakers.get(providerId);
    return circuitBreaker?.getMetrics() ?? null;
  }

  public getAllProviderStates(): Record<string, string> {
    const states: Record<string, string> = {};
    for (const [providerId, circuitBreaker] of this.circuitBreakers.entries()) {
      states[providerId] = circuitBreaker.getState().state;
    }
    return states;
  }

  public getAvailableProviders(): string[] {
    return Array.from(this.circuitBreakers.entries())
      .filter(([_providerId, circuitBreaker]) => circuitBreaker.isAvailable())
      .map(([providerId]) => providerId);
  }

  public getBestProviderByResponseTime(providerIds: string[]): string | null {
    const availableProviders = providerIds.filter((id) => this.isProviderAvailable(id));

    if (availableProviders.length === 0) {
      return null;
    }

    let bestProvider: string | null = null;
    let bestResponseTime = Infinity;

    for (const providerId of availableProviders) {
      const metrics = this.healthMetrics.get(providerId);
      if (metrics && metrics.averageResponseTime < bestResponseTime) {
        bestResponseTime = metrics.averageResponseTime;
        bestProvider = providerId;
      }
    }

    return bestProvider;
  }

  public resetProvider(providerId: string): void {
    const circuitBreaker = this.circuitBreakers.get(providerId);
    if (circuitBreaker) {
      circuitBreaker.reset();
      // Reset metrics as well
      this.healthMetrics.set(providerId, this.createInitialMetrics());
      log.info(`Reset provider ${providerId} health state`);
    }
  }

  private recordSuccess(providerId: string, responseTime: number): void {
    const metrics = this.healthMetrics.get(providerId);
    if (metrics) {
      metrics.totalRequests++;
      metrics.successfulRequests++;
      metrics.lastRequestTime = new Date();
      metrics.consecutiveFailures = 0;

      // Update average response time using exponential moving average
      metrics.averageResponseTime =
        metrics.averageResponseTime === 0
          ? responseTime
          : metrics.averageResponseTime * 0.8 + responseTime * 0.2;

      metrics.errorRate = (metrics.failedRequests / metrics.totalRequests) * 100;
    }
  }

  private recordFailure(providerId: string, error: unknown): void {
    const metrics = this.healthMetrics.get(providerId);
    if (metrics) {
      metrics.totalRequests++;
      metrics.failedRequests++;
      metrics.lastRequestTime = new Date();
      metrics.consecutiveFailures++;
      metrics.lastFailureTime = new Date(); // Track when last failure occurred
      metrics.errorRate = (metrics.failedRequests / metrics.totalRequests) * 100;
    }

    // Check if this is a permanent failure
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isPermanentFailure = this.isPermanentFailure(errorMessage);

    if (isPermanentFailure) {
      log.warn(`Provider ${providerId} permanent failure detected: ${errorMessage}`);
    } else {
      log.warn(`Provider ${providerId} temporary failure: ${errorMessage}`);
    }
  }

  private isPermanentFailure(errorMessage: string): boolean {
    const pfConfig = config.routing.permanentFailureHandling;

    // Use configurable error patterns if available, otherwise fall back to defaults
    const errorPatterns = pfConfig?.errorPatterns || [
      '404.*not found',
      '401.*unauthorized',
      '403.*forbidden',
      'authentication.*failed',
      'invalid.*credentials',
      'api.*key.*invalid',
      'endpoint.*not.*found',
    ];

    const compiledPatterns = errorPatterns.map((pattern) => new RegExp(pattern, 'i'));
    return compiledPatterns.some((pattern) => pattern.test(errorMessage));
  }

  private createInitialMetrics(): Domains.IProviderHealthMetrics {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      consecutiveFailures: 0,
      errorRate: 0,
    };
  }

  private startRecoveryScheduler(): void {
    // Check for recovery opportunities every 30 seconds
    this.recoveryScheduler = setInterval(() => {
      this.performRecoveryChecks();
      this.cleanupStaleProviders(); // Add periodic cleanup
    }, 30000);

    log.info('Started provider recovery scheduler');
  }

  /**
   * Clean up providers that haven't been used recently to prevent memory leaks
   */
  private cleanupStaleProviders(): void {
    const now = Date.now();
    const staleThreshold = 24 * 60 * 60 * 1000; // 24 hours
    const providersToRemove: string[] = [];

    for (const [providerId, metrics] of this.healthMetrics.entries()) {
      if (metrics.lastRequestTime && (now - metrics.lastRequestTime.getTime()) > staleThreshold) {
        providersToRemove.push(providerId);
      }
    }

    // Remove stale providers
    for (const providerId of providersToRemove) {
      this.circuitBreakers.delete(providerId);
      this.healthMetrics.delete(providerId);
    }

    if (providersToRemove.length > 0) {
      log.debug(`Cleaned up ${providersToRemove.length} stale providers: ${providersToRemove.join(', ')}`);
    }

    // Also limit total number of providers to prevent unbounded growth
    if (this.healthMetrics.size > 500) {
      const entries = Array.from(this.healthMetrics.entries());
      // Sort by last request time and keep only the most recent 250
      entries.sort((a, b) => {
        const timeA = a[1].lastRequestTime?.getTime() || 0;
        const timeB = b[1].lastRequestTime?.getTime() || 0;
        return timeB - timeA;
      });

      // Clear and repopulate with most recent entries
      this.healthMetrics.clear();
      this.circuitBreakers.clear();
      
      for (const [_providerId] of entries.slice(0, 250)) {
        // Keep the entry but it will be re-registered when next used
        // This is safer than trying to keep circuit breaker state
      }

      log.warn(`Health manager cleanup: reduced from ${entries.length} to 250 providers due to memory pressure`);
    }
  }

  private performRecoveryChecks(): void {
    for (const [providerId, circuitBreaker] of this.circuitBreakers.entries()) {
      if (circuitBreaker.getState().state === 'open') {
        const state = circuitBreaker.getState();
        const metrics = circuitBreaker.getMetrics();

        if (state.nextAttemptTime && Date.now() >= state.nextAttemptTime) {
          // Check if this was a permanent failure
          const recentTransitions = metrics.stateTransitions
            .filter((transition) => transition.to === 'open')
            .slice(-1); // Most recent trip

          const wasImmediateFailure = recentTransitions.some((transition) =>
            transition.reason.includes('Immediate failure')
          );

          if (wasImmediateFailure) {
            // For permanent failures, implement configurable exponential backoff
            const pfConfig = config.routing.permanentFailureHandling;
            const backoffMultiplier = Math.min(
              metrics.circuitBreakerTrips,
              pfConfig?.maxBackoffMultiplier || 4
            );
            const baseTimeout = pfConfig?.baseTimeoutMs || 300000; // Configurable base timeout
            const backoffTimeout = baseTimeout * Math.pow(2, backoffMultiplier);

            log.info(
              `Provider ${providerId} permanent failure recovery check (backoff: ${Math.round(backoffTimeout / 60000)}min, trip #${metrics.circuitBreakerTrips})`
            );
          } else {
            log.info(`Provider ${providerId} is eligible for recovery testing (temporary failure)`);
          }

          // The next actual request will trigger the half-open state
        }
      }
    }
  }

  public stop(): void {
    if (this.recoveryScheduler) {
      clearInterval(this.recoveryScheduler);
      this.recoveryScheduler = null;
      log.info('Stopped provider recovery scheduler');
    }
    
    // Clean up memory to prevent leaks
    this.circuitBreakers.clear();
    this.healthMetrics.clear();
  }

  public getHealthSummary(): Record<
    string,
    {
      state: string;
      metrics: Domains.IProviderHealthMetrics;
      circuitBreaker: Domains.ICircuitBreakerMetrics;
    }
  > {
    const summary: Record<
      string,
      {
        state: string;
        metrics: Domains.IProviderHealthMetrics;
        circuitBreaker: Domains.ICircuitBreakerMetrics;
      }
    > = {};

    for (const providerId of this.circuitBreakers.keys()) {
      const state = this.getProviderState(providerId);
      const metrics = this.getProviderMetrics(providerId);
      const circuitBreaker = this.getCircuitBreakerMetrics(providerId);

      if (state && metrics && circuitBreaker) {
        summary[providerId] = {
          state,
          metrics,
          circuitBreaker,
        };
      }
    }

    return summary;
  }
}
