import log from '../utils/logging.js';
import { Domains } from '../types/index.js';
import {
  classifyError,
  shouldTripImmediately,
  ErrorClassification,
} from '../types/shared/errors.js';

// Re-export types for backward compatibility
export type CircuitBreakerState = Domains.ICircuitBreakerState['state'];
export type CircuitBreakerConfig = Domains.ICircuitBreakerConfig;
export type CircuitBreakerMetrics = Domains.ICircuitBreakerMetrics;
export type CircuitBreakerResult<T> = Domains.ICircuitBreakerResult<T>;

// Re-export state values
export const CircuitBreakerStateValues = Domains.ICircuitBreakerStateValues;

export class CircuitBreaker {
  private state: Domains.ICircuitBreakerState;
  private metrics: Domains.ICircuitBreakerMetrics;

  constructor(
    private providerId: string,
    private config: Domains.ICircuitBreakerConfig
  ) {
    this.state = {
      state: 'closed',
      failures: 0,
      lastFailureTime: 0,
      nextAttemptTime: 0,
      requestCount: 0,
      successCount: 0,
      recentErrors: [],
    };

    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      circuitBreakerTrips: 0,
      stateTransitions: [],
      averageFailureRate: 0,
      lastStateChange: Date.now(),
    };
  }

  public async execute<T>(operation: () => Promise<T>): Promise<Domains.ICircuitBreakerResult<T>> {
    const startTime = Date.now();

    if (!this.config.enabled) {
      try {
        const data = await operation();
        return {
          success: true,
          data,
          state: this.state.state,
          executionTime: Date.now() - startTime,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          state: this.state.state,
          executionTime: Date.now() - startTime,
        };
      }
    }

    this.cleanupOldErrors();

    if (this.state.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.transitionTo('half-open', 'Reset timeout reached');
      } else {
        return {
          success: false,
          error: `Circuit breaker OPEN for provider ${this.providerId}`,
          state: this.state.state,
          executionTime: Date.now() - startTime,
          retryAfter: this.state.nextAttemptTime - Date.now(),
        };
      }
    }

    this.state.requestCount++;
    this.metrics.totalRequests++;

    try {
      const data = await operation();
      const executionTime = Date.now() - startTime;

      this.onSuccess();

      return {
        success: true,
        data,
        state: this.state.state,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.onFailure(errorMessage);

      return {
        success: false,
        error: errorMessage,
        state: this.state.state,
        executionTime,
      };
    }
  }

  private onSuccess(): void {
    this.state.successCount++;
    this.metrics.successfulRequests++;

    if (this.state.state === 'half-open') {
      // Reset to closed after successful requests in half-open
      this.transitionTo('closed', 'Successful recovery');
    }

    this.updateFailureRate();
  }

  private onFailure(error: string): void {
    const now = Date.now();

    this.state.failures++;
    this.state.lastFailureTime = now;
    this.metrics.failedRequests++;

    // Classify the error to determine if immediate action is needed
    const errorClassification = classifyError(new Error(error));

    // Record the error with classification
    this.state.recentErrors.push({
      timestamp: now,
      error,
      classification: errorClassification,
    });

    this.updateFailureRate();

    // Check for immediate trip conditions only if permanent failure handling is enabled
    if (
      this.config.permanentFailureHandling?.enabled &&
      this.shouldTripImmediatelyForError(error, errorClassification)
    ) {
      log.warn(
        `Immediate circuit breaker trip for ${this.providerId}: ${errorClassification} error - ${error}`
      );
      this.transitionTo('open', `Immediate failure: ${errorClassification}`);
      this.metrics.circuitBreakerTrips++;
      return;
    }

    // Standard failure threshold check for retryable errors
    if (this.shouldTrip()) {
      this.transitionTo('open', 'Failure threshold exceeded');
      this.metrics.circuitBreakerTrips++;
    }
  }

  private shouldTripImmediatelyForError(error: string, classification: string): boolean {
    const pfConfig = this.config.permanentFailureHandling;
    if (!pfConfig?.enabled) {
      return false;
    }

    // If custom error patterns are specified, use those exclusively
    if (pfConfig.errorPatterns && pfConfig.errorPatterns.length > 0) {
      const compiledPatterns = pfConfig.errorPatterns.map((pattern) => new RegExp(pattern, 'i'));
      return compiledPatterns.some((pattern) => pattern.test(error));
    }

    // Otherwise, use default classification-based logic
    return shouldTripImmediately(classification as ErrorClassification);
  }

  private shouldTrip(): boolean {
    // Need minimum requests before considering tripping
    if (this.state.requestCount < this.config.minRequestsThreshold) {
      return false;
    }

    // Check failure rate
    const failureRate = this.state.failures / this.state.requestCount;
    return failureRate >= this.config.errorThresholdPercentage / 100;
  }

  private shouldAttemptReset(): boolean {
    return Date.now() >= this.state.nextAttemptTime;
  }

  private transitionTo(newState: Domains.ICircuitBreakerState['state'], reason: string): void {
    const oldState = this.state.state;
    const now = Date.now();

    this.state.state = newState;
    this.metrics.lastStateChange = now;

    this.metrics.stateTransitions.push({
      from: oldState,
      to: newState,
      timestamp: now,
      reason,
    });

    // Prevent unbounded growth of state transitions array
    if (this.metrics.stateTransitions.length > 100) {
      this.metrics.stateTransitions = this.metrics.stateTransitions.slice(-50);
    }

    if (newState === 'open') {
      // Use configurable settings for permanent failures
      const isImmediateFailure = reason.includes('Immediate failure');
      let resetTimeout = this.config.resetTimeout;

      if (isImmediateFailure && this.config.permanentFailureHandling?.enabled) {
        const pfConfig = this.config.permanentFailureHandling;

        // Exponential backoff for permanent failures using configurable settings
        const backoffMultiplier = Math.min(
          this.metrics.circuitBreakerTrips,
          pfConfig.maxBackoffMultiplier
        );
        const baseTimeout = Math.max(
          this.config.resetTimeout * pfConfig.timeoutMultiplier,
          pfConfig.baseTimeoutMs
        );
        resetTimeout = baseTimeout * Math.pow(2, backoffMultiplier);

        log.warn(
          `Circuit breaker OPEN for ${this.providerId}: ${Math.round(resetTimeout / 60000)}min timeout (permanent failure #${this.metrics.circuitBreakerTrips + 1})`
        );
      } else {
        log.info(
          `Circuit breaker OPEN for ${this.providerId}: ${Math.round(resetTimeout / 1000)}s timeout (temporary failure)`
        );
      }

      this.state.nextAttemptTime = now + resetTimeout;
    } else if (newState === 'closed') {
      // Reset counters when closing
      this.state.failures = 0;
      this.state.requestCount = 0;
      this.state.successCount = 0;
    }

    log.info(
      `Circuit breaker for ${this.providerId} transitioned from ${oldState} to ${newState}: ${reason}`
    );
  }

  private cleanupOldErrors(): void {
    const cutoff = Date.now() - this.config.monitoringWindow;
    const oldLength = this.state.recentErrors.length;
    
    // Filter out old errors and limit total array size to prevent memory leaks
    this.state.recentErrors = this.state.recentErrors
      .filter((error) => error.timestamp > cutoff)
      .slice(-100); // Keep maximum 100 recent errors to prevent unbounded growth
    
    // Log cleanup if significant reduction occurred
    if (oldLength > 50 && this.state.recentErrors.length < oldLength * 0.8) {
      log.debug(`Circuit breaker ${this.providerId} cleaned up ${oldLength - this.state.recentErrors.length} old errors`);
    }
  }

  private updateFailureRate(): void {
    if (this.state.requestCount > 0) {
      this.metrics.averageFailureRate = this.state.failures / this.state.requestCount;
    }
  }

  public getState(): Domains.ICircuitBreakerState {
    return { ...this.state };
  }

  public getMetrics(): Domains.ICircuitBreakerMetrics {
    return { ...this.metrics };
  }

  public reset(): void {
    this.transitionTo('closed', 'Manual reset');
    this.state.failures = 0;
    this.state.requestCount = 0;
    this.state.successCount = 0;
    this.state.recentErrors = [];
    
    // Also clean up old state transition history to prevent memory leaks
    if (this.metrics.stateTransitions.length > 50) {
      this.metrics.stateTransitions = this.metrics.stateTransitions.slice(-25);
      log.debug(`Circuit breaker ${this.providerId} cleaned up old state transitions`);
    }
  }

  public isHealthy(): boolean {
    return this.state.state !== 'open';
  }

  // Backward compatibility methods
  public isAvailable(): boolean {
    return this.isHealthy();
  }
}
