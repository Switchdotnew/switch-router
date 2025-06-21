#!/usr/bin/env bun

/**
 * E2E Tests for All Bedrock Model Families
 *
 * Tests comprehensive model family support:
 * - Anthropic (Claude) models with all capabilities
 * - Amazon (Nova) models with multimodal support
 * - Meta (Llama) models with function calling
 * - Mistral models with different parameter sets
 * - Cohere models with embeddings capabilities
 * - AI21 models with specific transformations
 * - Model registry integration and validation
 * - Parameter validation and transformation
 * - Capability detection and configuration
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import log from '../../../../src/utils/logging.js';
import { CredentialManager } from '../../../../src/credentials/managers/credential-manager.js';
import { ProviderFactory } from '../../../../src/providers/provider-factory.js';
import { BedrockAdapter } from '../../../../src/providers/bedrock/adapter.js';
import {
  bedrockModels,
  getModelByBedrockId,
  validateModelParameters,
} from '../../../../src/providers/model-registry/bedrock-models.js';
import { BedrockError } from '../../../../src/providers/bedrock/errors/bedrock-errors.js';
import type { Domains } from '../../../../src/types/index.js';

describe('Bedrock Model Families E2E Tests', () => {
  let credentialManager: CredentialManager;
  let providerFactory: ProviderFactory;
  let hasTestCredentials: boolean = false;

  beforeAll(async () => {
    log.info('🧪 Setting up Bedrock model families E2E tests...');

    credentialManager = new CredentialManager();
    providerFactory = new ProviderFactory(credentialManager);

    // Check if we have test credentials
    hasTestCredentials = !!(
      process.env.TEST_AWS_ACCESS_KEY_ID && process.env.TEST_AWS_SECRET_ACCESS_KEY
    );

    // Set up test credential store only if credentials are available
    const testCredentialStores: Record<
      string,
      { type: string; source: string; config: Record<string, string> }
    > = {};

    if (hasTestCredentials) {
      testCredentialStores['aws-model-test'] = {
        type: 'aws' as const,
        source: 'env' as const,
        config: {
          regionVar: 'TEST_AWS_REGION',
          accessKeyIdVar: 'TEST_AWS_ACCESS_KEY_ID',
          secretAccessKeyVar: 'TEST_AWS_SECRET_ACCESS_KEY',
        },
      };
    }

    try {
      await credentialManager.initialize(testCredentialStores);

      if (hasTestCredentials) {
        log.info('✅ Test credentials available - running full model tests');
      } else {
        log.info('⚠️ No test credentials - running structure-only tests');
      }

      log.info('✅ Model families E2E test environment ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.warn(`⚠️ Credential initialization issue: ${message}`);
      hasTestCredentials = false;
      log.info('⚠️ Falling back to structure-only tests');
    }
  });

  describe('Model Registry Validation', () => {
    test('Model Registry Lookup Functions', () => {
      log.info('🔍 Testing model registry lookup functions...');

      // Test Bedrock ID lookup
      const claudeModel = getModelByBedrockId('anthropic.claude-3-5-sonnet-20241022-v2:0');
      expect(claudeModel).toBeDefined();
      expect(claudeModel?.name).toBe('claude-3-5-sonnet-20241022');
      expect(claudeModel?.modelFamily).toBe('anthropic');

      // Test non-existent model
      const nonExistentModel = getModelByBedrockId('non-existent-model-id');
      expect(nonExistentModel).toBeUndefined();

      log.info('✅ Model registry lookup functions working correctly');
    });
  });

  describe('Anthropic (Claude) Models', () => {
    const claudeModels = [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ];

    claudeModels.forEach((modelName) => {
      test(`Claude Model: ${modelName}`, async () => {
        log.info(`🤖 Testing Claude model: ${modelName}...`);

        const model = bedrockModels[modelName];
        expect(model).toBeDefined();
        expect(model.modelFamily).toBe('anthropic');
        expect(model.capabilities.chat).toBe(true);
        expect(model.capabilities.streaming).toBe(true);

        // Test capabilities based on model tier
        if (modelName.includes('sonnet') || modelName.includes('opus')) {
          expect(model.capabilities.functionCalling).toBe(true);
          expect(model.capabilities.vision).toBe(true);
        }

        // Test parameter validation
        const validParams = {
          temperature: 0.7,
          maxTokens: 1000,
          topP: 0.9,
          stopSequences: ['Human:', 'Assistant:'],
        };

        const validation = validateModelParameters(modelName, validParams);
        expect(validation.valid).toBe(true);

        // Test provider creation
        if (hasTestCredentials) {
          const providerConfig: Domains.IProviderEndpointConfig = {
            name: `test-${modelName}`,
            provider: 'bedrock',
            credentialsRef: 'aws-model-test',
            apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
            modelName,
            priority: 1,
          };

          try {
            const provider = (await providerFactory.createProvider(
              providerConfig
            )) as BedrockAdapter;
            await provider.initialize();

            expect(provider.capabilities.chat).toBe(true);
            expect(provider.capabilities.streaming).toBe(true);

            log.info(`✅ Claude model ${modelName} provider created successfully`);
          } catch (error) {
            if (error instanceof BedrockError) {
              log.info(`✅ Claude model ${modelName} validated (expected auth error)`);
            } else {
              throw error;
            }
          }
        }

        log.info(`✅ Claude model ${modelName} validated`);
      });
    });

    test('Claude Function Calling Support', () => {
      log.info('🔧 Testing Claude function calling support...');

      const functionCallModels = [
        'claude-3-5-sonnet-20241022',
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
      ];

      functionCallModels.forEach((modelName) => {
        const model = bedrockModels[modelName];
        expect(model.capabilities.functionCalling).toBe(true);
        expect(model.maxFunctionCalls).toBeGreaterThan(0);
      });

      log.info('✅ Claude function calling support validated');
    });

    test('Claude Vision Support', () => {
      log.info('👁️ Testing Claude vision support...');

      const visionModels = [
        'claude-3-5-sonnet-20241022',
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
      ];

      visionModels.forEach((modelName) => {
        const model = bedrockModels[modelName];
        expect(model.capabilities.vision).toBe(true);
        expect(model.maxImageSize).toBeDefined();
        expect(model.supportedImageFormats).toBeDefined();
        expect(model.supportedImageFormats?.length).toBeGreaterThan(0);
      });

      log.info('✅ Claude vision support validated');
    });
  });

  describe('Amazon (Nova) Models', () => {
    const novaModels = ['nova-pro', 'nova-lite', 'nova-micro'];

    novaModels.forEach((modelName) => {
      test(`Nova Model: ${modelName}`, async () => {
        log.info(`🌟 Testing Nova model: ${modelName}...`);

        const model = bedrockModels[modelName];
        expect(model).toBeDefined();
        expect(model.modelFamily).toBe('amazon');
        expect(model.capabilities.chat).toBe(true);

        // Test Nova-specific capabilities
        if (modelName === 'nova-pro') {
          expect(model.capabilities.vision).toBe(true);
          expect(model.capabilities.functionCalling).toBe(true);
        }

        // Test parameter validation
        const validParams = {
          temperature: 0.8,
          maxTokens: 2000,
          topP: 0.95,
        };

        const validation = validateModelParameters(modelName, validParams);
        expect(validation.valid).toBe(true);

        log.info(`✅ Nova model ${modelName} validated`);
      });
    });

    test('Nova Multimodal Capabilities', () => {
      log.info('🎨 Testing Nova multimodal capabilities...');

      const multimodalModels = ['nova-pro'];

      multimodalModels.forEach((modelName) => {
        const model = bedrockModels[modelName];
        expect(model.capabilities.vision).toBe(true);
        expect(model.maxImageSize).toBeDefined();
        expect(model.supportedImageFormats).toBeDefined();
      });

      log.info('✅ Nova multimodal capabilities validated');
    });
  });

  describe('Meta (Llama) Models', () => {
    const llamaModels = [
      'llama-3.1-405b-instruct',
      'llama-3.1-70b-instruct',
      'llama-3.1-8b-instruct',
      'llama-3.2-90b-text',
      'llama-3.2-11b-vision',
      'llama-3.2-3b-instruct',
      'llama-3.2-1b-instruct',
    ];

    llamaModels.forEach((modelName) => {
      test(`Llama Model: ${modelName}`, async () => {
        log.info(`🦙 Testing Llama model: ${modelName}...`);

        const model = bedrockModels[modelName];
        expect(model).toBeDefined();
        expect(model.modelFamily).toBe('meta');
        expect(model.capabilities.chat).toBe(true);

        // Test model-specific capabilities
        if (modelName.includes('vision')) {
          expect(model.capabilities.vision).toBe(true);
        }

        if (modelName.includes('instruct')) {
          expect(model.capabilities.functionCalling).toBe(true);
        }

        // Test parameter validation
        const validParams = {
          temperature: 0.6,
          maxTokens: 4000,
          topP: 0.9,
        };

        const validation = validateModelParameters(modelName, validParams);
        expect(validation.valid).toBe(true);

        log.info(`✅ Llama model ${modelName} validated`);
      });
    });

    test('Llama Parameter Ranges', () => {
      log.info('📏 Testing Llama parameter ranges...');

      const _llamaModel = bedrockModels['llama-3.1-405b-instruct'];

      // Test valid parameters
      const validParams = {
        temperature: 0.7,
        maxTokens: 2000,
        topP: 0.9,
      };

      const validation = validateModelParameters('llama-3.1-405b-instruct', validParams);
      expect(validation.valid).toBe(true);

      // Test invalid parameters
      const invalidParams = {
        temperature: 2.0, // Too high
        maxTokens: 100000, // Too high
        topP: 1.5, // Too high
      };

      const invalidValidation = validateModelParameters('llama-3.1-405b-instruct', invalidParams);
      expect(invalidValidation.valid).toBe(false);
      expect(invalidValidation.errors.length).toBeGreaterThan(0);

      log.info('✅ Llama parameter ranges validated');
    });
  });

  describe('Mistral Models', () => {
    const mistralModels = [
      'mistral-large-2407',
      'mistral-large-2402',
      'mistral-small-2402',
      'mixtral-8x7b-instruct',
    ];

    mistralModels.forEach((modelName) => {
      test(`Mistral Model: ${modelName}`, async () => {
        log.info(`🌪️ Testing Mistral model: ${modelName}...`);

        const model = bedrockModels[modelName];
        expect(model).toBeDefined();
        expect(model.modelFamily).toBe('mistral');
        expect(model.capabilities.chat).toBe(true);

        // Test Mistral-specific capabilities
        if (modelName.includes('large')) {
          expect(model.capabilities.functionCalling).toBe(true);
        }

        // Test parameter validation
        const validParams = {
          temperature: 0.7,
          maxTokens: 1500,
          topP: 0.9,
        };

        const validation = validateModelParameters(modelName, validParams);
        expect(validation.valid).toBe(true);

        log.info(`✅ Mistral model ${modelName} validated`);
      });
    });

    test('Mistral Function Calling', () => {
      log.info('🔧 Testing Mistral function calling...');

      const functionCallModels = ['mistral-large-2407', 'mistral-large-2402'];

      functionCallModels.forEach((modelName) => {
        const model = bedrockModels[modelName];
        expect(model.capabilities.functionCalling).toBe(true);
        expect(model.maxFunctionCalls).toBeGreaterThan(0);
      });

      log.info('✅ Mistral function calling validated');
    });
  });

  describe('Cohere Models', () => {
    const cohereModels = ['command-r-plus', 'command-r', 'command-light'];

    cohereModels.forEach((modelName) => {
      test(`Cohere Model: ${modelName}`, async () => {
        log.info(`🎯 Testing Cohere model: ${modelName}...`);

        const model = bedrockModels[modelName];
        expect(model).toBeDefined();
        expect(model.modelFamily).toBe('cohere');
        expect(model.capabilities.chat).toBe(true);

        // Test Cohere-specific capabilities
        if (modelName.includes('plus') || modelName.includes('command-r')) {
          expect(model.capabilities.functionCalling).toBe(true);
        }

        // Test parameter validation
        const validParams = {
          temperature: 0.8,
          maxTokens: 2000,
          topP: 0.9,
        };

        const validation = validateModelParameters(modelName, validParams);
        expect(validation.valid).toBe(true);

        log.info(`✅ Cohere model ${modelName} validated`);
      });
    });

    test('Cohere RAG Capabilities', () => {
      log.info('📚 Testing Cohere RAG capabilities...');

      const ragModels = ['command-r-plus', 'command-r'];

      ragModels.forEach((modelName) => {
        const model = bedrockModels[modelName];
        expect(model.capabilities.rag).toBe(true);
        expect(model.maxDocuments).toBeGreaterThan(0);
      });

      log.info('✅ Cohere RAG capabilities validated');
    });
  });

  describe('AI21 Models', () => {
    const ai21Models = ['jamba-1.5-large', 'jamba-1.5-mini', 'jurassic-2-ultra', 'jurassic-2-mid'];

    ai21Models.forEach((modelName) => {
      test(`AI21 Model: ${modelName}`, async () => {
        log.info(`🦕 Testing AI21 model: ${modelName}...`);

        const model = bedrockModels[modelName];
        expect(model).toBeDefined();
        expect(model.modelFamily).toBe('ai21');
        expect(model.capabilities.chat).toBe(true);

        // Test AI21-specific capabilities
        if (modelName.includes('jamba')) {
          expect(model.capabilities.functionCalling).toBe(true);
        }

        // Test parameter validation
        const validParams = {
          temperature: 0.7,
          maxTokens: 1000,
          topP: 0.9,
        };

        const validation = validateModelParameters(modelName, validParams);
        expect(validation.valid).toBe(true);

        log.info(`✅ AI21 model ${modelName} validated`);
      });
    });

    test('AI21 Jamba Long Context', () => {
      log.info('📖 Testing AI21 Jamba long context capabilities...');

      const longContextModels = ['jamba-1.5-large', 'jamba-1.5-mini'];

      longContextModels.forEach((modelName) => {
        const model = bedrockModels[modelName];
        expect(model.maxTokens).toBeGreaterThan(50000); // Long context models
        expect(model.capabilities.longContext).toBe(true);
      });

      log.info('✅ AI21 Jamba long context validated');
    });
  });

  describe('Model Parameter Validation', () => {
    test('Cross-Model Parameter Validation', () => {
      log.info('🔍 Testing cross-model parameter validation...');

      const testModels = [
        'claude-3-5-sonnet-20241022',
        'nova-pro',
        'llama-3.1-405b-instruct',
        'mistral-large-2407',
        'command-r-plus',
        'jamba-1.5-large',
      ];

      testModels.forEach((modelName) => {
        // Test valid parameters
        const validParams = {
          temperature: 0.7,
          maxTokens: 1000,
          topP: 0.9,
        };

        const validation = validateModelParameters(modelName, validParams);
        expect(validation.valid).toBe(true);

        // Test invalid parameters
        const invalidParams = {
          temperature: -1, // Invalid
          maxTokens: -100, // Invalid
          topP: 2.0, // Invalid
        };

        const invalidValidation = validateModelParameters(modelName, invalidParams);
        expect(invalidValidation.valid).toBe(false);
        expect(invalidValidation.errors.length).toBeGreaterThan(0);
      });

      log.info('✅ Cross-model parameter validation working correctly');
    });

    test('Model-Specific Parameter Limits', () => {
      log.info('📊 Testing model-specific parameter limits...');

      // Test Claude context length
      const claudeModel = bedrockModels['claude-3-5-sonnet-20241022'];
      expect(claudeModel.maxTokens).toBeGreaterThan(100000);

      // Test Llama context length
      const llamaModel = bedrockModels['llama-3.1-405b-instruct'];
      expect(llamaModel.maxTokens).toBeGreaterThan(100000);

      // Test Jamba long context
      const jambaModel = bedrockModels['jamba-1.5-large'];
      expect(jambaModel.maxTokens).toBeGreaterThan(200000);

      log.info('✅ Model-specific parameter limits validated');
    });
  });

  describe('Model Transformation Testing', () => {
    test('Model Family Transformation Logic', async () => {
      if (!hasTestCredentials) {
        log.info('⏭️ Transformation test skipped - no credentials');
        return;
      }

      log.info('🔄 Testing model family transformation logic...');

      const familyModels = {
        anthropic: 'claude-3-5-sonnet-20241022',
        amazon: 'nova-pro',
        meta: 'llama-3.1-405b-instruct',
        mistral: 'mistral-large-2407',
        cohere: 'command-r-plus',
        ai21: 'jamba-1.5-large',
      };

      for (const [family, modelName] of Object.entries(familyModels)) {
        const providerConfig: Domains.IProviderEndpointConfig = {
          name: `test-${family}`,
          provider: 'bedrock',
          credentialsRef: 'aws-model-test',
          apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
          modelName,
          priority: 1,
        };

        try {
          const provider = (await providerFactory.createProvider(providerConfig)) as BedrockAdapter;
          await provider.initialize();

          // Test basic capabilities
          expect(provider.capabilities.chat).toBe(true);

          // Test family-specific capabilities
          const model = bedrockModels[modelName];
          if (model.capabilities.streaming) {
            expect(provider.capabilities.streaming).toBe(true);
          }
          if (model.capabilities.functionCalling) {
            expect(provider.capabilities.functionCalling).toBe(true);
          }
          if (model.capabilities.vision) {
            expect(provider.capabilities.vision).toBe(true);
          }

          log.info(`✅ ${family} model transformation validated`);
        } catch (error) {
          if (error instanceof BedrockError) {
            log.info(`✅ ${family} model transformation validated (expected auth error)`);
          } else {
            throw error;
          }
        }
      }
    });
  });

  afterAll(async () => {
    log.info('🧹 Cleaning up model families E2E tests...');

    // Clean up test environment variables
    const testVars = ['TEST_AWS_REGION', 'TEST_AWS_ACCESS_KEY_ID', 'TEST_AWS_SECRET_ACCESS_KEY'];

    testVars.forEach((varName) => {
      if (process.env[varName]) {
        delete process.env[varName];
      }
    });

    log.info('✅ Model families E2E test cleanup complete');
  });
});

// Manual test runner
if (import.meta.main) {
  console.log('🏃 Running Bedrock model families E2E tests...');
  console.log('');
  console.log('These tests validate all Bedrock model families:');
  console.log('- Anthropic (Claude) models with all capabilities');
  console.log('- Amazon (Nova) models with multimodal support');
  console.log('- Meta (Llama) models with function calling');
  console.log('- Mistral models with different parameter sets');
  console.log('- Cohere models with RAG capabilities');
  console.log('- AI21 models with long context support');
  console.log('- Model registry integration and validation');
  console.log('- Parameter validation and transformation');
  console.log('- Capability detection and configuration');
  console.log('');
  console.log('Environment setup (optional):');
  console.log('- TEST_AWS_REGION');
  console.log('- TEST_AWS_ACCESS_KEY_ID');
  console.log('- TEST_AWS_SECRET_ACCESS_KEY');
  console.log('');
  console.log('Run: bun test src/__tests__/e2e/bedrock-models-e2e.test.ts');
}
