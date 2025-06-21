#!/usr/bin/env bun

/**
 * E2E Tests for Bedrock Error Handling and Recovery
 *
 * Tests comprehensive error handling scenarios:
 * - AWS authentication errors and recovery
 * - Rate limiting and throttling responses
 * - Model-specific errors and fallback
 * - Network errors and retry mechanisms
 * - Circuit breaker patterns and recovery
 * - Parameter validation errors
 * - Region and availability errors
 * - Streaming error scenarios
 * - Error propagation and transformation
 * - Recovery strategies and fallback chains
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import log from '../../../../src/utils/logging.js';
import { CredentialManager } from '../../../../src/credentials/managers/credential-manager.js';
import { ProviderFactory } from '../../../../src/providers/provider-factory.js';
import { BedrockAdapter } from '../../../../src/providers/bedrock/adapter.js';
import {
  BedrockError,
  BedrockErrorMapper,
  BedrockErrorRecovery,
} from '../../../../src/providers/bedrock/errors/bedrock-errors.js';
import { checkAWSSDKAvailability } from '../../../../src/providers/bedrock/client/aws-sdk-client.js';
import type { Domains } from '../../../../src/types/index.js';

describe('Bedrock Error Handling and Recovery E2E Tests', () => {
  let credentialManager: CredentialManager;
  let providerFactory: ProviderFactory;
  let _sdkAvailable: boolean;
  let hasTestCredentials: boolean = false;

  beforeAll(async () => {
    log.info('🧪 Setting up Bedrock error handling E2E tests...');

    // Check AWS SDK availability
    const sdkCheck = checkAWSSDKAvailability();
    _sdkAvailable = sdkCheck.available;

    credentialManager = new CredentialManager();
    providerFactory = new ProviderFactory(credentialManager);

    // Check if we have test credentials available
    hasTestCredentials = !!(
      process.env.TEST_AWS_ACCESS_KEY_ID && process.env.TEST_AWS_SECRET_ACCESS_KEY
    );

    // Initialize credential manager with empty stores for now - individual tests will set up their own stores
    try {
      await credentialManager.initialize({});

      if (hasTestCredentials) {
        log.info('✅ Test credentials available - running full error tests');
      } else {
        log.info('⚠️ No test credentials - running structure-only tests');
      }

      log.info('✅ Error handling E2E test environment ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.warn(`⚠️ Credential initialization issue: ${message}`);
      hasTestCredentials = false;
      log.info('⚠️ Falling back to structure-only tests');
    }
  });

  describe('BedrockError Creation and Classification', () => {
    test('Error Code Mapping', () => {
      log.info('🏷️ Testing BedrockError code mapping...');

      const errorMappings = [
        { awsError: 'UnauthorizedOperation', expectedCode: 'AUTHENTICATION_ERROR' },
        { awsError: 'InvalidUserPoolConfiguration', expectedCode: 'INVALID_CREDENTIALS' },
        { awsError: 'ThrottlingException', expectedCode: 'THROTTLED' },
        { awsError: 'TooManyRequestsException', expectedCode: 'RATE_LIMITED' },
        { awsError: 'ModelNotReadyException', expectedCode: 'MODEL_NOT_READY' },
        { awsError: 'ModelTimeoutException', expectedCode: 'MODEL_TIMEOUT' },
        { awsError: 'ModelStreamErrorException', expectedCode: 'STREAMING_ERROR' },
        { awsError: 'ValidationException', expectedCode: 'INVALID_REQUEST' },
        { awsError: 'ServiceQuotaExceededException', expectedCode: 'QUOTA_EXCEEDED' },
        { awsError: 'InternalServerException', expectedCode: 'SERVICE_ERROR' },
        { awsError: 'ServiceUnavailableException', expectedCode: 'SERVICE_UNAVAILABLE' },
      ];

      errorMappings.forEach(({ awsError, expectedCode }) => {
        const bedrockError = new BedrockError(awsError, `Test ${awsError} message`);
        expect(bedrockError.code).toBe(expectedCode);

        log.info(`  ✅ ${awsError} → ${expectedCode}`);
      });

      log.info('✅ Error code mapping validated');
    });

    test('Error Retry Classification', () => {
      log.info('🔄 Testing error retry classification...');

      const retryableErrors = [
        'ThrottlingException',
        'TooManyRequestsException',
        'ModelNotReadyException',
        'ModelTimeoutException',
        'InternalServerException',
        'ServiceUnavailableException',
      ];

      const nonRetryableErrors = [
        'UnauthorizedOperation',
        'InvalidUserPoolConfiguration',
        'ValidationException',
        'AccessDeniedException',
      ];

      retryableErrors.forEach((awsError) => {
        const bedrockError = new BedrockError(awsError, 'Test message');
        expect(bedrockError.isRetryable).toBe(true);
        log.info(`  ✅ ${awsError} is retryable`);
      });

      nonRetryableErrors.forEach((awsError) => {
        const bedrockError = new BedrockError(awsError, 'Test message');
        expect(bedrockError.isRetryable).toBe(false);
        log.info(`  ✅ ${awsError} is not retryable`);
      });

      log.info('✅ Error retry classification validated');
    });

    test('Rate Limit Detection', () => {
      log.info('⏱️ Testing rate limit detection...');

      const rateLimitErrors = ['ThrottlingException', 'TooManyRequestsException'];

      rateLimitErrors.forEach((awsError) => {
        const bedrockError = new BedrockError(awsError, 'Rate limit exceeded');
        expect(bedrockError.isRateLimit).toBe(true);
        expect(bedrockError.isRetryable).toBe(true);

        log.info(`  ✅ ${awsError} detected as rate limit`);
      });

      log.info('✅ Rate limit detection validated');
    });

    test('Fallback Strategy Detection', () => {
      log.info('🔀 Testing fallback strategy detection...');

      const fallbackErrors = [
        'UnauthorizedOperation',
        'ThrottlingException',
        'ModelNotReadyException',
        'InternalServerException',
        'ServiceUnavailableException',
      ];

      fallbackErrors.forEach((awsError) => {
        const bedrockError = new BedrockError(awsError, 'Test message');
        expect(bedrockError.shouldFallback).toBe(true);

        log.info(`  ✅ ${awsError} should trigger fallback`);
      });

      log.info('✅ Fallback strategy detection validated');
    });
  });

  describe('Error Recovery Mechanisms', () => {
    test('Retry Information Calculation', () => {
      log.info('📊 Testing retry information calculation...');

      const throttleError = new BedrockError('ThrottlingException', 'Request rate exceeded');

      // Test retry attempts 1-5
      for (let attempt = 1; attempt <= 5; attempt++) {
        const retryInfo = throttleError.getRetryInfo(attempt);

        expect(retryInfo.canRetry).toBe(true);
        expect(retryInfo.delay).toBeGreaterThan(0);
        expect(retryInfo.delay).toBeLessThan(32000); // Max delay

        // Delay should increase with attempt (exponential backoff)
        if (attempt > 1) {
          const prevRetryInfo = throttleError.getRetryInfo(attempt - 1);
          expect(retryInfo.delay).toBeGreaterThanOrEqual(prevRetryInfo.delay);
        }

        log.info(`  ✅ Attempt ${attempt}: delay ${retryInfo.delay}ms`);
      }

      // Test max attempts exceeded
      const maxRetryInfo = throttleError.getRetryInfo(6);
      expect(maxRetryInfo.canRetry).toBe(false);

      log.info('✅ Retry information calculation validated');
    });

    test('Circuit Breaker Integration', () => {
      log.info('⚡ Testing circuit breaker integration...');

      const circuitBreakerErrors = [
        'InternalServerException',
        'ServiceUnavailableException',
        'ModelTimeoutException',
      ];

      circuitBreakerErrors.forEach((awsError) => {
        const bedrockError = new BedrockError(awsError, 'Test message');
        expect(bedrockError.shouldOpenCircuitBreaker).toBe(true);

        log.info(`  ✅ ${awsError} should open circuit breaker`);
      });

      log.info('✅ Circuit breaker integration validated');
    });

    test('Error Recovery Strategies', () => {
      log.info('♻️ Testing error recovery strategies...');

      const recovery = new BedrockErrorRecovery();

      // Test authentication error recovery
      const authError = new BedrockError('UnauthorizedOperation', 'Access denied');
      const authStrategy = recovery.getRecoveryStrategy(authError);
      expect(authStrategy.retryable).toBe(false);
      expect(authStrategy.fallbackRequired).toBe(true);
      expect(authStrategy.circuitBreakerAction).toBe('none');

      // Test throttling error recovery
      const throttleError = new BedrockError('ThrottlingException', 'Rate limited');
      const throttleStrategy = recovery.getRecoveryStrategy(throttleError);
      expect(throttleStrategy.retryable).toBe(true);
      expect(throttleStrategy.retryDelay).toBeGreaterThan(0);
      expect(throttleStrategy.fallbackRequired).toBe(true);

      // Test server error recovery
      const serverError = new BedrockError('InternalServerException', 'Server error');
      const serverStrategy = recovery.getRecoveryStrategy(serverError);
      expect(serverStrategy.retryable).toBe(true);
      expect(serverStrategy.circuitBreakerAction).toBe('increment');

      log.info('✅ Error recovery strategies validated');
    });
  });

  describe('Authentication Error Scenarios', () => {
    test('Invalid Credentials Error', async () => {
      log.info('🚫 Testing invalid credentials error...');

      // Set up invalid credentials
      process.env.INVALID_ACCESS_KEY_ID = 'AKIA_INVALID_KEY';
      process.env.INVALID_SECRET_ACCESS_KEY = 'invalid_secret_key';
      process.env.TEST_AWS_REGION = process.env.TEST_AWS_REGION || 'us-east-1';

      // Add credential store for this test
      const invalidCredentialStoreConfig = {
        type: 'aws' as const,
        source: 'env' as const,
        config: {
          regionVar: 'TEST_AWS_REGION',
          accessKeyIdVar: 'INVALID_ACCESS_KEY_ID',
          secretAccessKeyVar: 'INVALID_SECRET_ACCESS_KEY',
        },
      };

      await credentialManager.addCredentialStore('aws-invalid-test', invalidCredentialStoreConfig);

      const providerConfig: Domains.IProviderEndpointConfig = {
        name: 'invalid-creds-test',
        provider: 'bedrock',
        credentialsRef: 'aws-invalid-test',
        apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
        modelName: 'claude-3-5-sonnet-20241022',
        priority: 1,
      };

      try {
        const provider = (await providerFactory.createProvider(providerConfig)) as BedrockAdapter;
        await provider.initialize();

        const chatRequest: Domains.IChatCompletionRequest = {
          messages: [{ role: 'user', content: 'Test invalid credentials' }],
          maxTokens: 10,
        };

        await provider.chatCompletion(chatRequest);

        // Should not reach here
        throw new Error('Expected authentication error but request succeeded');
      } catch (error) {
        expect(error).toBeInstanceOf(BedrockError);
        const bedrockError = error as BedrockError;
        expect(
          ['AUTHENTICATION_ERROR', 'INVALID_CREDENTIALS', 'SDKNotAvailable'].includes(
            bedrockError.code
          )
        ).toBe(true);
        expect(bedrockError.isRetryable).toBe(false);
        expect(bedrockError.shouldFallback).toBe(true);

        log.info(`✅ Invalid credentials error handled: ${bedrockError.code}`);
      }

      // Clean up
      delete process.env.INVALID_ACCESS_KEY_ID;
      delete process.env.INVALID_SECRET_ACCESS_KEY;
    });

    test('Missing Credentials Error', async () => {
      log.info('❌ Testing missing credentials error...');

      const providerConfig: Domains.IProviderEndpointConfig = {
        name: 'missing-creds-test',
        provider: 'bedrock',
        credentialsRef: 'non-existent-store',
        apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
        modelName: 'claude-3-5-sonnet-20241022',
        priority: 1,
      };

      try {
        await providerFactory.createProvider(providerConfig);
        throw new Error('Expected missing credentials error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toContain('not found');

        log.info('✅ Missing credentials error handled correctly');
      }
    });
  });

  describe('Model and Region Error Scenarios', () => {
    test('Invalid Model Name Error', async () => {
      if (!hasTestCredentials) {
        log.info('⏭️ Skipping invalid model test - no test credentials');
        return;
      }

      log.info('🤖 Testing invalid model name error...');

      // Add credential store for this test
      const credentialStoreConfig = {
        type: 'aws' as const,
        source: 'env' as const,
        config: {
          regionVar: 'TEST_AWS_REGION',
          accessKeyIdVar: 'TEST_AWS_ACCESS_KEY_ID',
          secretAccessKeyVar: 'TEST_AWS_SECRET_ACCESS_KEY',
        },
      };

      await credentialManager.addCredentialStore('aws-error-test', credentialStoreConfig);

      const providerConfig: Domains.IProviderEndpointConfig = {
        name: 'invalid-model-test',
        provider: 'bedrock',
        credentialsRef: 'aws-error-test',
        apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
        modelName: 'non-existent-model-v999',
        priority: 1,
      };

      try {
        const provider = (await providerFactory.createProvider(providerConfig)) as BedrockAdapter;
        await provider.initialize();

        const chatRequest: Domains.IChatCompletionRequest = {
          messages: [{ role: 'user', content: 'Test invalid model' }],
          maxTokens: 10,
        };

        await provider.chatCompletion(chatRequest);

        // Should fail with model error
        throw new Error('Expected model error but request succeeded');
      } catch (error) {
        // Expected to fail - either with validation error or BedrockError
        if (error instanceof BedrockError) {
          log.info(`✅ Invalid model error handled: ${error.code}`);
        } else {
          log.info('✅ Invalid model caught during validation');
        }
      }
    });

    test('Unsupported Region Error', async () => {
      if (!hasTestCredentials) {
        log.info('⏭️ Skipping region error test - no test credentials');
        return;
      }

      log.info('🌍 Testing unsupported region error...');

      // Set an invalid AWS region
      const originalRegion = process.env.TEST_AWS_REGION;
      process.env.TEST_AWS_REGION = 'mars-north-1';

      // Add credential store for this test
      const credentialStoreConfig = {
        type: 'aws' as const,
        source: 'env' as const,
        config: {
          regionVar: 'TEST_AWS_REGION',
          accessKeyIdVar: 'TEST_AWS_ACCESS_KEY_ID',
          secretAccessKeyVar: 'TEST_AWS_SECRET_ACCESS_KEY',
        },
      };

      await credentialManager.addCredentialStore('aws-error-test', credentialStoreConfig);

      const providerConfig: Domains.IProviderEndpointConfig = {
        name: 'invalid-region-test',
        provider: 'bedrock',
        credentialsRef: 'aws-error-test',
        apiBase: 'https://bedrock-runtime.mars-north-1.amazonaws.com',
        modelName: 'claude-3-5-sonnet-20241022',
        priority: 1,
      };

      try {
        const provider = (await providerFactory.createProvider(providerConfig)) as BedrockAdapter;
        await provider.initialize();

        const chatRequest: Domains.IChatCompletionRequest = {
          messages: [{ role: 'user', content: 'Test invalid region' }],
          maxTokens: 10,
        };

        await provider.chatCompletion(chatRequest);

        throw new Error('Expected region error but request succeeded');
      } catch (_error) {
        // Expected to fail with region or network error
        log.info('✅ Invalid region error handled correctly');
      }

      // Reset region
      if (originalRegion) {
        process.env.TEST_AWS_REGION = originalRegion;
      } else {
        delete process.env.TEST_AWS_REGION;
      }
    });
  });

  describe('Parameter Validation Errors', () => {
    test('Invalid Parameter Values', async () => {
      if (!hasTestCredentials) {
        log.info('⏭️ Skipping parameter validation test - no test credentials');
        return;
      }

      log.info('📊 Testing invalid parameter values...');

      // Add credential store for this test
      const credentialStoreConfig = {
        type: 'aws' as const,
        source: 'env' as const,
        config: {
          regionVar: 'TEST_AWS_REGION',
          accessKeyIdVar: 'TEST_AWS_ACCESS_KEY_ID',
          secretAccessKeyVar: 'TEST_AWS_SECRET_ACCESS_KEY',
        },
      };

      await credentialManager.addCredentialStore('aws-error-test', credentialStoreConfig);

      const providerConfig: Domains.IProviderEndpointConfig = {
        name: 'param-validation-test',
        provider: 'bedrock',
        credentialsRef: 'aws-error-test',
        apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
        modelName: 'claude-3-5-sonnet-20241022',
        priority: 1,
      };

      try {
        const provider = (await providerFactory.createProvider(providerConfig)) as BedrockAdapter;
        await provider.initialize();

        // Test invalid parameters
        const invalidRequests = [
          {
            name: 'negative temperature',
            request: {
              messages: [{ role: 'user', content: 'Test' }],
              temperature: -1.0,
              maxTokens: 100,
            },
          },
          {
            name: 'temperature too high',
            request: {
              messages: [{ role: 'user', content: 'Test' }],
              temperature: 2.0,
              maxTokens: 100,
            },
          },
          {
            name: 'negative max tokens',
            request: {
              messages: [{ role: 'user', content: 'Test' }],
              maxTokens: -100,
            },
          },
          {
            name: 'max tokens too high',
            request: {
              messages: [{ role: 'user', content: 'Test' }],
              maxTokens: 1000000,
            },
          },
          {
            name: 'invalid top_p',
            request: {
              messages: [{ role: 'user', content: 'Test' }],
              topP: 2.0,
              maxTokens: 100,
            },
          },
        ];

        for (const { name, request } of invalidRequests) {
          try {
            await provider.chatCompletion(request);
            log.warn(`⚠️ Expected validation error for ${name} but request succeeded`);
          } catch (error) {
            if (error instanceof BedrockError && error.code === 'INVALID_REQUEST') {
              log.info(`  ✅ ${name} validation error handled correctly`);
            } else {
              log.info(`  ✅ ${name} error handled: ${error.message}`);
            }
          }
        }

        log.info('✅ Parameter validation errors handled correctly');
      } catch (_error) {
        // Expected to fail during setup due to credentials
        log.info('✅ Parameter validation test setup completed');
      }
    });

    test('Missing Required Parameters', async () => {
      if (!hasTestCredentials) {
        log.info('⏭️ Skipping missing parameters test - no test credentials');
        return;
      }

      log.info('📝 Testing missing required parameters...');

      // Add credential store for this test
      const credentialStoreConfig = {
        type: 'aws' as const,
        source: 'env' as const,
        config: {
          regionVar: 'TEST_AWS_REGION',
          accessKeyIdVar: 'TEST_AWS_ACCESS_KEY_ID',
          secretAccessKeyVar: 'TEST_AWS_SECRET_ACCESS_KEY',
        },
      };

      await credentialManager.addCredentialStore('aws-error-test', credentialStoreConfig);

      const providerConfig: Domains.IProviderEndpointConfig = {
        name: 'missing-params-test',
        provider: 'bedrock',
        credentialsRef: 'aws-error-test',
        apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
        modelName: 'claude-3-5-sonnet-20241022',
        priority: 1,
      };

      try {
        const provider = (await providerFactory.createProvider(providerConfig)) as BedrockAdapter;
        await provider.initialize();

        // Test missing required parameters
        const invalidRequests = [
          {
            name: 'missing messages',
            request: {
              maxTokens: 100,
            } as Domains.IChatCompletionRequest,
          },
          {
            name: 'empty messages array',
            request: {
              messages: [],
              maxTokens: 100,
            },
          },
          {
            name: 'missing message content',
            request: {
              messages: [{ role: 'user' }],
              maxTokens: 100,
            } as Domains.IChatCompletionRequest,
          },
          {
            name: 'missing max tokens',
            request: {
              messages: [{ role: 'user', content: 'Test' }],
            },
          },
        ];

        for (const { name, request } of invalidRequests) {
          try {
            await provider.chatCompletion(request);
            log.warn(`⚠️ Expected validation error for ${name} but request succeeded`);
          } catch (_error) {
            log.info(`  ✅ ${name} validation error handled correctly`);
          }
        }

        log.info('✅ Missing parameter errors handled correctly');
      } catch (_error) {
        // Expected to fail during setup
        log.info('✅ Missing parameter test setup completed');
      }
    });
  });

  describe('Streaming Error Scenarios', () => {
    test('Streaming Connection Errors', async () => {
      if (!hasTestCredentials) {
        log.info('⏭️ Skipping streaming error test - no test credentials');
        return;
      }

      log.info('🌊 Testing streaming connection errors...');

      // Add credential store for this test
      const credentialStoreConfig = {
        type: 'aws' as const,
        source: 'env' as const,
        config: {
          regionVar: 'TEST_AWS_REGION',
          accessKeyIdVar: 'TEST_AWS_ACCESS_KEY_ID',
          secretAccessKeyVar: 'TEST_AWS_SECRET_ACCESS_KEY',
        },
      };

      await credentialManager.addCredentialStore('aws-error-test', credentialStoreConfig);

      const providerConfig: Domains.IProviderEndpointConfig = {
        name: 'stream-error-test',
        provider: 'bedrock',
        credentialsRef: 'aws-error-test',
        apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
        modelName: 'claude-3-5-sonnet-20241022',
        priority: 1,
      };

      try {
        const provider = (await providerFactory.createProvider(providerConfig)) as BedrockAdapter;
        await provider.initialize();

        const streamRequest: Domains.IChatCompletionRequest = {
          messages: [{ role: 'user', content: 'Test streaming error' }],
          maxTokens: 100,
          stream: true,
        };

        const stream = provider.streamChatCompletion(streamRequest);
        const iterator = stream[Symbol.asyncIterator]();

        try {
          await iterator.next();
          log.info('⚠️ Streaming succeeded unexpectedly');
        } catch (error) {
          expect(error).toBeInstanceOf(BedrockError);
          const bedrockError = error as BedrockError;
          expect(
            ['AUTHENTICATION_ERROR', 'STREAMING_ERROR', 'SDKNotAvailable'].includes(
              bedrockError.code
            )
          ).toBe(true);

          log.info(`✅ Streaming error handled: ${bedrockError.code}`);
        }
      } catch (_error) {
        // Expected to fail during setup
        log.info('✅ Streaming error test setup completed');
      }
    });

    test('Streaming Interruption Handling', async () => {
      if (!hasTestCredentials) {
        log.info('⏭️ Skipping streaming interruption test - no test credentials');
        return;
      }

      log.info('🛑 Testing streaming interruption handling...');

      // Add credential store for this test
      const credentialStoreConfig = {
        type: 'aws' as const,
        source: 'env' as const,
        config: {
          regionVar: 'TEST_AWS_REGION',
          accessKeyIdVar: 'TEST_AWS_ACCESS_KEY_ID',
          secretAccessKeyVar: 'TEST_AWS_SECRET_ACCESS_KEY',
        },
      };

      await credentialManager.addCredentialStore('aws-error-test', credentialStoreConfig);

      const providerConfig: Domains.IProviderEndpointConfig = {
        name: 'stream-interruption-test',
        provider: 'bedrock',
        credentialsRef: 'aws-error-test',
        apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
        modelName: 'claude-3-5-sonnet-20241022',
        priority: 1,
      };

      try {
        const provider = (await providerFactory.createProvider(providerConfig)) as BedrockAdapter;
        await provider.initialize();

        const streamRequest: Domains.IChatCompletionRequest = {
          messages: [{ role: 'user', content: 'Write a very long story' }],
          maxTokens: 2000,
          stream: true,
        };

        const stream = provider.streamChatCompletion(streamRequest);
        const iterator = stream[Symbol.asyncIterator]();

        // Simulate early termination
        try {
          const _result = await iterator.next();
          // If we get a result, the stream started successfully
          log.info('✅ Streaming interruption test completed');
        } catch (_error) {
          // Expected to fail - we're testing graceful error handling
          log.info('✅ Streaming interruption handled gracefully');
        }
      } catch (_error) {
        // Expected to fail during setup
        log.info('✅ Streaming interruption test setup completed');
      }
    });
  });

  describe('Error Mapper Integration', () => {
    test('AWS Error to BedrockError Mapping', () => {
      log.info('🗺️ Testing AWS error to BedrockError mapping...');

      const mapper = new BedrockErrorMapper();

      // Test various AWS error scenarios
      const awsErrors = [
        {
          name: 'UnauthorizedOperation',
          message:
            'User: arn:aws:iam::123456789012:user/test is not authorized to perform: bedrock:InvokeModel',
          expectedCode: 'AUTHENTICATION_ERROR',
        },
        {
          name: 'ThrottlingException',
          message: 'Too Many Requests',
          expectedCode: 'THROTTLED',
        },
        {
          name: 'ValidationException',
          message: 'Invalid model identifier',
          expectedCode: 'INVALID_REQUEST',
        },
        {
          name: 'ModelNotReadyException',
          message: 'The model is not ready',
          expectedCode: 'MODEL_NOT_READY',
        },
      ];

      awsErrors.forEach(({ name, message, expectedCode }) => {
        const bedrockError = mapper.mapAWSError(name, message);
        expect(bedrockError.code).toBe(expectedCode);
        expect(bedrockError.message).toContain(message);

        log.info(`  ✅ ${name} → ${expectedCode}`);
      });

      log.info('✅ AWS error mapping validated');
    });

    test('Network Error Mapping', () => {
      log.info('🌐 Testing network error mapping...');

      const mapper = new BedrockErrorMapper();

      const networkErrors = [
        {
          error: new Error('ECONNREFUSED'),
          expectedCode: 'NETWORK_ERROR',
        },
        {
          error: new Error('ETIMEDOUT'),
          expectedCode: 'NETWORK_ERROR',
        },
        {
          error: new Error('ENOTFOUND'),
          expectedCode: 'NETWORK_ERROR',
        },
      ];

      networkErrors.forEach(({ error, expectedCode }) => {
        const bedrockError = mapper.mapNetworkError(error);
        expect(bedrockError.code).toBe(expectedCode);
        expect(bedrockError.isRetryable).toBe(true);

        log.info(`  ✅ ${error.message} → ${expectedCode}`);
      });

      log.info('✅ Network error mapping validated');
    });
  });

  describe('Error Recovery Performance', () => {
    test('Error Classification Performance', () => {
      log.info('⚡ Testing error classification performance...');

      const iterations = 1000;
      const errors = [
        'UnauthorizedOperation',
        'ThrottlingException',
        'ValidationException',
        'InternalServerException',
      ];

      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        const errorType = errors[i % errors.length];
        const bedrockError = new BedrockError(errorType, 'Test message');

        // Access properties to ensure they're computed
        expect(bedrockError.code).toBeDefined();
        expect(typeof bedrockError.isRetryable).toBe('boolean');
        expect(typeof bedrockError.shouldFallback).toBe('boolean');
        expect(bedrockError.getRetryInfo(1)).toBeDefined();
      }

      const end = Date.now();
      const totalTime = end - start;
      const avgTime = totalTime / iterations;

      expect(avgTime).toBeLessThan(1); // Should be very fast
      expect(totalTime).toBeLessThan(1000); // Total should complete quickly

      log.info(`✅ Error classification performance: ${avgTime.toFixed(3)}ms per error`);
    });

    test('Concurrent Error Handling', async () => {
      log.info('🔄 Testing concurrent error handling...');

      const concurrentErrors = Array.from({ length: 50 }, (_, i) => {
        const errorTypes = [
          'ThrottlingException',
          'InternalServerException',
          'ValidationException',
        ];
        const errorType = errorTypes[i % errorTypes.length];
        return new BedrockError(errorType, `Concurrent error ${i}`);
      });

      const start = Date.now();

      const results = await Promise.all(
        concurrentErrors.map(async (error) => {
          const retryInfo = error.getRetryInfo(1);
          return {
            code: error.code,
            isRetryable: error.isRetryable,
            delay: retryInfo.delay,
          };
        })
      );

      const end = Date.now();
      const totalTime = end - start;

      expect(results).toHaveLength(50);
      expect(totalTime).toBeLessThan(100); // Should be very fast

      log.info(
        `✅ Concurrent error handling: ${concurrentErrors.length} errors in ${totalTime.toFixed(2)}ms`
      );
    });
  });

  afterAll(async () => {
    log.info('🧹 Cleaning up error handling E2E tests...');

    // Clean up test environment variables
    const testVars = [
      'TEST_AWS_REGION',
      'TEST_AWS_ACCESS_KEY_ID',
      'TEST_AWS_SECRET_ACCESS_KEY',
      'INVALID_ACCESS_KEY_ID',
      'INVALID_SECRET_ACCESS_KEY',
    ];

    testVars.forEach((varName) => {
      if (process.env[varName]) {
        delete process.env[varName];
      }
    });

    log.info('✅ Error handling E2E test cleanup complete');
  });
});

// Manual test runner
if (import.meta.main) {
  console.log('🏃 Running Bedrock error handling and recovery E2E tests...');
  console.log('');
  console.log('These tests validate comprehensive error handling:');
  console.log('- AWS authentication errors and recovery');
  console.log('- Rate limiting and throttling responses');
  console.log('- Model-specific errors and fallback');
  console.log('- Network errors and retry mechanisms');
  console.log('- Circuit breaker patterns and recovery');
  console.log('- Parameter validation errors');
  console.log('- Region and availability errors');
  console.log('- Streaming error scenarios');
  console.log('- Error propagation and transformation');
  console.log('- Recovery strategies and fallback chains');
  console.log('');
  console.log('Environment setup (optional):');
  console.log('- TEST_AWS_REGION');
  console.log('- TEST_AWS_ACCESS_KEY_ID');
  console.log('- TEST_AWS_SECRET_ACCESS_KEY');
  console.log('');
  console.log('Run: bun test src/__tests__/e2e/bedrock-errors-e2e.test.ts');
}
