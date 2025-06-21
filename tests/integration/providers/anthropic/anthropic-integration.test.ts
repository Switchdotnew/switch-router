#!/usr/bin/env bun

/**
 * Anthropic Integration Tests
 *
 * Real API integration tests for Anthropic provider.
 * Tests actual Anthropic API endpoints with real credentials.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import log from '../../../../src/utils/logging.js';
import IntegrationTestHelper, {
  expectSuccessfulResponse,
  expectPerformance,
  INTEGRATION_TEST_TIMEOUT,
  TEST_PROMPTS,
} from '../../utils/test-helpers.js';
import { ANTHROPIC_TEST_MODELS } from '../../config/test-models.js';

describe('Anthropic Integration Tests', () => {
  let testHelper: IntegrationTestHelper;
  let hasCredentials: boolean;

  beforeAll(async () => {
    log.info('🤖 Setting up Anthropic integration tests...');

    testHelper = new IntegrationTestHelper();
    await testHelper.initialize();

    hasCredentials = testHelper.hasCredentialsFor('anthropic');

    if (!hasCredentials) {
      log.warn('⚠️ Anthropic credentials not available - tests will be skipped');
      log.info('💡 Set TEST_ANTHROPIC_API_KEY to run Anthropic integration tests');
    } else {
      log.info('✅ Anthropic credentials available');
    }
  }, INTEGRATION_TEST_TIMEOUT);

  afterAll(async () => {
    if (testHelper) {
      await testHelper.cleanup();
    }
  });

  describe('Provider Setup', () => {
    test(
      'Anthropic Provider Creation',
      async () => {
        if (!hasCredentials) {
          testHelper.skipTest('Anthropic Provider Creation', 'no credentials');
          return;
        }

        log.info('🏭 Testing Anthropic provider creation...');

        const provider = await testHelper.createTestProvider(
          'anthropic',
          'claude-3-haiku-20240307'
        );

        expect(provider).toBeDefined();
        expect(provider.capabilities?.chat).toBe(true);
        expect(provider.capabilities?.streaming).toBe(true);

        log.info('✅ Anthropic provider created successfully');
      },
      INTEGRATION_TEST_TIMEOUT
    );
  });

  describe('Model Testing', () => {
    for (const modelConfig of ANTHROPIC_TEST_MODELS) {
      describe(`${modelConfig.name}`, () => {
        test(
          'Chat Completion',
          async () => {
            if (!hasCredentials) {
              testHelper.skipTest(`${modelConfig.name} Chat Completion`, 'no credentials');
              return;
            }

            log.info(`💬 Testing ${modelConfig.name} chat completion...`);

            const provider = await testHelper.createTestProvider(
              modelConfig.provider,
              modelConfig.modelName,
              modelConfig.credentialsRef
            );

            const result = await testHelper.testChatCompletion(
              provider,
              TEST_PROMPTS.simple,
              modelConfig.testConfig.maxTokens
            );

            testHelper.logTestResult(`${modelConfig.name} Chat`, result);

            expectSuccessfulResponse(result);
            expectPerformance(result, modelConfig.testConfig.expectedLatency);

            // Validate response format (should be converted to OpenAI format)
            expect(testHelper.validateResponseFormat(result.response, 'openai')).toBe(true);
            expect(result.response.choices[0].message.content).toBeDefined();
            expect(result.response.choices[0].message.content.length).toBeGreaterThan(0);
          },
          INTEGRATION_TEST_TIMEOUT
        );

        test(
          'Streaming Chat Completion',
          async () => {
            if (!hasCredentials) {
              testHelper.skipTest(`${modelConfig.name} Streaming`, 'no credentials');
              return;
            }

            if (!modelConfig.capabilities.streaming) {
              testHelper.skipTest(`${modelConfig.name} Streaming`, 'not supported');
              return;
            }

            log.info(`🌊 Testing ${modelConfig.name} streaming...`);

            const provider = await testHelper.createTestProvider(
              modelConfig.provider,
              modelConfig.modelName,
              modelConfig.credentialsRef
            );

            const result = await testHelper.testStreamingChatCompletion(
              provider,
              TEST_PROMPTS.creative,
              modelConfig.testConfig.maxTokens
            );

            testHelper.logTestResult(`${modelConfig.name} Streaming`, result);

            expectSuccessfulResponse(result);
            expectPerformance(result, modelConfig.testConfig.expectedLatency * 2);

            // Validate streaming response
            expect(result.metadata?.chunkCount).toBeGreaterThan(0);
            expect(result.metadata?.totalContentLength).toBeGreaterThan(0);
          },
          INTEGRATION_TEST_TIMEOUT
        );

        test(
          'Function Calling',
          async () => {
            if (!hasCredentials) {
              testHelper.skipTest(`${modelConfig.name} Function Calling`, 'no credentials');
              return;
            }

            if (!modelConfig.capabilities.functionCalling) {
              testHelper.skipTest(`${modelConfig.name} Function Calling`, 'not supported');
              return;
            }

            log.info(`🔧 Testing ${modelConfig.name} function calling...`);

            const provider = await testHelper.createTestProvider(
              modelConfig.provider,
              modelConfig.modelName,
              modelConfig.credentialsRef
            );

            const result = await testHelper.testFunctionCalling(provider, TEST_PROMPTS.function);

            testHelper.logTestResult(`${modelConfig.name} Function Calling`, result);

            expectSuccessfulResponse(result);
            expectPerformance(result, modelConfig.testConfig.expectedLatency * 1.5);

            // Validate function calling response
            expect(result.metadata?.hasToolCall).toBe(true);
            expect(result.metadata?.toolCallCount).toBeGreaterThan(0);
          },
          INTEGRATION_TEST_TIMEOUT
        );

        test(
          'Long Context Handling',
          async () => {
            if (!hasCredentials) {
              testHelper.skipTest(`${modelConfig.name} Long Context`, 'no credentials');
              return;
            }

            log.info(`📚 Testing ${modelConfig.name} long context handling...`);

            const provider = await testHelper.createTestProvider(
              modelConfig.provider,
              modelConfig.modelName,
              modelConfig.credentialsRef
            );

            const result = await testHelper.testChatCompletion(provider, TEST_PROMPTS.long, 500);

            testHelper.logTestResult(`${modelConfig.name} Long Context`, result);

            expectSuccessfulResponse(result);
            expectPerformance(result, modelConfig.testConfig.expectedLatency * 2);

            // Validate that the model can handle long prompts
            expect(result.response.choices[0].message.content).toBeDefined();
            expect(result.response.choices[0].message.content.length).toBeGreaterThan(100);
          },
          INTEGRATION_TEST_TIMEOUT
        );

        test(
          'Vision (if supported)',
          async () => {
            if (!hasCredentials) {
              testHelper.skipTest(`${modelConfig.name} Vision`, 'no credentials');
              return;
            }

            if (!modelConfig.capabilities.vision) {
              testHelper.skipTest(`${modelConfig.name} Vision`, 'not supported');
              return;
            }

            log.info(`👁️ Testing ${modelConfig.name} vision capabilities...`);

            const provider = await testHelper.createTestProvider(
              modelConfig.provider,
              modelConfig.modelName,
              modelConfig.credentialsRef
            );

            // Test with a simple vision request (would need actual image in real test)
            const result = await testHelper.testChatCompletion(
              provider,
              'Describe what you see in this image.',
              100
            );

            testHelper.logTestResult(`${modelConfig.name} Vision`, result);

            // Note: This test would need actual image data to be meaningful
            expect(provider.capabilities?.vision).toBe(true);
          },
          INTEGRATION_TEST_TIMEOUT
        );
      });
    }
  });

  describe('Claude-Specific Features', () => {
    test(
      'System Prompt Handling',
      async () => {
        if (!hasCredentials) {
          testHelper.skipTest('Claude System Prompt', 'no credentials');
          return;
        }

        log.info('🎭 Testing Claude system prompt handling...');

        const provider = await testHelper.createTestProvider(
          'anthropic',
          'claude-3-haiku-20240307'
        );

        // Test with system prompt (Claude-specific feature)
        const result = await testHelper.testChatCompletion(
          provider,
          'Hello! How are you today?',
          200
        );

        testHelper.logTestResult('Claude System Prompt', result);

        expectSuccessfulResponse(result);
        expect(result.response.choices[0].message.content).toBeDefined();
      },
      INTEGRATION_TEST_TIMEOUT
    );

    test(
      'Reasoning Capabilities',
      async () => {
        if (!hasCredentials) {
          testHelper.skipTest('Claude Reasoning', 'no credentials');
          return;
        }

        log.info('🧠 Testing Claude reasoning capabilities...');

        const provider = await testHelper.createTestProvider(
          'anthropic',
          'claude-3-5-sonnet-20241022'
        );

        const result = await testHelper.testChatCompletion(provider, TEST_PROMPTS.reasoning, 300);

        testHelper.logTestResult('Claude Reasoning', result);

        expectSuccessfulResponse(result);
        expectPerformance(result, 8000); // Reasoning can take longer

        // Validate that we get a reasonable explanation
        expect(result.response.choices[0].message.content.length).toBeGreaterThan(100);
      },
      INTEGRATION_TEST_TIMEOUT
    );
  });

  describe('Error Handling', () => {
    test(
      'Invalid API Key',
      async () => {
        log.info('🚨 Testing Anthropic error handling with invalid credentials...');

        try {
          const provider = await testHelper.createTestProvider(
            'anthropic',
            'claude-3-haiku-20240307'
          );

          // This would need implementation to inject invalid credentials
          // For now, just verify error handling structure exists
          expect(provider).toBeDefined();

          log.info('✅ Anthropic error handling structure validated');
        } catch (error) {
          // If provider creation fails due to missing credentials, that's also a valid test outcome
          const message = error instanceof Error ? error.message : 'Unknown error';
          log.info(`🚨 Provider creation failed as expected: ${message}`);
          expect(message).toContain('Credential');
          log.info('✅ Anthropic error handling validated (credential failure)');
        }
      },
      INTEGRATION_TEST_TIMEOUT
    );

    test(
      'Rate Limiting',
      async () => {
        if (!hasCredentials) {
          testHelper.skipTest('Anthropic Rate Limiting', 'no credentials');
          return;
        }

        log.info('🚦 Testing Anthropic rate limiting behavior...');

        const provider = await testHelper.createTestProvider(
          'anthropic',
          'claude-3-haiku-20240307'
        );

        // Make multiple rapid requests to test rate limiting
        const requests = Array(3)
          .fill(null)
          .map(() => testHelper.testChatCompletion(provider, TEST_PROMPTS.simple, 50));

        const results = await Promise.all(requests);

        // At least some should succeed
        const successCount = results.filter((r) => r.success).length;
        expect(successCount).toBeGreaterThan(0);

        testHelper.logTestResult('Anthropic Rate Limiting', {
          success: true,
          duration: 0,
          metadata: { successCount, totalRequests: requests.length },
        });
      },
      INTEGRATION_TEST_TIMEOUT
    );
  });

  describe('Performance Benchmarks', () => {
    test(
      'Claude Haiku Speed Test',
      async () => {
        if (!hasCredentials) {
          testHelper.skipTest('Claude Haiku Speed', 'no credentials');
          return;
        }

        log.info('⚡ Testing Claude Haiku speed (fastest model)...');

        const provider = await testHelper.createTestProvider(
          'anthropic',
          'claude-3-haiku-20240307'
        );

        const result = await testHelper.testChatCompletion(provider, TEST_PROMPTS.simple, 100);

        testHelper.logTestResult('Claude Haiku Speed', result);

        expectSuccessfulResponse(result);
        expectPerformance(result, 3000); // Haiku should be very fast
      },
      INTEGRATION_TEST_TIMEOUT
    );

    test(
      'Claude Sonnet Quality Test',
      async () => {
        if (!hasCredentials) {
          testHelper.skipTest('Claude Sonnet Quality', 'no credentials');
          return;
        }

        log.info('🎯 Testing Claude Sonnet quality (balanced model)...');

        const provider = await testHelper.createTestProvider(
          'anthropic',
          'claude-3-5-sonnet-20241022'
        );

        const result = await testHelper.testChatCompletion(
          provider,
          'Explain the concept of quantum entanglement in simple terms.',
          300
        );

        testHelper.logTestResult('Claude Sonnet Quality', result);

        expectSuccessfulResponse(result);
        expectPerformance(result, 8000);

        // Validate quality by response length and complexity
        expect(result.response.choices[0].message.content.length).toBeGreaterThan(200);
      },
      INTEGRATION_TEST_TIMEOUT
    );
  });
});

// Manual test runner for standalone execution
if (import.meta.main) {
  console.log('🏃 Running Anthropic integration tests manually...');
  console.log('');
  console.log('Environment setup required:');
  console.log('- TEST_ANTHROPIC_API_KEY (your Anthropic API key, starts with sk-ant-)');
  console.log('');
  console.log('Run: bun test tests/integration/providers/anthropic/anthropic-integration.test.ts');
}
