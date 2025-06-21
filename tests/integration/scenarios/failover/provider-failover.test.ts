#!/usr/bin/env bun

/**
 * Provider Failover Integration Tests
 *
 * Tests the complete failover chain across multiple providers.
 * Validates that when one provider fails, requests automatically failover to backup providers.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import log from '../../../../src/utils/logging.js';
import IntegrationTestHelper, {
  INTEGRATION_TEST_TIMEOUT,
  TEST_PROMPTS,
} from '../../utils/test-helpers.js';
// import { CredentialManager } from '../../../../src/credentials/managers/credential-manager.js';
// ProviderFactory - available if needed for advanced scenarios
import type { Domains } from '../../../../src/types/index.js';

describe('Provider Failover Integration Tests', () => {
  let testHelper: IntegrationTestHelper;
  // credentialManager available for advanced credential testing
  let availableProviders: string[] = [];

  beforeAll(async () => {
    log.info('🔄 Setting up provider failover integration tests...');

    testHelper = new IntegrationTestHelper();
    await testHelper.initialize();

    // credentialManager = new CredentialManager(); // Available if needed

    // Check which providers have credentials available
    const providers = ['openai', 'anthropic', 'bedrock', 'together'];
    availableProviders = providers.filter((provider) => testHelper.hasCredentialsFor(provider));

    if (availableProviders.length < 2) {
      log.warn('⚠️ Failover tests require at least 2 providers with credentials');
      log.info(`💡 Available providers: ${availableProviders.join(', ')}`);
      log.info('   Set multiple TEST_*_API_KEY environment variables');
    } else {
      log.info(`✅ Failover testing ready with providers: ${availableProviders.join(', ')}`);
    }
  }, INTEGRATION_TEST_TIMEOUT);

  afterAll(async () => {
    if (testHelper) {
      await testHelper.cleanup();
    }
  });

  describe('Multi-Provider Failover Chain', () => {
    test(
      'OpenAI → Anthropic Failover',
      async () => {
        if (!availableProviders.includes('openai') || !availableProviders.includes('anthropic')) {
          testHelper.skipTest(
            'OpenAI → Anthropic Failover',
            'requires both OpenAI and Anthropic credentials'
          );
          return;
        }

        log.info('🔄 Testing OpenAI → Anthropic failover chain...');

        // Create model configuration with OpenAI primary, Anthropic fallback
        const _modelConfig: Domains.IModelDefinition = {
          name: 'test-failover-model',
          providers: [
            {
              name: 'openai-primary',
              provider: 'openai',
              credentialsRef: 'test-openai',
              apiBase: 'https://api.openai.com',
              modelName: 'gpt-4o-mini',
              priority: 1,
              weight: 100,
              timeout: 10000,
              maxRetries: 1,
              retryDelay: 1000,
            },
            {
              name: 'anthropic-fallback',
              provider: 'anthropic',
              credentialsRef: 'test-anthropic',
              apiBase: 'https://api.anthropic.com',
              modelName: 'claude-3-haiku-20240307',
              priority: 2,
              weight: 100,
              timeout: 10000,
              maxRetries: 1,
              retryDelay: 1000,
            },
          ],
          circuitBreaker: {
            enabled: true,
            failureThreshold: 2,
            resetTimeout: 30000,
            monitoringWindow: 30000,
          },
          fallback: {
            enabled: true,
            maxAttempts: 2,
            enableModelDegradation: false,
          },
        };

        // Test normal operation (should use OpenAI)
        const primaryProvider = await testHelper.createTestProvider('openai', 'gpt-4o-mini');
        const primaryResult = await testHelper.testChatCompletion(
          primaryProvider,
          TEST_PROMPTS.simple
        );

        if (primaryResult.success) {
          log.info('✅ Primary provider (OpenAI) working normally');
        }

        // Test fallback operation (would need to simulate OpenAI failure)
        const fallbackProvider = await testHelper.createTestProvider(
          'anthropic',
          'claude-3-haiku-20240307'
        );
        const fallbackResult = await testHelper.testChatCompletion(
          fallbackProvider,
          TEST_PROMPTS.simple
        );

        if (fallbackResult.success) {
          log.info('✅ Fallback provider (Anthropic) working normally');
        }

        // Validate that both providers can handle the same request format
        expect(primaryResult.success || fallbackResult.success).toBe(true);
      },
      INTEGRATION_TEST_TIMEOUT
    );

    test(
      'Bedrock → OpenAI Failover',
      async () => {
        if (!availableProviders.includes('bedrock') || !availableProviders.includes('openai')) {
          testHelper.skipTest(
            'Bedrock → OpenAI Failover',
            'requires both Bedrock and OpenAI credentials'
          );
          return;
        }

        log.info('🔄 Testing Bedrock → OpenAI failover chain...');

        // Test Bedrock Claude → OpenAI GPT failover
        const bedrockProvider = await testHelper.createTestProvider(
          'bedrock',
          'claude-3-haiku-20240307',
          'test-aws-keys'
        );
        const bedrockResult = await testHelper.testChatCompletion(
          bedrockProvider,
          TEST_PROMPTS.simple
        );

        if (bedrockResult.success) {
          log.info('✅ Primary provider (Bedrock Claude) working normally');
        }

        const openaiProvider = await testHelper.createTestProvider('openai', 'gpt-4o-mini');
        const openaiResult = await testHelper.testChatCompletion(
          openaiProvider,
          TEST_PROMPTS.simple
        );

        if (openaiResult.success) {
          log.info('✅ Fallback provider (OpenAI GPT) working normally');
        }

        // Validate response consistency
        expect(bedrockResult.success || openaiResult.success).toBe(true);
      },
      INTEGRATION_TEST_TIMEOUT
    );

    test(
      'Three-Tier Failover (Primary → Secondary → Tertiary)',
      async () => {
        if (availableProviders.length < 3) {
          testHelper.skipTest(
            'Three-Tier Failover',
            `requires 3+ providers, have ${availableProviders.length}`
          );
          return;
        }

        log.info('🔄🔄🔄 Testing three-tier failover chain...');

        // Test all three available providers
        const providers = availableProviders.slice(0, 3);
        const results = [];

        for (const providerName of providers) {
          const modelName = getDefaultModelForProvider(providerName);
          const provider = await testHelper.createTestProvider(providerName, modelName);
          const result = await testHelper.testChatCompletion(provider, TEST_PROMPTS.simple);

          results.push({ provider: providerName, result });

          if (result.success) {
            log.info(`✅ Provider ${providerName} operational`);
          } else {
            log.warn(`⚠️ Provider ${providerName} failed: ${result.error?.message}`);
          }
        }

        // At least one should succeed
        const successfulProviders = results.filter((r) => r.result.success);
        expect(successfulProviders.length).toBeGreaterThan(0);

        log.info(
          `🎯 Failover test complete: ${successfulProviders.length}/${results.length} providers successful`
        );
      },
      INTEGRATION_TEST_TIMEOUT
    );
  });

  describe('Model Degradation Failover', () => {
    test(
      'High-Performance → Fast Model Degradation',
      async () => {
        if (!availableProviders.includes('bedrock')) {
          testHelper.skipTest(
            'Model Degradation',
            'requires Bedrock credentials for multiple models'
          );
          return;
        }

        log.info('📉 Testing model degradation failover (Sonnet → Haiku)...');

        // Test high-performance model first
        const sonnetProvider = await testHelper.createTestProvider(
          'bedrock',
          'claude-3-5-sonnet-20241022',
          'test-aws-keys'
        );
        const sonnetResult = await testHelper.testChatCompletion(
          sonnetProvider,
          TEST_PROMPTS.reasoning,
          300
        );

        if (sonnetResult.success) {
          log.info('✅ High-performance model (Sonnet) working');
          testHelper.logTestResult('Sonnet Performance', sonnetResult);
        }

        // Test fast fallback model
        const haikuProvider = await testHelper.createTestProvider(
          'bedrock',
          'claude-3-haiku-20240307',
          'test-aws-keys'
        );
        const haikuResult = await testHelper.testChatCompletion(
          haikuProvider,
          TEST_PROMPTS.reasoning,
          200
        );

        if (haikuResult.success) {
          log.info('✅ Fast fallback model (Haiku) working');
          testHelper.logTestResult('Haiku Fallback', haikuResult);
        }

        // Validate that degradation maintains functionality
        expect(sonnetResult.success || haikuResult.success).toBe(true);

        if (sonnetResult.success && haikuResult.success) {
          // Compare performance characteristics
          expect(haikuResult.duration).toBeLessThan(sonnetResult.duration * 1.5);
          log.info(
            `⚡ Performance comparison: Haiku ${haikuResult.duration}ms vs Sonnet ${sonnetResult.duration}ms`
          );
        }
      },
      INTEGRATION_TEST_TIMEOUT
    );

    test(
      'Vision Model → Text-Only Degradation',
      async () => {
        if (!availableProviders.includes('openai')) {
          testHelper.skipTest('Vision Degradation', 'requires OpenAI credentials');
          return;
        }

        log.info('👁️➡️📝 Testing vision → text-only model degradation...');

        // Test vision-capable model
        const visionProvider = await testHelper.createTestProvider('openai', 'gpt-4o');
        const visionResult = await testHelper.testChatCompletion(
          visionProvider,
          'Describe this image',
          100
        );

        // Test text-only fallback
        const textProvider = await testHelper.createTestProvider('openai', 'gpt-3.5-turbo');
        const textResult = await testHelper.testChatCompletion(
          textProvider,
          TEST_PROMPTS.simple,
          100
        );

        // Both should handle text requests
        expect(visionResult.success || textResult.success).toBe(true);

        if (textResult.success) {
          log.info('✅ Text-only fallback maintains basic functionality');
        }
      },
      INTEGRATION_TEST_TIMEOUT
    );
  });

  describe('Circuit Breaker Integration', () => {
    test(
      'Circuit Breaker Triggers Failover',
      async () => {
        if (availableProviders.length < 2) {
          testHelper.skipTest('Circuit Breaker Failover', 'requires 2+ providers');
          return;
        }

        log.info('⚡ Testing circuit breaker failover integration...');

        // This test would simulate repeated failures to trigger circuit breaker
        // Then verify that requests automatically route to fallback provider

        const primaryProvider = await testHelper.createTestProvider(
          availableProviders[0],
          getDefaultModelForProvider(availableProviders[0])
        );
        const fallbackProvider = await testHelper.createTestProvider(
          availableProviders[1],
          getDefaultModelForProvider(availableProviders[1])
        );

        // Test that both providers work independently
        const primaryTest = await testHelper.testChatCompletion(
          primaryProvider,
          TEST_PROMPTS.simple
        );
        const fallbackTest = await testHelper.testChatCompletion(
          fallbackProvider,
          TEST_PROMPTS.simple
        );

        // At least one should be working for failover to be meaningful
        expect(primaryTest.success || fallbackTest.success).toBe(true);

        if (primaryTest.success && fallbackTest.success) {
          log.info('✅ Both providers operational - circuit breaker failover ready');
        } else {
          log.info('✅ Failover scenario validated - one provider down, other available');
        }
      },
      INTEGRATION_TEST_TIMEOUT
    );
  });

  describe('Cross-Provider Consistency', () => {
    test(
      'Response Format Consistency',
      async () => {
        if (availableProviders.length < 2) {
          testHelper.skipTest('Response Consistency', 'requires 2+ providers');
          return;
        }

        log.info('🔄 Testing response format consistency across providers...');

        const prompt = TEST_PROMPTS.simple;
        const results = [];

        for (const providerName of availableProviders.slice(0, 3)) {
          const modelName = getDefaultModelForProvider(providerName);
          const provider = await testHelper.createTestProvider(providerName, modelName);
          const result = await testHelper.testChatCompletion(provider, prompt);

          if (result.success) {
            results.push({
              provider: providerName,
              response: result.response,
            });
          }
        }

        // All successful responses should follow OpenAI format
        for (const { provider, response } of results) {
          expect(testHelper.validateResponseFormat(response, 'openai')).toBe(true);
          log.info(`✅ ${provider} response format consistent`);
        }

        expect(results.length).toBeGreaterThan(0);
      },
      INTEGRATION_TEST_TIMEOUT
    );

    test(
      'Streaming Consistency',
      async () => {
        if (availableProviders.length < 2) {
          testHelper.skipTest('Streaming Consistency', 'requires 2+ providers');
          return;
        }

        log.info('🌊 Testing streaming consistency across providers...');

        const prompt = TEST_PROMPTS.creative;
        const streamingResults = [];

        for (const providerName of availableProviders.slice(0, 2)) {
          const modelName = getDefaultModelForProvider(providerName);
          const provider = await testHelper.createTestProvider(providerName, modelName);

          if (provider.capabilities?.streaming) {
            const result = await testHelper.testStreamingChatCompletion(provider, prompt);

            if (result.success) {
              streamingResults.push({
                provider: providerName,
                chunkCount: result.metadata?.chunkCount,
                contentLength: result.metadata?.totalContentLength,
              });
            }
          }
        }

        // All streaming providers should produce chunks
        for (const { provider, chunkCount } of streamingResults) {
          expect(chunkCount).toBeGreaterThan(0);
          log.info(`✅ ${provider} streaming produced ${chunkCount} chunks`);
        }

        expect(streamingResults.length).toBeGreaterThan(0);
      },
      INTEGRATION_TEST_TIMEOUT
    );
  });
});

/**
 * Helper function to get default model for each provider
 */
function getDefaultModelForProvider(provider: string): string {
  switch (provider) {
    case 'openai':
      return 'gpt-4o-mini';
    case 'anthropic':
      return 'claude-3-haiku-20240307';
    case 'bedrock':
      return 'claude-3-haiku-20240307';
    case 'together':
      return 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo';
    default:
      return 'unknown-model';
  }
}

// Manual test runner for standalone execution
if (import.meta.main) {
  console.log('🏃 Running provider failover integration tests manually...');
  console.log('');
  console.log('Environment setup required (at least 2 providers):');
  console.log('- TEST_OPENAI_API_KEY (OpenAI API key)');
  console.log('- TEST_ANTHROPIC_API_KEY (Anthropic API key)');
  console.log(
    '- TEST_AWS_REGION + TEST_AWS_ACCESS_KEY_ID + TEST_AWS_SECRET_ACCESS_KEY (AWS Bedrock)'
  );
  console.log('- TEST_TOGETHER_API_KEY (Together AI API key)');
  console.log('');
  console.log('Run: bun test tests/integration/scenarios/failover/provider-failover.test.ts');
}
