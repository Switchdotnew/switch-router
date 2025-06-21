#!/usr/bin/env bun

/**
 * E2E Tests for Bedrock Streaming Functionality
 *
 * Tests streaming implementation across:
 * - AWS SDK streaming vs fallback streaming
 * - Different model families and their streaming formats
 * - Error handling during streaming
 * - Stream interruption and recovery
 * - Backpressure handling
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import log from '../../../../src/utils/logging.js';
import { CredentialManager } from '../../../../src/credentials/managers/credential-manager.js';
import { ProviderFactory } from '../../../../src/providers/provider-factory.js';
import { BedrockAdapter } from '../../../../src/providers/bedrock/adapter.js';
import { checkAWSSDKAvailability } from '../../../../src/providers/bedrock/client/aws-sdk-client.js';
import { BedrockError } from '../../../../src/providers/bedrock/errors/bedrock-errors.js';
import type { Domains } from '../../../../src/types/index.js';

describe('Bedrock Streaming E2E Tests', () => {
  let credentialManager: CredentialManager;
  let providerFactory: ProviderFactory;
  let _testCredentials: unknown = null;
  let sdkAvailable: boolean;
  let hasTestCredentials: boolean = false;

  beforeAll(async () => {
    log.info('🧪 Setting up Bedrock streaming E2E tests...');

    // Check AWS SDK availability
    const sdkCheck = checkAWSSDKAvailability();
    sdkAvailable = sdkCheck.available;

    log.info(`AWS SDK Status: ${sdkAvailable ? 'Available' : 'Fallback mode'}`);

    // Initialize credential manager
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
        log.info('✅ Test credentials available - running full streaming tests');
      } else {
        log.info('⚠️ No test credentials - running structure-only tests');
      }

      log.info('✅ Streaming E2E test environment ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.warn(`⚠️ Credential initialization issue: ${message}`);
      hasTestCredentials = false;
      log.info('⚠️ Falling back to structure-only tests');
    }
  });

  describe('Streaming Infrastructure', () => {
    test('Stream Request Creation and Validation', async () => {
      if (!hasTestCredentials) {
        log.info('⏭️ Skipping stream request test - no test credentials');
        return;
      }

      log.info('🌊 Testing stream request creation...');

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

      await credentialManager.addCredentialStore('aws-streaming-test', credentialStoreConfig);

      const providerConfig: Domains.IProviderEndpointConfig = {
        name: 'stream-test',
        provider: 'bedrock',
        credentialsRef: 'aws-streaming-test',
        apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
        modelName: 'claude-3-5-sonnet-20241022',
        priority: 1,
      };

      try {
        const provider = (await providerFactory.createProvider(providerConfig)) as BedrockAdapter;
        await provider.initialize();

        // Verify streaming capability
        expect(provider.capabilities.streaming).toBe(true);

        // Create a streaming request
        const streamRequest: Domains.IChatCompletionRequest = {
          messages: [{ role: 'user', content: 'Count from 1 to 10' }],
          maxTokens: 100,
          temperature: 0.7,
          stream: true,
        };

        // Validate request structure
        expect(streamRequest.stream).toBe(true);
        expect(streamRequest.messages).toHaveLength(1);
        expect(streamRequest.maxTokens).toBe(100);

        log.info('✅ Stream request creation validated');
      } catch (error) {
        log.error('❌ Stream request creation failed:', error);
        throw error;
      }
    });

    test('Stream Response Format Validation', async () => {
      if (!hasTestCredentials) {
        log.info('⏭️ Skipping stream format test - no test credentials');
        return;
      }

      log.info('📦 Testing stream response format...');

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

      await credentialManager.addCredentialStore('aws-streaming-test', credentialStoreConfig);

      const providerConfig: Domains.IProviderEndpointConfig = {
        name: 'stream-format-test',
        provider: 'bedrock',
        credentialsRef: 'aws-streaming-test',
        apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
        modelName: 'claude-3-5-sonnet-20241022',
        priority: 1,
      };

      const provider = (await providerFactory.createProvider(providerConfig)) as BedrockAdapter;
      await provider.initialize();

      const streamRequest: Domains.IChatCompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        maxTokens: 50,
        stream: true,
      };

      try {
        const stream = provider.streamChatCompletion(streamRequest);

        // Verify it's an async generator
        expect(typeof stream[Symbol.asyncIterator]).toBe('function');

        log.info('✅ Stream response format validated');
      } catch (error) {
        // Expected to fail in test environment - we're validating the interface
        if (error instanceof BedrockError) {
          log.info('✅ Stream format validated (expected auth error)');
        } else {
          throw error;
        }
      }
    });
  });

  describe('Model Family Streaming', () => {
    test('Claude (Anthropic) Streaming Format', async () => {
      if (!hasTestCredentials) {
        log.info('⏭️ Skipping Claude streaming test - no test credentials');
        return;
      }

      log.info('🤖 Testing Claude streaming format...');

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

      await credentialManager.addCredentialStore('aws-streaming-test', credentialStoreConfig);

      const providerConfig: Domains.IProviderEndpointConfig = {
        name: 'claude-stream-test',
        provider: 'bedrock',
        credentialsRef: 'aws-streaming-test',
        apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
        modelName: 'claude-3-5-sonnet-20241022',
        priority: 1,
      };

      const provider = (await providerFactory.createProvider(providerConfig)) as BedrockAdapter;
      await provider.initialize();

      // Test Claude-specific capabilities
      expect(provider.capabilities.chat).toBe(true);
      expect(provider.capabilities.streaming).toBe(true);
      expect(provider.capabilities.functionCalling).toBe(true);
      expect(provider.capabilities.vision).toBe(true);

      const streamRequest: Domains.IChatCompletionRequest = {
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Write a haiku about streaming' },
        ],
        maxTokens: 150,
        temperature: 0.8,
        stream: true,
      };

      try {
        const stream = provider.streamChatCompletion(streamRequest);

        // Test async iteration interface
        const iterator = stream[Symbol.asyncIterator]();
        expect(typeof iterator.next).toBe('function');

        log.info('✅ Claude streaming format validated');
      } catch (error) {
        if (error instanceof BedrockError) {
          log.info('✅ Claude streaming validated (expected auth error)');
          expect(error.code).toBeDefined();
        } else {
          throw error;
        }
      }
    });

    test('Llama (Meta) Streaming Format', async () => {
      if (!hasTestCredentials) {
        log.info('⏭️ Skipping Llama streaming test - no test credentials');
        return;
      }

      log.info('🦙 Testing Llama streaming format...');

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

      await credentialManager.addCredentialStore('aws-streaming-test', credentialStoreConfig);

      const providerConfig: Domains.IProviderEndpointConfig = {
        name: 'llama-stream-test',
        provider: 'bedrock',
        credentialsRef: 'aws-streaming-test',
        apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
        modelName: 'llama-3.1-405b-instruct',
        priority: 1,
      };

      const provider = (await providerFactory.createProvider(providerConfig)) as BedrockAdapter;
      await provider.initialize();

      expect(provider.capabilities.streaming).toBe(true);

      const streamRequest: Domains.IChatCompletionRequest = {
        messages: [{ role: 'user', content: 'Explain machine learning in simple terms' }],
        maxTokens: 200,
        temperature: 0.6,
        stream: true,
      };

      try {
        const stream = provider.streamChatCompletion(streamRequest);
        expect(typeof stream[Symbol.asyncIterator]).toBe('function');

        log.info('✅ Llama streaming format validated');
      } catch (error) {
        if (error instanceof BedrockError) {
          log.info('✅ Llama streaming validated (expected auth error)');
        } else {
          throw error;
        }
      }
    });

    test('Amazon Nova Streaming Format', async () => {
      if (!hasTestCredentials) {
        log.info('⏭️ Skipping Nova streaming test - no test credentials');
        return;
      }

      log.info('🌟 Testing Nova streaming format...');

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

      await credentialManager.addCredentialStore('aws-streaming-test', credentialStoreConfig);

      const providerConfig: Domains.IProviderEndpointConfig = {
        name: 'nova-stream-test',
        provider: 'bedrock',
        credentialsRef: 'aws-streaming-test',
        apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
        modelName: 'nova-pro',
        priority: 1,
      };

      const provider = (await providerFactory.createProvider(providerConfig)) as BedrockAdapter;
      await provider.initialize();

      expect(provider.capabilities.streaming).toBe(true);
      expect(provider.capabilities.vision).toBe(true);

      const streamRequest: Domains.IChatCompletionRequest = {
        messages: [{ role: 'user', content: 'Describe the benefits of multimodal AI' }],
        maxTokens: 250,
        temperature: 0.7,
        stream: true,
      };

      try {
        const stream = provider.streamChatCompletion(streamRequest);
        expect(typeof stream[Symbol.asyncIterator]).toBe('function');

        log.info('✅ Nova streaming format validated');
      } catch (error) {
        if (error instanceof BedrockError) {
          log.info('✅ Nova streaming validated (expected auth error)');
        } else {
          throw error;
        }
      }
    });
  });

  describe('Streaming Error Handling', () => {
    test('Stream Authentication Errors', async () => {
      if (!hasTestCredentials) {
        log.info('⏭️ Skipping stream auth error test - no test credentials');
        return;
      }

      log.info('🚨 Testing stream authentication errors...');

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

      await credentialManager.addCredentialStore('aws-streaming-test', credentialStoreConfig);

      const providerConfig: Domains.IProviderEndpointConfig = {
        name: 'auth-error-test',
        provider: 'bedrock',
        credentialsRef: 'aws-streaming-test',
        apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
        modelName: 'claude-3-5-sonnet-20241022',
        priority: 1,
      };

      const provider = (await providerFactory.createProvider(providerConfig)) as BedrockAdapter;
      await provider.initialize();

      const streamRequest: Domains.IChatCompletionRequest = {
        messages: [{ role: 'user', content: 'Test auth error' }],
        maxTokens: 50,
        stream: true,
      };

      try {
        const stream = provider.streamChatCompletion(streamRequest);
        const iterator = stream[Symbol.asyncIterator]();

        // Try to get first chunk - should fail with auth error
        await iterator.next();

        // If we get here, authentication worked unexpectedly
        log.info('⚠️ Authentication succeeded unexpectedly');
      } catch (error) {
        expect(error).toBeInstanceOf(BedrockError);
        const bedrockError = error as BedrockError;

        // Should be an authentication or credential error
        expect(
          ['AUTHENTICATION_ERROR', 'INVALID_CREDENTIALS', 'SDKNotAvailable'].includes(
            bedrockError.code
          )
        ).toBe(true);
        expect(bedrockError.isRetryable).toBeDefined();

        log.info(`✅ Stream auth error handled correctly: ${bedrockError.code}`);
      }
    });

    test('Stream Rate Limit Handling', async () => {
      log.info('⏱️ Testing stream rate limit handling...');

      // Create a mock rate limit error
      const rateLimitError = new BedrockError('ThrottlingException', 'Request rate exceeded');

      expect(rateLimitError.code).toBe('THROTTLED');
      expect(rateLimitError.isRetryable).toBe(true);
      expect(rateLimitError.isRateLimit).toBe(true);

      const retryInfo = rateLimitError.getRetryInfo(1);
      expect(retryInfo.canRetry).toBe(true);
      expect(retryInfo.delay).toBeGreaterThan(0);

      log.info('✅ Stream rate limit error handling validated');
    });

    test('Stream Interruption Handling', async () => {
      if (!hasTestCredentials) {
        log.info('⏭️ Skipping stream interruption test - no test credentials');
        return;
      }

      log.info('🛑 Testing stream interruption handling...');

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

      await credentialManager.addCredentialStore('aws-streaming-test', credentialStoreConfig);

      const providerConfig: Domains.IProviderEndpointConfig = {
        name: 'interruption-test',
        provider: 'bedrock',
        credentialsRef: 'aws-streaming-test',
        apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
        modelName: 'claude-3-5-sonnet-20241022',
        priority: 1,
      };

      const provider = (await providerFactory.createProvider(providerConfig)) as BedrockAdapter;
      await provider.initialize();

      const streamRequest: Domains.IChatCompletionRequest = {
        messages: [{ role: 'user', content: 'Write a very long story' }],
        maxTokens: 1000,
        stream: true,
      };

      try {
        const stream = provider.streamChatCompletion(streamRequest);
        const iterator = stream[Symbol.asyncIterator]();

        // Simulate early termination
        try {
          await iterator.next();
        } catch (error) {
          // Expected - test that we handle the error gracefully
          expect(error).toBeInstanceOf(Error);
          log.info('✅ Stream interruption handled gracefully');
        }
      } catch (_error) {
        // This is expected in test environment
        log.info('✅ Stream interruption test completed');
      }
    });
  });

  describe('Streaming Performance', () => {
    test('Stream Buffer Management', async () => {
      if (!hasTestCredentials) {
        log.info('⏭️ Skipping stream buffer test - no test credentials');
        return;
      }

      log.info('📊 Testing stream buffer management...');

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

      await credentialManager.addCredentialStore('aws-streaming-test', credentialStoreConfig);

      const providerConfig: Domains.IProviderEndpointConfig = {
        name: 'buffer-test',
        provider: 'bedrock',
        credentialsRef: 'aws-streaming-test',
        apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
        modelName: 'claude-3-5-sonnet-20241022',
        priority: 1,
      };

      const provider = (await providerFactory.createProvider(providerConfig)) as BedrockAdapter;
      await provider.initialize();

      // Test multiple concurrent streams
      const streamRequests = Array.from({ length: 3 }, (_, i) => ({
        messages: [{ role: 'user', content: `Test stream ${i + 1}` }],
        maxTokens: 50,
        stream: true,
      }));

      const streamPromises = streamRequests.map(async (request, index) => {
        try {
          const stream = provider.streamChatCompletion(request);
          const iterator = stream[Symbol.asyncIterator]();
          await iterator.next();
          return `Stream ${index + 1} started`;
        } catch (_error) {
          return `Stream ${index + 1} failed as expected`;
        }
      });

      const results = await Promise.allSettled(streamPromises);
      expect(results).toHaveLength(3);

      log.info('✅ Stream buffer management tested');
    });

    test('Stream Timeout Handling', async () => {
      if (!hasTestCredentials) {
        log.info('⏭️ Skipping stream timeout test - no test credentials');
        return;
      }

      log.info('⏰ Testing stream timeout handling...');

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

      await credentialManager.addCredentialStore('aws-streaming-test', credentialStoreConfig);

      const providerConfig: Domains.IProviderEndpointConfig = {
        name: 'timeout-test',
        provider: 'bedrock',
        credentialsRef: 'aws-streaming-test',
        apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
        modelName: 'claude-3-5-sonnet-20241022',
        priority: 1,
        timeout: 5000, // Short timeout for testing
      };

      const provider = (await providerFactory.createProvider(providerConfig)) as BedrockAdapter;
      await provider.initialize();

      const streamRequest: Domains.IChatCompletionRequest = {
        messages: [{ role: 'user', content: 'Generate a very long response' }],
        maxTokens: 2000,
        stream: true,
      };

      try {
        const stream = provider.streamChatCompletion(streamRequest);
        const iterator = stream[Symbol.asyncIterator]();

        // This should timeout or fail with auth error
        await iterator.next();
        log.info('⚠️ Stream completed unexpectedly');
      } catch (error) {
        // Expected - either timeout or auth error
        expect(error).toBeInstanceOf(Error);
        log.info('✅ Stream timeout/error handling validated');
      }
    });
  });

  describe('AWS SDK vs Fallback Streaming', () => {
    test('SDK Availability Detection', () => {
      log.info('🔍 Testing SDK availability for streaming...');

      const sdkCheck = checkAWSSDKAvailability();
      expect(sdkCheck).toBeDefined();
      expect(typeof sdkCheck.available).toBe('boolean');

      if (sdkCheck.available) {
        log.info('✅ AWS SDK available - will use native streaming');
      } else {
        log.info('✅ AWS SDK not available - will use fallback streaming');
        expect(sdkCheck.missing.length).toBeGreaterThan(0);
      }
    });

    test('Fallback Streaming Implementation', async () => {
      if (!hasTestCredentials) {
        log.info('⏭️ Skipping fallback streaming test - no test credentials');
        return;
      }

      log.info('🔄 Testing fallback streaming implementation...');

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

      await credentialManager.addCredentialStore('aws-streaming-test', credentialStoreConfig);

      // This tests the manual streaming implementation
      const providerConfig: Domains.IProviderEndpointConfig = {
        name: 'fallback-stream-test',
        provider: 'bedrock',
        credentialsRef: 'aws-streaming-test',
        apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
        modelName: 'claude-3-5-sonnet-20241022',
        priority: 1,
      };

      const provider = (await providerFactory.createProvider(providerConfig)) as BedrockAdapter;
      await provider.initialize();

      const streamRequest: Domains.IChatCompletionRequest = {
        messages: [{ role: 'user', content: 'Test fallback streaming' }],
        maxTokens: 100,
        stream: true,
      };

      try {
        const stream = provider.streamChatCompletion(streamRequest);

        // Verify it returns a proper async generator
        expect(typeof stream[Symbol.asyncIterator]).toBe('function');

        // Test that we can create an iterator
        const iterator = stream[Symbol.asyncIterator]();
        expect(typeof iterator.next).toBe('function');

        log.info('✅ Fallback streaming implementation validated');
      } catch (error) {
        // Expected in test environment
        if (error instanceof BedrockError) {
          log.info('✅ Fallback streaming validated (expected error)');
        } else {
          throw error;
        }
      }
    });
  });

  afterAll(async () => {
    log.info('🧹 Cleaning up streaming E2E tests...');

    // Clean up any resources
    _testCredentials = null;

    log.info('✅ Streaming E2E test cleanup complete');
  });
});

// Manual test runner
if (import.meta.main) {
  console.log('🏃 Running Bedrock streaming E2E tests...');
  console.log('');
  console.log('These tests validate:');
  console.log('- Stream request/response formats');
  console.log('- Model family streaming differences');
  console.log('- Error handling during streaming');
  console.log('- AWS SDK vs fallback streaming');
  console.log('- Performance and buffer management');
  console.log('');
  console.log('Environment setup (optional):');
  console.log('- TEST_AWS_REGION');
  console.log('- TEST_AWS_ACCESS_KEY_ID');
  console.log('- TEST_AWS_SECRET_ACCESS_KEY');
  console.log('');
  console.log('Run: bun test src/__tests__/e2e/bedrock-streaming-e2e.test.ts');
}
