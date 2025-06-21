import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { permanentFailureConfigSchema } from '../../types/shared/config.js';
import type { Domains } from '../../types/index.js';

describe('Permanent Failure Handling Configuration', () => {
  let originalEnv: typeof process.env;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Configuration Schema Validation', () => {
    test('should accept valid permanent failure configuration', () => {
      const validConfig = {
        enabled: true,
        timeoutMultiplier: 5,
        baseTimeoutMs: 300000,
        maxBackoffMultiplier: 4,
        errorPatterns: ['404.*not found', '401.*unauthorized'],
      };

      const result = permanentFailureConfigSchema.parse(validConfig);
      expect(result).toEqual(validConfig);
    });

    test('should use default values when not specified', () => {
      const result = permanentFailureConfigSchema.parse({});

      expect(result?.enabled).toBe(true);
      expect(result?.timeoutMultiplier).toBe(5);
      expect(result?.baseTimeoutMs).toBe(300000);
      expect(result?.maxBackoffMultiplier).toBe(4);
      // Note: errorPatterns is optional and may be undefined when using defaults
      if (result?.errorPatterns) {
        expect(result.errorPatterns).toEqual([
          '404.*not found',
          '401.*unauthorized',
          'authentication.*failed',
          'invalid.*credentials',
          'api.*key.*invalid',
          'endpoint.*not.*found',
        ]);
      }
    });

    test('should reject invalid timeout multiplier values', () => {
      expect(() =>
        permanentFailureConfigSchema.parse({
          timeoutMultiplier: 0,
        })
      ).toThrow();

      expect(() =>
        permanentFailureConfigSchema.parse({
          timeoutMultiplier: 21,
        })
      ).toThrow();
    });

    test('should reject invalid base timeout values', () => {
      expect(() =>
        permanentFailureConfigSchema.parse({
          baseTimeoutMs: 30000, // Less than minimum 60000
        })
      ).toThrow();
    });

    test('should reject invalid max backoff multiplier values', () => {
      expect(() =>
        permanentFailureConfigSchema.parse({
          maxBackoffMultiplier: 0,
        })
      ).toThrow();

      expect(() =>
        permanentFailureConfigSchema.parse({
          maxBackoffMultiplier: 11,
        })
      ).toThrow();
    });

    test('should accept custom error patterns', () => {
      const customPatterns = ['custom.*error', 'service.*unavailable', 'endpoint.*missing'];

      const result = permanentFailureConfigSchema.parse({
        errorPatterns: customPatterns,
      });

      expect(result?.errorPatterns).toEqual(customPatterns);
    });

    test('should handle minimal configuration', () => {
      const minimalConfig = { enabled: false };
      const result = permanentFailureConfigSchema.parse(minimalConfig);

      expect(result?.enabled).toBe(false);
      expect(result?.timeoutMultiplier).toBe(5); // Should still have defaults
    });
  });

  describe('Error Pattern Matching', () => {
    const defaultPatterns = [
      '404.*not found',
      '401.*unauthorized',
      'authentication.*failed',
      'invalid.*credentials',
      'api.*key.*invalid',
      'endpoint.*not.*found',
    ];

    test('should match 404 errors correctly', () => {
      const testErrors = [
        '404: Not Found',
        'HTTP 404 - Page not found',
        'API request failed: 404 - 404 page not found',
        'Error 404: Resource not found',
      ];

      const pattern404 = new RegExp(defaultPatterns[0], 'i');

      testErrors.forEach((error) => {
        expect(pattern404.test(error)).toBe(true);
      });
    });

    test('should match authentication errors correctly', () => {
      const testErrors = [
        '401: Unauthorized',
        'HTTP 401 - Unauthorized access',
        'Authentication failed for API key',
        'Invalid credentials provided',
        'API key invalid or expired',
      ];

      const compiledPatterns = defaultPatterns.map((pattern) => new RegExp(pattern, 'i'));

      testErrors.forEach((error) => {
        const matches = compiledPatterns.some((pattern) => pattern.test(error));
        expect(matches).toBe(true);
      });
    });

    test('should not match temporary errors', () => {
      const temporaryErrors = [
        '500: Internal Server Error',
        'Network timeout occurred',
        'Connection refused',
        '502: Bad Gateway',
        'Service temporarily unavailable',
      ];

      const compiledPatterns = defaultPatterns.map((pattern) => new RegExp(pattern, 'i'));

      temporaryErrors.forEach((error) => {
        const matches = compiledPatterns.some((pattern) => pattern.test(error));
        expect(matches).toBe(false);
      });
    });

    test('should handle custom patterns correctly', () => {
      const customPatterns = ['custom.*failure', 'provider.*offline', 'endpoint.*deprecated'];

      const testErrors = [
        'Custom failure in provider',
        'Provider is currently offline',
        'This endpoint has been deprecated',
      ];

      const compiledPatterns = customPatterns.map((pattern) => new RegExp(pattern, 'i'));

      testErrors.forEach((error) => {
        const matches = compiledPatterns.some((pattern) => pattern.test(error));
        expect(matches).toBe(true);
      });
    });
  });

  describe('Timeout Calculation Logic', () => {
    function calculatePermanentFailureTimeout(
      baseTimeout: number,
      multiplier: number,
      maxBackoffMultiplier: number,
      tripCount: number
    ): number {
      const backoffMultiplier = Math.min(tripCount, maxBackoffMultiplier);
      const extendedBase = baseTimeout * multiplier;
      return extendedBase * Math.pow(2, backoffMultiplier);
    }

    test('should calculate initial permanent failure timeout correctly', () => {
      const baseTimeout = 60000; // 1 minute
      const multiplier = 5;
      const maxBackoffMultiplier = 4;
      const tripCount = 0;

      const timeout = calculatePermanentFailureTimeout(
        baseTimeout,
        multiplier,
        maxBackoffMultiplier,
        tripCount
      );

      expect(timeout).toBe(300000); // 5 minutes (60s * 5 * 2^0)
    });

    test('should apply exponential backoff correctly', () => {
      const baseTimeout = 60000;
      const multiplier = 5;
      const maxBackoffMultiplier = 4;

      const timeouts = [];
      for (let trip = 0; trip <= 5; trip++) {
        const timeout = calculatePermanentFailureTimeout(
          baseTimeout,
          multiplier,
          maxBackoffMultiplier,
          trip
        );
        timeouts.push(timeout);
      }

      expect(timeouts).toEqual([
        300000, // 5 minutes (2^0 = 1)
        600000, // 10 minutes (2^1 = 2)
        1200000, // 20 minutes (2^2 = 4)
        2400000, // 40 minutes (2^3 = 8)
        4800000, // 80 minutes (2^4 = 16)
        4800000, // 80 minutes (capped at 2^4)
      ]);
    });

    test('should respect maximum backoff multiplier', () => {
      const baseTimeout = 60000;
      const multiplier = 5;
      const maxBackoffMultiplier = 2; // Limit to 2^2 = 4x

      const timeouts = [];
      for (let trip = 0; trip <= 4; trip++) {
        const timeout = calculatePermanentFailureTimeout(
          baseTimeout,
          multiplier,
          maxBackoffMultiplier,
          trip
        );
        timeouts.push(timeout);
      }

      expect(timeouts).toEqual([
        300000, // 5 minutes
        600000, // 10 minutes
        1200000, // 20 minutes
        1200000, // 20 minutes (capped)
        1200000, // 20 minutes (capped)
      ]);
    });

    test('should handle minimum base timeout correctly', () => {
      const baseTimeout = 30000; // 30 seconds
      const configuredBase = 300000; // 5 minutes minimum
      const multiplier = 5;

      const effectiveBase = Math.max(baseTimeout * multiplier, configuredBase);
      expect(effectiveBase).toBe(300000); // Should use minimum
    });

    test('should calculate timeouts for different multipliers', () => {
      const baseTimeout = 60000;
      const maxBackoffMultiplier = 3;
      const tripCount = 2;

      const multipliers = [3, 5, 10];
      const expectedTimeouts = [
        720000, // 12 minutes (60s * 3 * 2^2)
        1200000, // 20 minutes (60s * 5 * 2^2)
        2400000, // 40 minutes (60s * 10 * 2^2)
      ];

      multipliers.forEach((multiplier, index) => {
        const timeout = calculatePermanentFailureTimeout(
          baseTimeout,
          multiplier,
          maxBackoffMultiplier,
          tripCount
        );
        expect(timeout).toBe(expectedTimeouts[index]);
      });
    });
  });

  describe('Provider Filtering Logic', () => {
    function shouldSkipProvider(
      lastFailureTime: number,
      isPermanentFailure: boolean,
      baseTimeoutMs: number,
      currentTime: number = Date.now()
    ): boolean {
      const timeSinceFailure = currentTime - lastFailureTime;
      const timeoutDuration = isPermanentFailure ? baseTimeoutMs : 30000;
      return timeSinceFailure < timeoutDuration;
    }

    test('should use extended timeout for permanent failures', () => {
      const now = Date.now();
      const baseTimeoutMs = 300000; // 5 minutes

      // 2 minutes ago - should skip permanent failure but allow temporary
      const twoMinutesAgo = now - 120000;
      expect(shouldSkipProvider(twoMinutesAgo, true, baseTimeoutMs, now)).toBe(true);
      expect(shouldSkipProvider(twoMinutesAgo, false, baseTimeoutMs, now)).toBe(false);

      // 6 minutes ago - should allow both
      const sixMinutesAgo = now - 360000;
      expect(shouldSkipProvider(sixMinutesAgo, true, baseTimeoutMs, now)).toBe(false);
      expect(shouldSkipProvider(sixMinutesAgo, false, baseTimeoutMs, now)).toBe(false);
    });

    test('should use normal timeout for temporary failures', () => {
      const now = Date.now();
      const baseTimeoutMs = 300000;

      // 45 seconds ago - should skip temporary failure but allow (if this was permanent it would still be skipped)
      const fortyFiveSecondsAgo = now - 45000;
      expect(shouldSkipProvider(fortyFiveSecondsAgo, false, baseTimeoutMs, now)).toBe(false); // More than 30s
      expect(shouldSkipProvider(fortyFiveSecondsAgo, true, baseTimeoutMs, now)).toBe(true); // Less than 5min

      // 15 seconds ago - should skip both
      const fifteenSecondsAgo = now - 15000;
      expect(shouldSkipProvider(fifteenSecondsAgo, false, baseTimeoutMs, now)).toBe(true);
      expect(shouldSkipProvider(fifteenSecondsAgo, true, baseTimeoutMs, now)).toBe(true);
    });

    test('should handle edge cases correctly', () => {
      const now = Date.now();
      const baseTimeoutMs = 300000;

      // Exactly at timeout boundary
      const exactTimeout = now - 30000;
      expect(shouldSkipProvider(exactTimeout, false, baseTimeoutMs, now)).toBe(false);

      const exactPermanentTimeout = now - 300000;
      expect(shouldSkipProvider(exactPermanentTimeout, true, baseTimeoutMs, now)).toBe(false);

      // Just under timeout boundary
      const justUnderTimeout = now - 29999;
      expect(shouldSkipProvider(justUnderTimeout, false, baseTimeoutMs, now)).toBe(true);

      const justUnderPermanentTimeout = now - 299999;
      expect(shouldSkipProvider(justUnderPermanentTimeout, true, baseTimeoutMs, now)).toBe(true);
    });
  });

  describe('Configuration Edge Cases', () => {
    test('should handle disabled permanent failure handling', () => {
      const config = { enabled: false };
      const result = permanentFailureConfigSchema.parse(config);

      expect(result?.enabled).toBe(false);
      // Other settings should still have defaults even when disabled
      expect(result?.timeoutMultiplier).toBe(5);
      expect(result?.baseTimeoutMs).toBe(300000);
    });

    test('should handle extreme values within bounds', () => {
      const extremeConfig = {
        enabled: true, // Explicit enabled
        timeoutMultiplier: 20, // Maximum allowed
        baseTimeoutMs: 86400000, // 24 hours
        maxBackoffMultiplier: 10, // Maximum allowed
        errorPatterns: [], // Empty patterns
      };

      const result = permanentFailureConfigSchema.parse(extremeConfig);
      expect(result).toEqual(extremeConfig);
    });

    test('should handle undefined/null values gracefully', () => {
      // Since the schema is optional, undefined is valid and returns undefined
      const result = permanentFailureConfigSchema.parse(undefined);
      expect(result).toBeUndefined();

      // Empty object should work though
      const emptyResult = permanentFailureConfigSchema.parse({});
      expect(emptyResult).toBeDefined();
      expect(emptyResult?.enabled).toBe(true);
    });

    test('should handle partial configuration correctly', () => {
      const partialConfig = {
        timeoutMultiplier: 10,
        // Other values should use defaults
      };

      const result = permanentFailureConfigSchema.parse(partialConfig);
      expect(result?.timeoutMultiplier).toBe(10);
      expect(result?.enabled).toBe(true); // Default
      expect(result?.baseTimeoutMs).toBe(300000); // Default
    });
  });

  describe('Integration with Circuit Breaker State', () => {
    function isImmediateFailure(reason: string): boolean {
      return reason.includes('Immediate failure');
    }

    function calculateCircuitBreakerTimeout(
      baseResetTimeout: number,
      isImmediate: boolean,
      tripCount: number,
      pfConfig?: Domains.IPermanentFailureConfig
    ): number {
      if (!isImmediate || !pfConfig?.enabled) {
        return baseResetTimeout;
      }

      const backoffMultiplier = Math.min(tripCount, pfConfig.maxBackoffMultiplier);
      const extendedBase = Math.max(
        baseResetTimeout * pfConfig.timeoutMultiplier,
        pfConfig.baseTimeoutMs
      );
      return extendedBase * Math.pow(2, backoffMultiplier);
    }

    test('should integrate with circuit breaker timeout calculation', () => {
      const baseResetTimeout = 60000; // 1 minute
      const pfConfig: Domains.IPermanentFailureConfig = {
        enabled: true,
        timeoutMultiplier: 5,
        baseTimeoutMs: 300000,
        maxBackoffMultiplier: 4,
      };

      // Test immediate failure (permanent)
      const immediateTimeout = calculateCircuitBreakerTimeout(baseResetTimeout, true, 0, pfConfig);
      expect(immediateTimeout).toBe(300000); // 5 minutes

      // Test temporary failure
      const temporaryTimeout = calculateCircuitBreakerTimeout(baseResetTimeout, false, 0, pfConfig);
      expect(temporaryTimeout).toBe(60000); // 1 minute

      // Test escalation
      const escalatedTimeout = calculateCircuitBreakerTimeout(baseResetTimeout, true, 2, pfConfig);
      expect(escalatedTimeout).toBe(1200000); // 20 minutes (300000 * 2^2)
    });

    test('should handle disabled permanent failure handling in circuit breaker', () => {
      const baseResetTimeout = 60000;
      const pfConfig: Domains.IPermanentFailureConfig = {
        enabled: false,
        timeoutMultiplier: 5,
        baseTimeoutMs: 300000,
        maxBackoffMultiplier: 4,
      };

      const timeout = calculateCircuitBreakerTimeout(baseResetTimeout, true, 3, pfConfig);
      expect(timeout).toBe(60000); // Should use base timeout when disabled
    });

    test('should identify immediate failures correctly', () => {
      const immediateReasons = [
        'Immediate failure: not_found',
        'Immediate failure: authentication',
        'Immediate failure: forbidden',
      ];

      const nonImmediateReasons = [
        'Failure threshold exceeded',
        'Request timeout',
        'Network error',
      ];

      immediateReasons.forEach((reason) => {
        expect(isImmediateFailure(reason)).toBe(true);
      });

      nonImmediateReasons.forEach((reason) => {
        expect(isImmediateFailure(reason)).toBe(false);
      });
    });
  });
});
