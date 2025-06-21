#!/usr/bin/env bun

/**
 * Integration Test Helpers
 *
 * Utilities for running real API integration tests across all providers.
 * These helpers manage credentials, make actual API calls, and validate responses.
 */

import log from '../../../src/utils/logging.js';
import { CredentialManager } from '../../../src/credentials/managers/credential-manager.js';
import { ProviderFactory } from '../../../src/providers/provider-factory.js';
import type { Domains } from '../../../src/types/index.js';
// Types imported for internal use only

export interface ITestCredentials {
  openai?: string;
  anthropic?: string;
  together?: string;
  runpod?: string;
  aws?: {
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
  };
}

export interface ITestResult {
  success: boolean;
  duration: number;
  error?: Error;
  response?: unknown;
  metadata?: Record<string, unknown>;
}

export class IntegrationTestHelper {
  private credentialManager: CredentialManager;
  private providerFactory: ProviderFactory;
  private testCredentials: ITestCredentials;

  constructor() {
    this.credentialManager = new CredentialManager();
    this.providerFactory = new ProviderFactory(this.credentialManager);
    this.testCredentials = this.loadTestCredentials();
  }

  /**
   * Load test credentials from environment variables
   */
  private loadTestCredentials(): ITestCredentials {
    return {
      openai: process.env.TEST_OPENAI_API_KEY,
      anthropic: process.env.TEST_ANTHROPIC_API_KEY,
      together: process.env.TEST_TOGETHER_API_KEY,
      runpod: process.env.TEST_RUNPOD_API_KEY,
      aws: {
        region: process.env.TEST_AWS_REGION || 'us-east-1',
        accessKeyId: process.env.TEST_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.TEST_AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.TEST_AWS_SESSION_TOKEN,
      },
    };
  }

  /**
   * Initialize the test environment with credential stores
   */
  async initialize(): Promise<void> {
    const credentialStores: Record<
      string,
      { type: string; source: string; config: Record<string, string | boolean> }
    > = {};

    log.debug('🔑 Initializing test environment with available credentials...');

    // Log available test environment variables for debugging
    const availableTestEnvVars = [
      'TEST_OPENAI_API_KEY',
      'TEST_ANTHROPIC_API_KEY',
      'TEST_TOGETHER_API_KEY',
      'TEST_RUNPOD_API_KEY',
      'TEST_AWS_REGION',
      'TEST_AWS_ACCESS_KEY_ID',
      'TEST_AWS_SECRET_ACCESS_KEY',
      'TEST_AWS_SESSION_TOKEN',
    ].filter((envVar) => process.env[envVar]);

    log.debug(`Available test environment variables: ${availableTestEnvVars.join(', ') || 'none'}`);

    // OpenAI credential store
    if (this.testCredentials.openai) {
      credentialStores['test-openai'] = {
        type: 'simple',
        source: 'env',
        config: {
          apiKeyVar: 'TEST_OPENAI_API_KEY',
        },
      };
      log.debug('✅ Added OpenAI credential store');
    } else {
      log.debug('⏭️ Skipping OpenAI credential store - no TEST_OPENAI_API_KEY');
    }

    // Anthropic credential store
    if (this.testCredentials.anthropic) {
      credentialStores['test-anthropic'] = {
        type: 'simple',
        source: 'env',
        config: {
          apiKeyVar: 'TEST_ANTHROPIC_API_KEY',
        },
      };
      log.debug('✅ Added Anthropic credential store');
    } else {
      log.debug('⏭️ Skipping Anthropic credential store - no TEST_ANTHROPIC_API_KEY');
    }

    // Together AI credential store
    if (this.testCredentials.together) {
      credentialStores['test-together'] = {
        type: 'simple',
        source: 'env',
        config: {
          apiKeyVar: 'TEST_TOGETHER_API_KEY',
        },
      };
      log.debug('✅ Added Together AI credential store');
    } else {
      log.debug('⏭️ Skipping Together AI credential store - no TEST_TOGETHER_API_KEY');
    }

    // RunPod credential store
    if (this.testCredentials.runpod) {
      credentialStores['test-runpod'] = {
        type: 'simple',
        source: 'env',
        config: {
          apiKeyVar: 'TEST_RUNPOD_API_KEY',
        },
      };
      log.debug('✅ Added RunPod credential store');
    } else {
      log.debug('⏭️ Skipping RunPod credential store - no TEST_RUNPOD_API_KEY');
    }

    // AWS credential stores (multiple authentication methods)
    if (this.testCredentials.aws?.accessKeyId && this.testCredentials.aws?.secretAccessKey) {
      credentialStores['test-aws-keys'] = {
        type: 'aws',
        source: 'env',
        config: {
          regionVar: 'TEST_AWS_REGION',
          accessKeyIdVar: 'TEST_AWS_ACCESS_KEY_ID',
          secretAccessKeyVar: 'TEST_AWS_SECRET_ACCESS_KEY',
          ...(process.env.TEST_AWS_SESSION_TOKEN && { sessionTokenVar: 'TEST_AWS_SESSION_TOKEN' }),
        },
      };
      log.debug('✅ Added AWS access key credential store');
    } else {
      log.debug('⏭️ Skipping AWS access key credential store - missing credentials');
    }

    // Additional AWS authentication methods (only if AWS region env var is actually set)
    if (process.env.TEST_AWS_REGION) {
      credentialStores['test-aws-instance'] = {
        type: 'aws',
        source: 'env',
        config: {
          regionVar: 'TEST_AWS_REGION',
          useInstanceProfile: true,
        },
      };
      log.debug('✅ Added AWS instance profile credential store');

      credentialStores['test-aws-web-identity'] = {
        type: 'aws',
        source: 'env',
        config: {
          regionVar: 'TEST_AWS_REGION',
          useWebIdentity: true,
        },
      };
      log.debug('✅ Added AWS web identity credential store');
    } else {
      log.debug('⏭️ Skipping AWS instance/web identity stores - no TEST_AWS_REGION');
    }

    // Initialize credential manager - always attempt initialization, even with empty stores
    log.info(
      `🔧 Initializing credential manager with ${Object.keys(credentialStores).length} stores...`
    );
    try {
      await this.credentialManager.initialize(credentialStores);
      log.info('✅ Credential manager initialized successfully');

      // Log the final status
      const storeEntries = this.credentialManager.getCredentialStoreEntries();
      if (storeEntries.length > 0) {
        for (const entry of storeEntries) {
          log.debug(`📋 Store ${entry.id}: ${entry.status}`);
        }
      } else {
        log.warn(
          '⚠️ No credential stores registered - tests requiring credentials will be skipped'
        );
        log.info('💡 To run integration tests, set test environment variables:');
        log.info('   - TEST_OPENAI_API_KEY for OpenAI tests');
        log.info('   - TEST_ANTHROPIC_API_KEY for Anthropic tests');
        log.info(
          '   - TEST_AWS_REGION, TEST_AWS_ACCESS_KEY_ID, TEST_AWS_SECRET_ACCESS_KEY for AWS/Bedrock tests'
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error(`❌ Failed to initialize credential manager: ${message}`);
      log.warn('Tests may fail due to credential initialization issues');
      throw error;
    }
  }

  /**
   * Check if specific provider credentials are available
   */
  hasCredentialsFor(provider: string): boolean {
    switch (provider) {
      case 'openai':
        return !!this.testCredentials.openai;
      case 'anthropic':
        return !!this.testCredentials.anthropic;
      case 'together':
        return !!this.testCredentials.together;
      case 'runpod':
        return !!this.testCredentials.runpod;
      case 'bedrock':
        return !!(
          this.testCredentials.aws?.accessKeyId && this.testCredentials.aws?.secretAccessKey
        );
      default:
        return false;
    }
  }

  /**
   * Create a test provider instance
   */
  async createTestProvider(
    provider: string,
    modelName: string,
    credentialsRef?: string
  ): Promise<unknown> {
    const config: Domains.IProviderEndpointConfig = {
      name: `test-${provider}-${modelName}`,
      provider: provider as Domains.IProviderEndpointConfig['provider'],
      credentialsRef: credentialsRef || `test-${provider}`,
      modelName,
      priority: 1,
      weight: 100,
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      apiBase: this.getApiBaseForProvider(provider),
    };

    return await this.providerFactory.createProvider(config);
  }

  /**
   * Get the appropriate API base URL for a provider
   */
  private getApiBaseForProvider(provider: string): string {
    switch (provider) {
      case 'openai':
        return 'https://api.openai.com';
      case 'anthropic':
        return 'https://api.anthropic.com';
      case 'together':
        return 'https://api.together.xyz';
      case 'runpod':
        return 'https://api.runpod.ai';
      case 'bedrock':
        return `https://bedrock-runtime.${this.testCredentials.aws?.region}.amazonaws.com`;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Test a chat completion with a provider
   */
  async testChatCompletion(
    provider: unknown,
    prompt: string = 'Hello, how are you?',
    maxTokens: number = 100
  ): Promise<ITestResult> {
    const startTime = Date.now();

    try {
      const request: Domains.IChatCompletionRequest = {
        messages: [{ role: 'user', content: prompt }],
        maxTokens,
        temperature: 0.7,
      };

      const response = await provider.chatCompletion(request);
      const duration = Date.now() - startTime;

      return {
        success: true,
        duration,
        response,
        metadata: {
          messageCount: request.messages.length,
          responseLength: response.choices?.[0]?.message?.content?.length || 0,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        duration,
        error: error as Error,
      };
    }
  }

  /**
   * Test streaming chat completion with a provider
   */
  async testStreamingChatCompletion(
    provider: unknown,
    prompt: string = 'Tell me a short story',
    maxTokens: number = 200
  ): Promise<ITestResult> {
    const startTime = Date.now();
    let chunks = 0;
    let totalContent = '';

    try {
      const request: Domains.IChatCompletionRequest = {
        messages: [{ role: 'user', content: prompt }],
        maxTokens,
        temperature: 0.8,
        stream: true,
      };

      const stream = provider.streamChatCompletion(request);

      for await (const chunk of stream) {
        chunks++;
        if (chunk.choices?.[0]?.delta?.content) {
          totalContent += chunk.choices[0].delta.content;
        }
      }

      const duration = Date.now() - startTime;

      return {
        success: true,
        duration,
        metadata: {
          chunkCount: chunks,
          totalContentLength: totalContent.length,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        duration,
        error: error as Error,
        metadata: {
          chunkCount: chunks,
        },
      };
    }
  }

  /**
   * Test function calling capabilities
   */
  async testFunctionCalling(
    provider: unknown,
    prompt: string = 'What is the weather like in London?'
  ): Promise<ITestResult> {
    const startTime = Date.now();

    try {
      const request: Domains.IChatCompletionRequest = {
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 200,
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get current weather information',
              parameters: {
                type: 'object',
                properties: {
                  location: { type: 'string', description: 'City name' },
                },
                required: ['location'],
              },
            },
          },
        ],
        toolChoice: 'auto',
      };

      const response = await provider.chatCompletion(request);
      const duration = Date.now() - startTime;

      const hasToolCall = response.choices?.[0]?.message?.toolCalls?.length > 0;

      return {
        success: true,
        duration,
        response,
        metadata: {
          hasToolCall,
          toolCallCount: response.choices?.[0]?.message?.toolCalls?.length || 0,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        duration,
        error: error as Error,
      };
    }
  }

  /**
   * Validate response format compliance
   */
  validateResponseFormat(
    response: unknown,
    expectedFormat: 'openai' | 'anthropic' = 'openai'
  ): boolean {
    if (!response) return false;

    switch (expectedFormat) {
      case 'openai':
        return !!(
          response.id &&
          response.object &&
          response.created &&
          response.model &&
          response.choices &&
          Array.isArray(response.choices)
        );
      case 'anthropic':
        return !!(response.id && response.type && response.content);
      default:
        return false;
    }
  }

  /**
   * Log test results in a structured format
   */
  logTestResult(testName: string, result: ITestResult, details?: Record<string, unknown>): void {
    const status = result.success ? '✅' : '❌';
    const duration = `${result.duration}ms`;

    if (result.success) {
      log.info(`${status} ${testName} (${duration})`, {
        metadata: result.metadata,
        ...details,
      });
    } else {
      log.error(`${status} ${testName} (${duration})`, {
        error: result.error?.message,
        errorType: result.error?.constructor.name,
        metadata: result.metadata,
        ...details,
      });
    }
  }

  /**
   * Skip test with informative message
   */
  skipTest(testName: string, reason: string): void {
    log.info(`⏭️ Skipping ${testName} - ${reason}`);
  }

  /**
   * Clean up test resources
   */
  async cleanup(): Promise<void> {
    try {
      // Clean up any provider connections or resources
      log.info('🧹 Cleaning up integration test resources...');
    } catch (error) {
      log.warn('⚠️ Cleanup had issues:', error);
    }
  }
}

/**
 * Helper function to create consistent test expectations
 */
export function expectSuccessfulResponse(result: ITestResult): void {
  if (!result.success) {
    throw result.error || new Error('Test failed without specific error');
  }

  // Validate basic response structure
  if (result.duration <= 0) {
    throw new Error('Duration must be greater than 0');
  }
  if (!result.response) {
    throw new Error('Response is required');
  }
}

/**
 * Helper function to create consistent error expectations
 */
export function expectErrorResponse(result: ITestResult, expectedErrorType?: string): void {
  if (result.success) {
    throw new Error('Expected test to fail but it succeeded');
  }
  if (!result.error) {
    throw new Error('Expected error to be defined');
  }

  if (expectedErrorType && result.error.constructor.name !== expectedErrorType) {
    throw new Error(
      `Expected error type ${expectedErrorType} but got ${result.error.constructor.name}`
    );
  }
}

/**
 * Performance assertion helper
 */
export function expectPerformance(result: ITestResult, maxDuration: number): void {
  if (result.duration >= maxDuration) {
    throw new Error(`Expected duration ${result.duration}ms to be less than ${maxDuration}ms`);
  }
}

/**
 * Create a test timeout for integration tests
 */
export const INTEGRATION_TEST_TIMEOUT = 60000; // 60 seconds

/**
 * Common test prompts for consistency
 */
export const TEST_PROMPTS = {
  simple: 'Hello, how are you?',
  creative: 'Tell me a short story about a robot learning to paint.',
  reasoning: 'Explain why the sky is blue in simple terms.',
  function: 'What is the weather like in London right now?',
  vision: 'Describe this image for me.',
  long: 'Write a detailed explanation of quantum computing, including its principles, applications, and future prospects.',
};

export default IntegrationTestHelper;
