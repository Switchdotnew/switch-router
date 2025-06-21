// Integration tests for credential system

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { CredentialManager } from '../managers/credential-manager.js';
import { ProviderFactory } from '../../providers/provider-factory.js';
import type { ICredentialStoresConfig } from '../managers/credential-manager.js';
import type { IProviderEndpointConfig } from '../../types/domains/config.js';

describe('Credential System Integration', () => {
  let credentialManager: CredentialManager;
  let providerFactory: ProviderFactory;

  beforeEach(async () => {
    credentialManager = new CredentialManager();
    providerFactory = new ProviderFactory(credentialManager);

    // Set test environment variables
    process.env.TEST_OPENAI_API_KEY = 'sk-test1234567890abcdef';
    process.env.TEST_ANTHROPIC_API_KEY = 'sk-ant-test1234567890abcdef';
    process.env.TEST_AWS_REGION = 'us-east-1';
    process.env.TEST_AWS_ACCESS_KEY_ID = 'AKIA1234567890ABCDEF';
    process.env.TEST_AWS_SECRET_ACCESS_KEY = '1234567890abcdef1234567890abcdef12345678';
  });

  afterEach(async () => {
    await credentialManager.dispose();

    // Clean up test environment variables
    delete process.env.TEST_OPENAI_API_KEY;
    delete process.env.TEST_ANTHROPIC_API_KEY;
    delete process.env.TEST_AWS_REGION;
    delete process.env.TEST_AWS_ACCESS_KEY_ID;
    delete process.env.TEST_AWS_SECRET_ACCESS_KEY;
  });

  test('should initialize credential manager with multiple stores', async () => {
    const storesConfig: ICredentialStoresConfig = {
      'test-openai': {
        type: 'simple',
        source: 'env',
        config: {
          apiKeyVar: 'TEST_OPENAI_API_KEY',
        },
        cacheTtl: 3600,
      },
      'test-anthropic': {
        type: 'simple',
        source: 'env',
        config: {
          apiKeyVar: 'TEST_ANTHROPIC_API_KEY',
        },
        cacheTtl: 3600,
      },
      'test-aws': {
        type: 'aws',
        source: 'env',
        config: {
          regionVar: 'TEST_AWS_REGION',
          accessKeyIdVar: 'TEST_AWS_ACCESS_KEY_ID',
          secretAccessKeyVar: 'TEST_AWS_SECRET_ACCESS_KEY',
        },
        cacheTtl: 1800,
      },
    };

    await credentialManager.initialize(storesConfig);

    const storeIds = credentialManager.getCredentialStoreIds();
    expect(storeIds).toHaveLength(3);
    expect(storeIds).toContain('test-openai');
    expect(storeIds).toContain('test-anthropic');
    expect(storeIds).toContain('test-aws');
  });

  test('should resolve simple credentials', async () => {
    const storesConfig: ICredentialStoresConfig = {
      'test-openai': {
        type: 'simple',
        source: 'env',
        config: {
          apiKeyVar: 'TEST_OPENAI_API_KEY',
        },
      },
    };

    await credentialManager.initialize(storesConfig);

    const credential = await credentialManager.resolveCredentials('test-openai');

    expect(credential.type).toBe('simple');
    expect(credential.storeId).toBe('test-openai');

    const authHeaders = credential.getAuthHeaders();
    expect(authHeaders).toHaveProperty('Authorization');
    expect(authHeaders.Authorization).toBe('Bearer sk-test1234567890abcdef');
  });

  test('should resolve AWS credentials', async () => {
    const storesConfig: ICredentialStoresConfig = {
      'test-aws': {
        type: 'aws',
        source: 'env',
        config: {
          regionVar: 'TEST_AWS_REGION',
          accessKeyIdVar: 'TEST_AWS_ACCESS_KEY_ID',
          secretAccessKeyVar: 'TEST_AWS_SECRET_ACCESS_KEY',
        },
      },
    };

    await credentialManager.initialize(storesConfig);

    const credential = await credentialManager.resolveCredentials('test-aws');

    expect(credential.type).toBe('aws');
    expect(credential.storeId).toBe('test-aws');

    if (credential.type === 'aws') {
      expect(credential.region).toBe('us-east-1');
      expect(credential.accessKeyId).toBe('AKIA1234567890ABCDEF');
      expect(credential.secretAccessKey).toBe('1234567890abcdef1234567890abcdef12345678');
    }
  });

  test('should create provider with credential reference', async () => {
    const storesConfig: ICredentialStoresConfig = {
      'test-openai': {
        type: 'simple',
        source: 'env',
        config: {
          apiKeyVar: 'TEST_OPENAI_API_KEY',
        },
      },
    };

    await credentialManager.initialize(storesConfig);

    const providerConfig: IProviderEndpointConfig = {
      name: 'test-openai-provider',
      provider: 'openai',
      credentialsRef: 'test-openai',
      apiBase: 'https://api.openai.com/v1',
      modelName: 'gpt-4o',
      priority: 1,
      weight: 100,
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      healthCheck: {
        enabled: true,
        intervalMs: 60000,
        timeoutMs: 5000,
        retries: 3,
      },
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        resetTimeout: 60000,
        monitoringWindow: 300000,
        minRequestsThreshold: 10,
        errorThresholdPercentage: 50,
      },
    };

    const provider = await providerFactory.createProvider(providerConfig);

    expect(provider.getName()).toBe('test-openai-provider');
    expect(provider.getModelName()).toBe('gpt-4o');
    expect(provider.getCapabilities().chat).toBe(true);
  });

  test('should create Bedrock provider with AWS credentials', async () => {
    const storesConfig: ICredentialStoresConfig = {
      'test-aws': {
        type: 'aws',
        source: 'env',
        config: {
          regionVar: 'TEST_AWS_REGION',
          accessKeyIdVar: 'TEST_AWS_ACCESS_KEY_ID',
          secretAccessKeyVar: 'TEST_AWS_SECRET_ACCESS_KEY',
        },
      },
    };

    await credentialManager.initialize(storesConfig);

    const providerConfig: IProviderEndpointConfig = {
      name: 'test-bedrock-provider',
      provider: 'bedrock',
      credentialsRef: 'test-aws',
      apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
      modelName: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      priority: 1,
      weight: 100,
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      healthCheck: {
        enabled: true,
        intervalMs: 60000,
        timeoutMs: 5000,
        retries: 3,
      },
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        resetTimeout: 60000,
        monitoringWindow: 300000,
        minRequestsThreshold: 10,
        errorThresholdPercentage: 50,
      },
    };

    const provider = await providerFactory.createProvider(providerConfig);

    expect(provider.getName()).toBe('test-bedrock-provider');
    expect(provider.getModelName()).toBe('anthropic.claude-3-5-sonnet-20241022-v2:0');
    expect(provider.getCapabilities().chat).toBe(true);
    expect(provider.getCapabilities().completion).toBe(false); // Bedrock uses chat format
  });

  test('should validate provider configurations', async () => {
    const storesConfig: ICredentialStoresConfig = {
      'test-openai': {
        type: 'simple',
        source: 'env',
        config: {
          apiKeyVar: 'TEST_OPENAI_API_KEY',
        },
      },
    };

    await credentialManager.initialize(storesConfig);

    // Valid configuration
    const validConfig: IProviderEndpointConfig = {
      name: 'test-provider',
      provider: 'openai',
      credentialsRef: 'test-openai',
      apiBase: 'https://api.openai.com/v1',
      modelName: 'gpt-4o',
      priority: 1,
      weight: 100,
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      healthCheck: {
        enabled: true,
        intervalMs: 60000,
        timeoutMs: 5000,
        retries: 3,
      },
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        resetTimeout: 60000,
        monitoringWindow: 300000,
        minRequestsThreshold: 10,
        errorThresholdPercentage: 50,
      },
    };

    const validation = await providerFactory.validateProviderConfig(validConfig);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // Invalid configuration - missing credential reference
    const invalidConfig: IProviderEndpointConfig = {
      ...validConfig,
      credentialsRef: undefined,
      apiKey: undefined,
    };

    const invalidValidation = await providerFactory.validateProviderConfig(invalidConfig);
    expect(invalidValidation.valid).toBe(false);
    expect(invalidValidation.errors.length).toBeGreaterThan(0);
  });

  test('should handle credential validation errors', async () => {
    const storesConfig: ICredentialStoresConfig = {
      'invalid-store': {
        type: 'simple',
        source: 'env',
        config: {
          apiKeyVar: 'NONEXISTENT_API_KEY',
        },
      },
    };

    // In test environments, initialization may succeed even with invalid stores
    // but attempting to resolve credentials should fail
    await credentialManager.initialize(storesConfig);

    // The credential manager should be initialized but have no stores registered
    const storeIds = credentialManager.getCredentialStoreIds();
    expect(storeIds).toHaveLength(0);

    // Attempting to resolve credentials should fail
    await expect(credentialManager.resolveCredentials('invalid-store')).rejects.toThrow();
  });

  test('should support direct apiKey configuration', async () => {
    // Don't initialize credential manager to test direct apiKey mode
    const directApiKeyProviderFactory = new ProviderFactory();

    const directApiKeyConfig: IProviderEndpointConfig = {
      name: 'direct-api-key-provider',
      provider: 'openai',
      apiKey: 'sk-direct1234567890abcdef',
      apiBase: 'https://api.openai.com/v1',
      modelName: 'gpt-4o',
      priority: 1,
      weight: 100,
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      healthCheck: {
        enabled: true,
        intervalMs: 60000,
        timeoutMs: 5000,
        retries: 3,
      },
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        resetTimeout: 60000,
        monitoringWindow: 300000,
        minRequestsThreshold: 10,
        errorThresholdPercentage: 50,
      },
    };

    const provider = await directApiKeyProviderFactory.createProvider(directApiKeyConfig);

    expect(provider.getName()).toBe('direct-api-key-provider');
    expect(provider.getModelName()).toBe('gpt-4o');
  });

  test('should validate all credential stores', async () => {
    const storesConfig: ICredentialStoresConfig = {
      'valid-store': {
        type: 'simple',
        source: 'env',
        config: {
          apiKeyVar: 'TEST_OPENAI_API_KEY',
        },
      },
      'valid-aws-store': {
        type: 'aws',
        source: 'env',
        config: {
          regionVar: 'TEST_AWS_REGION',
          accessKeyIdVar: 'TEST_AWS_ACCESS_KEY_ID',
          secretAccessKeyVar: 'TEST_AWS_SECRET_ACCESS_KEY',
        },
      },
    };

    await credentialManager.initialize(storesConfig);

    const validationResults = await credentialManager.validateAllCredentialStores();

    expect(validationResults.size).toBe(2);

    const validStoreResult = validationResults.get('valid-store');
    expect(validStoreResult?.valid).toBe(true);

    const validAwsStoreResult = validationResults.get('valid-aws-store');
    expect(validAwsStoreResult?.valid).toBe(true);
  });

  test('should get credential cache statistics', async () => {
    const storesConfig: ICredentialStoresConfig = {
      'cached-store': {
        type: 'simple',
        source: 'env',
        config: {
          apiKeyVar: 'TEST_OPENAI_API_KEY',
        },
        cacheTtl: 3600,
      },
    };

    await credentialManager.initialize(storesConfig);

    // Resolve credentials to populate cache
    await credentialManager.resolveCredentials('cached-store');

    const cacheStats = credentialManager.getCredentialCacheStats();
    expect(cacheStats.totalEntries).toBeGreaterThan(0);
  });
});
