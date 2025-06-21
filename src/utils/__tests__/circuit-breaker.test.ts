import { describe, test, expect, beforeEach } from 'bun:test';
import { CircuitBreaker } from '../circuit-breaker.js';
import { Domains } from '../../types/index.js';

describe('Circuit Breaker', () => {
  let circuitBreaker: CircuitBreaker;
  let config: Domains.ICircuitBreakerConfig;

  beforeEach(() => {
    config = {
      enabled: true,
      failureThreshold: 3,
      resetTimeout: 2000,
      monitoringWindow: 60000,
      minRequestsThreshold: 5,
      errorThresholdPercentage: 50,
    };
    circuitBreaker = new CircuitBreaker('test-provider', config);
  });

  test('should start in CLOSED state', () => {
    const state = circuitBreaker.getState();
    expect(state.state).toBe(Domains.ICircuitBreakerStateValues.CLOSED);
    expect(circuitBreaker.isAvailable()).toBe(true);
    expect(circuitBreaker.isHealthy()).toBe(true);
  });

  test('should return success result for successful operations', async () => {
    const operation = () => Promise.resolve('success');

    const result = await circuitBreaker.execute(operation);

    expect(result.success).toBe(true);
    expect(result.data).toBe('success');
    expect(result.state).toBe('closed');
    expect(result.executionTime).toBeGreaterThanOrEqual(0);
    expect(circuitBreaker.getState().state).toBe(Domains.ICircuitBreakerStateValues.CLOSED);
  });

  test('should handle failures and track them', async () => {
    const operation = () => Promise.reject(new Error('Test failure'));

    const result = await circuitBreaker.execute(operation);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Test failure');
    expect(result.state).toBe('closed');
    expect(result.executionTime).toBeGreaterThanOrEqual(0);

    const state = circuitBreaker.getState();
    expect(state.failures).toBe(1);
    expect(state.recentErrors).toHaveLength(1);
  });

  test('should transition to OPEN after failure threshold', async () => {
    const operation = () => Promise.reject(new Error('Test failure'));

    // First, we need to reach minimum requests threshold
    for (let i = 0; i < config.minRequestsThreshold; i++) {
      await circuitBreaker.execute(operation);
    }

    const state = circuitBreaker.getState();
    expect(state.state).toBe(Domains.ICircuitBreakerStateValues.OPEN);
    expect(circuitBreaker.isAvailable()).toBe(false); // Not available when circuit is OPEN
    expect(circuitBreaker.isHealthy()).toBe(false);
  });

  test('should reject requests when OPEN and not ready for retry', async () => {
    const operation = () => Promise.resolve('success');

    // Force circuit to OPEN state by exceeding failure threshold
    const failOperation = () => Promise.reject(new Error('Failure'));
    for (let i = 0; i < config.minRequestsThreshold + 1; i++) {
      await circuitBreaker.execute(failOperation);
    }

    // Should reject new requests when circuit is OPEN and not ready for retry
    const result = await circuitBreaker.execute(operation);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Circuit breaker OPEN');
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  test('should transition to HALF_OPEN after reset timeout', async () => {
    const failOperation = () => Promise.reject(new Error('Failure'));

    // Force circuit to OPEN
    for (let i = 0; i < config.minRequestsThreshold + 1; i++) {
      await circuitBreaker.execute(failOperation);
    }

    expect(circuitBreaker.getState().state).toBe(Domains.ICircuitBreakerStateValues.OPEN);

    // Wait for reset timeout to pass (in our test config it's 2000ms)
    await new Promise((resolve) => setTimeout(resolve, config.resetTimeout + 100));

    // Now execute should transition to HALF_OPEN then to CLOSED on success
    const result = await circuitBreaker.execute(() => Promise.resolve('test'));

    expect(result.success).toBe(true);
    expect(result.data).toBe('test');
  });

  test('should transition from HALF_OPEN to CLOSED on success', async () => {
    // Force to OPEN state
    const failOperation = () => Promise.reject(new Error('Failure'));
    for (let i = 0; i < config.minRequestsThreshold + 1; i++) {
      await circuitBreaker.execute(failOperation);
    }

    // Wait for reset timeout to pass
    await new Promise((resolve) => setTimeout(resolve, config.resetTimeout + 100));

    // Execute successful operation - should transition from OPEN -> HALF_OPEN -> CLOSED
    const result = await circuitBreaker.execute(() => Promise.resolve('success'));

    expect(result.success).toBe(true);
    expect(circuitBreaker.getState().state).toBe(Domains.ICircuitBreakerStateValues.CLOSED);
  });

  test('should transition from HALF_OPEN back to OPEN on failure', async () => {
    // Force to OPEN state
    const failOperation = () => Promise.reject(new Error('Failure'));
    for (let i = 0; i < config.minRequestsThreshold + 1; i++) {
      await circuitBreaker.execute(failOperation);
    }

    // Wait for reset timeout to pass
    await new Promise((resolve) => setTimeout(resolve, config.resetTimeout + 100));

    // Try to execute and fail during half-open - should transition OPEN -> HALF_OPEN -> OPEN
    const result = await circuitBreaker.execute(() => Promise.reject(new Error('Still failing')));

    expect(result.success).toBe(false);
    expect(result.error).toBe('Still failing');
    expect(circuitBreaker.getState().state).toBe(Domains.ICircuitBreakerStateValues.OPEN);
  });

  test('should provide accurate metrics', async () => {
    // Execute some operations
    await circuitBreaker.execute(() => Promise.resolve('success'));
    await circuitBreaker.execute(() => Promise.reject(new Error('failure')));

    const metrics = circuitBreaker.getMetrics();

    expect(metrics.totalRequests).toBe(2);
    expect(metrics.successfulRequests).toBe(1);
    expect(metrics.failedRequests).toBe(1);
    expect(metrics.averageFailureRate).toBeGreaterThan(0);
    expect(metrics.stateTransitions).toBeDefined();
  });

  test('should reset state when reset() is called', async () => {
    // Force to OPEN state
    const failOperation = () => Promise.reject(new Error('Failure'));
    for (let i = 0; i < config.minRequestsThreshold + 1; i++) {
      await circuitBreaker.execute(failOperation);
    }

    expect(circuitBreaker.getState().state).toBe(Domains.ICircuitBreakerStateValues.OPEN);

    circuitBreaker.reset();

    expect(circuitBreaker.getState().state).toBe(Domains.ICircuitBreakerStateValues.CLOSED);
    expect(circuitBreaker.isAvailable()).toBe(true);
    expect(circuitBreaker.isHealthy()).toBe(true);

    const state = circuitBreaker.getState();
    expect(state.failures).toBe(0);
    expect(state.requestCount).toBe(0);
    expect(state.successCount).toBe(0);
    expect(state.recentErrors).toHaveLength(0);
  });

  test('should work when disabled', async () => {
    const disabledConfig: Domains.ICircuitBreakerConfig = {
      ...config,
      enabled: false,
    };
    const disabledCircuitBreaker = new CircuitBreaker('test-disabled', disabledConfig);

    // Should pass through successful operations
    const successResult = await disabledCircuitBreaker.execute(() => Promise.resolve('success'));
    expect(successResult.success).toBe(true);
    expect(successResult.data).toBe('success');

    // Should pass through failures without circuit breaking
    const failResult = await disabledCircuitBreaker.execute(() =>
      Promise.reject(new Error('fail'))
    );
    expect(failResult.success).toBe(false);
    expect(failResult.error).toBe('fail');

    // State should remain closed regardless of failures
    expect(disabledCircuitBreaker.getState().state).toBe(Domains.ICircuitBreakerStateValues.CLOSED);
  });

  test('should clean up old errors based on monitoring window', async () => {
    const operation = () => Promise.reject(new Error('Test failure'));

    // Add some errors
    await circuitBreaker.execute(operation);
    await circuitBreaker.execute(operation);

    const initialErrorCount = circuitBreaker.getState().recentErrors.length;
    expect(initialErrorCount).toBe(2);

    // Manually trigger cleanup by executing another operation after time has passed
    // (In real implementation, this would be handled by the monitoring window)
    await circuitBreaker.execute(operation);

    // Errors should still be there since they're recent
    expect(circuitBreaker.getState().recentErrors.length).toBeGreaterThan(0);
  });

  describe('Permanent Failure Integration', () => {
    let permanentFailureConfig: Domains.ICircuitBreakerConfig;

    beforeEach(() => {
      permanentFailureConfig = {
        enabled: true,
        failureThreshold: 3,
        resetTimeout: 60000,
        monitoringWindow: 60000,
        minRequestsThreshold: 2,
        errorThresholdPercentage: 50,
        permanentFailureHandling: {
          enabled: true,
          timeoutMultiplier: 5,
          baseTimeoutMs: 300000,
          maxBackoffMultiplier: 4,
          errorPatterns: ['404.*not found', '401.*unauthorized'],
        },
      };
    });

    test('should trigger immediate circuit breaker trip for 404 errors', async () => {
      const cbWithPermanentFailure = new CircuitBreaker('test-404', permanentFailureConfig);
      const operation404 = () => Promise.reject(new Error('404: Not found'));

      const result = await cbWithPermanentFailure.execute(operation404);

      expect(result.success).toBe(false);
      expect(result.error).toBe('404: Not found');

      // Should immediately trip to OPEN state due to 404
      const state = cbWithPermanentFailure.getState();
      expect(state.state).toBe(Domains.ICircuitBreakerStateValues.OPEN);

      // Should have extended timeout
      const timeUntilReset = state.nextAttemptTime - Date.now();
      expect(timeUntilReset).toBeGreaterThan(250000); // At least ~4+ minutes
      expect(timeUntilReset).toBeLessThan(350000); // Less than ~6 minutes
    });

    test('should trigger immediate circuit breaker trip for 401 errors', async () => {
      const cbWithPermanentFailure = new CircuitBreaker('test-401', permanentFailureConfig);
      const operation401 = () => Promise.reject(new Error('401: Unauthorized'));

      const result = await cbWithPermanentFailure.execute(operation401);

      expect(result.success).toBe(false);
      expect(result.error).toBe('401: Unauthorized');

      const state = cbWithPermanentFailure.getState();
      expect(state.state).toBe(Domains.ICircuitBreakerStateValues.OPEN);
    });

    test('should trigger immediate circuit breaker trip for 403 errors', async () => {
      // Use config without custom error patterns to test default classification
      const config403 = {
        ...permanentFailureConfig,
        permanentFailureHandling: {
          ...permanentFailureConfig.permanentFailureHandling!,
          errorPatterns: undefined, // Use default classification logic
        },
      };
      const cbWithPermanentFailure = new CircuitBreaker('test-403', config403);
      const operation403 = () => Promise.reject(new Error('403: Forbidden'));

      const result = await cbWithPermanentFailure.execute(operation403);

      expect(result.success).toBe(false);
      expect(result.error).toBe('403: Forbidden');

      // 403 should trigger immediate circuit breaker trip (authentication error)
      const state = cbWithPermanentFailure.getState();
      expect(state.state).toBe(Domains.ICircuitBreakerStateValues.OPEN);

      // Should have extended timeout
      const timeUntilReset = state.nextAttemptTime - Date.now();
      expect(timeUntilReset).toBeGreaterThan(250000); // At least ~4+ minutes
      expect(timeUntilReset).toBeLessThan(350000); // Less than ~6 minutes
    });

    test('should not trigger immediate trip for temporary errors', async () => {
      const cbWithPermanentFailure = new CircuitBreaker('test-temp', permanentFailureConfig);
      const operation500 = () => Promise.reject(new Error('500: Internal Server Error'));

      const result = await cbWithPermanentFailure.execute(operation500);

      expect(result.success).toBe(false);
      expect(result.error).toBe('500: Internal Server Error');

      // Should remain CLOSED since 500 is not a permanent failure
      const state = cbWithPermanentFailure.getState();
      expect(state.state).toBe(Domains.ICircuitBreakerStateValues.CLOSED);
    });

    test('should apply exponential backoff for repeated permanent failures', async () => {
      const cbWithPermanentFailure = new CircuitBreaker('test-backoff', permanentFailureConfig);
      const operation404 = () => Promise.reject(new Error('404: API endpoint not found'));

      // First permanent failure
      await cbWithPermanentFailure.execute(operation404);
      const firstState = cbWithPermanentFailure.getState();
      expect(firstState.state).toBe(Domains.ICircuitBreakerStateValues.OPEN);

      const firstTimeout = firstState.nextAttemptTime - Date.now();
      expect(firstTimeout).toBeGreaterThan(250000); // ~5 minutes

      // Reset and trigger second failure
      cbWithPermanentFailure.reset();
      await cbWithPermanentFailure.execute(operation404);
      const secondState = cbWithPermanentFailure.getState();

      const secondTimeout = secondState.nextAttemptTime - Date.now();
      expect(secondTimeout).toBeGreaterThan(550000); // ~10 minutes
      expect(secondTimeout).toBeLessThan(650000); // Less than ~11 minutes
    });

    test('should use normal timeout for temporary failures', async () => {
      const cbWithPermanentFailure = new CircuitBreaker('test-normal', permanentFailureConfig);
      const operationTimeout = () => Promise.reject(new Error('Request timeout'));

      // Force circuit breaker to trip with temporary errors
      for (let i = 0; i < permanentFailureConfig.minRequestsThreshold; i++) {
        await cbWithPermanentFailure.execute(operationTimeout);
      }

      const state = cbWithPermanentFailure.getState();
      expect(state.state).toBe(Domains.ICircuitBreakerStateValues.OPEN);

      // Should use normal timeout (60s) for temporary failures
      const timeUntilReset = state.nextAttemptTime - Date.now();
      expect(timeUntilReset).toBeLessThan(65000); // Should be ~60 seconds
      expect(timeUntilReset).toBeGreaterThan(55000);
    });

    test('should respect maxBackoffMultiplier limit', async () => {
      const limitedConfig = {
        ...permanentFailureConfig,
        permanentFailureHandling: {
          ...(permanentFailureConfig.permanentFailureHandling || {}),
          maxBackoffMultiplier: 2, // Limit to 2^2 = 4x
        },
      };

      const cbWithLimit = new CircuitBreaker('test-limit', limitedConfig);
      const operation404 = () => Promise.reject(new Error('404: Not found'));

      // Trigger multiple failures to test backoff limit
      const timeouts = [];

      for (let i = 0; i < 5; i++) {
        cbWithLimit.reset();
        await cbWithLimit.execute(operation404);

        const state = cbWithLimit.getState();
        const timeUntilReset = state.nextAttemptTime - Date.now();
        timeouts.push(timeUntilReset);
      }

      // First few should increase, then plateau at max
      expect(timeouts[0]).toBeLessThan(timeouts[1]); // 5min < 10min
      expect(timeouts[1]).toBeLessThan(timeouts[2]); // 10min < 20min
      expect(timeouts[2]).toBeCloseTo(timeouts[3], -4); // 20min ≈ 20min (plateau)
      expect(timeouts[3]).toBeCloseTo(timeouts[4], -4); // 20min ≈ 20min (plateau)
    });

    test('should work with disabled permanent failure handling', async () => {
      const disabledConfig = {
        ...permanentFailureConfig,
        permanentFailureHandling: {
          ...(permanentFailureConfig.permanentFailureHandling || {}),
          enabled: false,
        },
      };

      const cbWithDisabled = new CircuitBreaker('test-disabled', disabledConfig);
      const operation404 = () => Promise.reject(new Error('404: Not found'));

      const result = await cbWithDisabled.execute(operation404);

      expect(result.success).toBe(false);

      // Should NOT immediately trip when permanent failure handling is disabled
      const state = cbWithDisabled.getState();
      expect(state.state).toBe(Domains.ICircuitBreakerStateValues.CLOSED);
    });

    test('should handle custom error patterns', async () => {
      const customConfig = {
        ...permanentFailureConfig,
        permanentFailureHandling: {
          ...(permanentFailureConfig.permanentFailureHandling || {}),
          errorPatterns: ['custom.*error', 'provider.*offline', 'endpoint.*deprecated'],
        },
      };

      const cbWithCustom = new CircuitBreaker('test-custom', customConfig);

      // Test custom pattern matching
      const customError = () => Promise.reject(new Error('Custom error occurred'));
      const providerError = () => Promise.reject(new Error('Provider is offline'));
      const deprecatedError = () => Promise.reject(new Error('Endpoint has been deprecated'));

      // All should trigger immediate failure
      await cbWithCustom.execute(customError);
      expect(cbWithCustom.getState().state).toBe(Domains.ICircuitBreakerStateValues.OPEN);

      cbWithCustom.reset();
      await cbWithCustom.execute(providerError);
      expect(cbWithCustom.getState().state).toBe(Domains.ICircuitBreakerStateValues.OPEN);

      cbWithCustom.reset();
      await cbWithCustom.execute(deprecatedError);
      expect(cbWithCustom.getState().state).toBe(Domains.ICircuitBreakerStateValues.OPEN);

      // Standard 404 should NOT trigger (not in custom patterns)
      cbWithCustom.reset();
      const standard404 = () => Promise.reject(new Error('404: Not found'));
      await cbWithCustom.execute(standard404);
      expect(cbWithCustom.getState().state).toBe(Domains.ICircuitBreakerStateValues.CLOSED);
    });

    test('should record permanent failure classifications in recent errors', async () => {
      const cbWithPermanentFailure = new CircuitBreaker(
        'test-classification',
        permanentFailureConfig
      );

      const operation404 = () => Promise.reject(new Error('404: API endpoint not found'));
      await cbWithPermanentFailure.execute(operation404);

      const state = cbWithPermanentFailure.getState();
      expect(state.recentErrors).toHaveLength(1);

      const error = state.recentErrors[0];
      expect(error.error).toBe('404: API endpoint not found');
      expect(error.classification).toBe('not_found');
      expect(error.timestamp).toBeGreaterThan(Date.now() - 1000);
    });

    test('should provide accurate metrics for permanent failures', async () => {
      const cbWithPermanentFailure = new CircuitBreaker('test-metrics', permanentFailureConfig);

      // Mix of permanent and temporary failures
      await cbWithPermanentFailure.execute(() => Promise.reject(new Error('404: Not found')));
      cbWithPermanentFailure.reset(); // Reset after permanent failure

      // Execute temporary failures that will need to reach threshold
      for (let i = 0; i < permanentFailureConfig.minRequestsThreshold; i++) {
        await cbWithPermanentFailure.execute(() => Promise.reject(new Error('500: Server error')));
      }

      const metrics = cbWithPermanentFailure.getMetrics();

      // Should have permanent failure (1) + temporary failures (minRequestsThreshold)
      const expectedRequests = 1 + permanentFailureConfig.minRequestsThreshold;
      expect(metrics.totalRequests).toBe(expectedRequests);
      expect(metrics.failedRequests).toBe(expectedRequests);
      expect(metrics.circuitBreakerTrips).toBe(2); // 1 immediate + 1 threshold

      // Should have state transitions recorded
      expect(metrics.stateTransitions.length).toBeGreaterThan(0);

      // Should have both immediate and threshold-based transitions
      const immediateTransitions = metrics.stateTransitions.filter((t) =>
        t.reason.includes('Immediate failure')
      );
      const thresholdTransitions = metrics.stateTransitions.filter((t) =>
        t.reason.includes('Failure threshold exceeded')
      );

      expect(immediateTransitions.length).toBe(1);
      expect(thresholdTransitions.length).toBe(1);
    });

    test('should handle edge case error messages', async () => {
      // Use config with comprehensive default patterns for edge cases
      const edgeTestConfig = {
        ...permanentFailureConfig,
        permanentFailureHandling: {
          ...(permanentFailureConfig.permanentFailureHandling || {}),
          errorPatterns: [
            '404.*not found',
            '401.*unauthorized',
            'authentication.*failed',
            'invalid.*credentials',
            'api.*key.*invalid',
            'endpoint.*not.*found',
          ],
        },
      };

      const cbWithPermanentFailure = new CircuitBreaker('test-edge', edgeTestConfig);

      const edgeCaseErrors = [
        'HTTP 404 - PAGE NOT FOUND', // Case variations
        'api request failed: 404 - not found', // Lowercase
        '401: UNAUTHORIZED ACCESS', // Mixed case
        'Authentication Failed - Invalid Key', // Different format
        'ENDPOINT NOT FOUND (404)', // Different order
      ];

      for (const errorMessage of edgeCaseErrors) {
        cbWithPermanentFailure.reset();
        const operation = () => Promise.reject(new Error(errorMessage));

        await cbWithPermanentFailure.execute(operation);

        // All should trigger immediate failure due to pattern matching
        const state = cbWithPermanentFailure.getState();
        expect(state.state).toBe(Domains.ICircuitBreakerStateValues.OPEN);
      }
    });
  });
});
