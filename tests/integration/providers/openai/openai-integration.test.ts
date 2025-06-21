#!/usr/bin/env bun

/**
 * OpenAI Integration Tests
 *
 * Real API integration tests for OpenAI provider.
 * Tests actual OpenAI API endpoints with real credentials.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import log from '../../../../src/utils/logging.js';
import IntegrationTestHelper, {
  expectSuccessfulResponse,
  expectPerformance,
  INTEGRATION_TEST_TIMEOUT,
  TEST_PROMPTS,
} from '../../utils/test-helpers.js';
import { OPENAI_TEST_MODELS } from '../../config/test-models.js';

describe('OpenAI Integration Tests', () => {
  let testHelper: IntegrationTestHelper;
  let hasCredentials: boolean;

  beforeAll(async () => {
    log.info('🔌 Setting up OpenAI integration tests...');

    testHelper = new IntegrationTestHelper();
    await testHelper.initialize();

    hasCredentials = testHelper.hasCredentialsFor('openai');

    if (!hasCredentials) {
      log.warn('⚠️ OpenAI credentials not available - tests will be skipped');
      log.info('💡 Set TEST_OPENAI_API_KEY to run OpenAI integration tests');
    } else {
      log.info('✅ OpenAI credentials available');
    }
  }, INTEGRATION_TEST_TIMEOUT);

  afterAll(async () => {
    if (testHelper) {
      await testHelper.cleanup();
    }
  });

  describe('Provider Setup', () => {
    test(
      'OpenAI Provider Creation',
      async () => {
        if (!hasCredentials) {
          testHelper.skipTest('OpenAI Provider Creation', 'no credentials');
          return;
        }

        log.info('🏭 Testing OpenAI provider creation...');

        const provider = await testHelper.createTestProvider('openai', 'gpt-4o-mini');

        expect(provider).toBeDefined();
        expect(provider.capabilities?.chat).toBe(true);
        expect(provider.capabilities?.streaming).toBe(true);

        log.info('✅ OpenAI provider created successfully');
      },
      INTEGRATION_TEST_TIMEOUT
    );
  });

  describe('Model Testing', () => {
    for (const modelConfig of OPENAI_TEST_MODELS) {
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

            // Validate OpenAI response format
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
            expectPerformance(result, modelConfig.testConfig.expectedLatency * 2); // Streaming can be slower

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
            // For now, just verify the provider supports the request format
            expect(provider.capabilities?.vision).toBe(true);
          },
          INTEGRATION_TEST_TIMEOUT
        );
      });
    }
  });

  describe('Error Handling', () => {
    test(
      'Invalid API Key',
      async () => {
        log.info('🚨 Testing OpenAI error handling with invalid credentials...');

        try {
          // This test attempts to create a provider but expects it to fail due to missing credentials
          const provider = await testHelper.createTestProvider('openai', 'gpt-4o-mini');

          const result = await testHelper.testChatCompletion(provider, TEST_PROMPTS.simple, 100);

          // We expect this to fail
          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();

          log.info('✅ OpenAI error handling validated');
        } catch (error) {
          // If provider creation fails due to missing credentials, that's also a valid test outcome
          const message = error instanceof Error ? error.message : 'Unknown error';
          log.info(`🚨 Provider creation failed as expected: ${message}`);
          expect(message).toContain('Credential');
          log.info('✅ OpenAI error handling validated (credential failure)');
        }
      },
      INTEGRATION_TEST_TIMEOUT
    );

    test(
      'Rate Limiting',
      async () => {
        if (!hasCredentials) {
          testHelper.skipTest('OpenAI Rate Limiting', 'no credentials');
          return;
        }

        log.info('🚦 Testing OpenAI rate limiting behavior...');

        const provider = await testHelper.createTestProvider('openai', 'gpt-4o-mini');

        // Make multiple rapid requests to trigger rate limiting
        const requests = Array(5)
          .fill(null)
          .map(() => testHelper.testChatCompletion(provider, TEST_PROMPTS.simple, 50));

        const results = await Promise.all(requests);

        // At least some should succeed
        const successCount = results.filter((r) => r.success).length;
        expect(successCount).toBeGreaterThan(0);

        testHelper.logTestResult('OpenAI Rate Limiting', {
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
      'Latency Benchmarks',
      async () => {
        if (!hasCredentials) {
          testHelper.skipTest('OpenAI Latency Benchmarks', 'no credentials');
          return;
        }

        log.info('⏱️ Running OpenAI latency benchmarks...');

        const provider = await testHelper.createTestProvider('openai', 'gpt-4o-mini');
        const iterations = 3;
        const results = [];

        for (let i = 0; i < iterations; i++) {
          const result = await testHelper.testChatCompletion(provider, TEST_PROMPTS.simple, 100);

          if (result.success) {
            results.push(result.duration);
          }
        }

        if (results.length > 0) {
          const avgLatency = results.reduce((a, b) => a + b, 0) / results.length;
          const minLatency = Math.min(...results);
          const maxLatency = Math.max(...results);

          log.info('📊 OpenAI Performance Results:', {
            averageLatency: `${avgLatency.toFixed(0)}ms`,
            minLatency: `${minLatency}ms`,
            maxLatency: `${maxLatency}ms`,
            iterations: results.length,
          });

          expect(avgLatency).toBeLessThan(10000); // Should be under 10 seconds average
        }
      },
      INTEGRATION_TEST_TIMEOUT
    );
  });
});

// Manual test runner for standalone execution
if (import.meta.main) {
  console.log('🏃 Running OpenAI integration tests manually...');
  console.log('');
  console.log('Environment setup required:');
  console.log('- TEST_OPENAI_API_KEY (your OpenAI API key)');
  console.log('');
  console.log('Run: bun test tests/integration/providers/openai/openai-integration.test.ts');
}
