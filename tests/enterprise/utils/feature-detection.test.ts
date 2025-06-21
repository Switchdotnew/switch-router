import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  RouterMode,
  getRouterMode,
  isEnterpriseMode,
  requireEnterprise,
  getInstanceId,
  validateEnterpriseEnvironment,
} from '../../../src/enterprise/utils/feature-detection.js';

describe('Feature Detection', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables for each test
    process.env = { ...originalEnv };
    delete process.env.SWITCH_MODE;
    delete process.env.INSTANCE_ID;
    delete process.env.REDIS_URL;
  });

  describe('getRouterMode', () => {
    it('should return LOCAL by default', () => {
      expect(getRouterMode()).toBe(RouterMode.LOCAL);
    });

    it('should return REMOTE when SWITCH_MODE=remote', () => {
      process.env.SWITCH_MODE = 'remote';
      expect(getRouterMode()).toBe(RouterMode.REMOTE);
    });

    it('should return REMOTE when SWITCH_MODE=REMOTE (case insensitive)', () => {
      process.env.SWITCH_MODE = 'REMOTE';
      expect(getRouterMode()).toBe(RouterMode.REMOTE);
    });

    it('should return LOCAL for invalid values', () => {
      process.env.SWITCH_MODE = 'invalid';
      expect(getRouterMode()).toBe(RouterMode.LOCAL);
    });
  });

  describe('isEnterpriseMode', () => {
    it('should return false by default', () => {
      expect(isEnterpriseMode()).toBe(false);
    });

    it('should return true when in remote mode', () => {
      process.env.SWITCH_MODE = 'remote';
      expect(isEnterpriseMode()).toBe(true);
    });
  });

  describe('requireEnterprise', () => {
    it('should not throw in enterprise mode', () => {
      process.env.SWITCH_MODE = 'remote';
      expect(() => requireEnterprise('test-feature')).not.toThrow();
    });

    it('should throw in local mode', () => {
      expect(() => requireEnterprise('test-feature')).toThrow(
        "Feature 'test-feature' requires enterprise mode"
      );
    });
  });

  describe('getInstanceId', () => {
    it('should return local-instance by default', () => {
      expect(getInstanceId()).toBe('local-instance');
    });

    it('should return environment value when set', () => {
      process.env.INSTANCE_ID = 'test-instance-123';
      expect(getInstanceId()).toBe('test-instance-123');
    });

    it('should throw in enterprise mode without INSTANCE_ID', () => {
      process.env.SWITCH_MODE = 'remote';
      expect(() => getInstanceId()).toThrow(
        'INSTANCE_ID environment variable is required in remote mode'
      );
    });

    it('should return instance ID in enterprise mode when set', () => {
      process.env.SWITCH_MODE = 'remote';
      process.env.INSTANCE_ID = 'enterprise-instance';
      expect(getInstanceId()).toBe('enterprise-instance');
    });
  });

  describe('validateEnterpriseEnvironment', () => {
    it('should pass validation in local mode', () => {
      expect(() => validateEnterpriseEnvironment()).not.toThrow();
    });

    it('should pass validation in enterprise mode with required env vars', () => {
      process.env.SWITCH_MODE = 'remote';
      process.env.INSTANCE_ID = 'test-instance';
      process.env.REDIS_URL = 'redis://localhost:6379';
      
      expect(() => validateEnterpriseEnvironment()).not.toThrow();
    });

    it('should throw when missing INSTANCE_ID in enterprise mode', () => {
      process.env.SWITCH_MODE = 'remote';
      process.env.REDIS_URL = 'redis://localhost:6379';
      
      expect(() => validateEnterpriseEnvironment()).toThrow(
        'Missing required environment variables for enterprise mode: INSTANCE_ID'
      );
    });

    it('should throw when missing REDIS_URL in enterprise mode', () => {
      process.env.SWITCH_MODE = 'remote';
      process.env.INSTANCE_ID = 'test-instance';
      
      expect(() => validateEnterpriseEnvironment()).toThrow(
        'Missing required environment variables for enterprise mode: REDIS_URL'
      );
    });

    it('should throw when REDIS_URL is invalid', () => {
      process.env.SWITCH_MODE = 'remote';
      process.env.INSTANCE_ID = 'test-instance';
      process.env.REDIS_URL = 'invalid-url';
      
      expect(() => validateEnterpriseEnvironment()).toThrow(
        'Invalid REDIS_URL format: invalid-url'
      );
    });
  });

  // Cleanup
  afterEach(() => {
    process.env = originalEnv;
  });
});