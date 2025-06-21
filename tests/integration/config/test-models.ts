#!/usr/bin/env bun

/**
 * Test Model Configurations
 *
 * Comprehensive model definitions for integration testing across all providers.
 * These configurations test real models with actual API endpoints.
 */

// import type { Domains } from '../../../src/types/index.js';

export interface ITestModelConfig {
  name: string;
  provider: string;
  modelName: string;
  credentialsRef: string;
  apiBase: string;
  capabilities: {
    chat: boolean;
    streaming: boolean;
    functionCalling: boolean;
    vision: boolean;
  };
  testConfig: {
    maxTokens: number;
    timeout: number;
    expectedLatency: number; // Max expected latency in ms
  };
}

/**
 * Bedrock Test Models (50+ models across 6 families)
 */
export const BEDROCK_TEST_MODELS: ITestModelConfig[] = [
  // Anthropic Claude Models
  {
    name: 'claude-3-5-sonnet-20241022',
    provider: 'bedrock',
    modelName: 'claude-3-5-sonnet-20241022',
    credentialsRef: 'test-aws-keys',
    apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    capabilities: {
      chat: true,
      streaming: true,
      functionCalling: true,
      vision: true,
    },
    testConfig: {
      maxTokens: 1000,
      timeout: 30000,
      expectedLatency: 5000,
    },
  },
  {
    name: 'claude-3-haiku-20240307',
    provider: 'bedrock',
    modelName: 'claude-3-haiku-20240307',
    credentialsRef: 'test-aws-keys',
    apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    capabilities: {
      chat: true,
      streaming: true,
      functionCalling: true,
      vision: true,
    },
    testConfig: {
      maxTokens: 1000,
      timeout: 15000,
      expectedLatency: 2000,
    },
  },

  // Amazon Nova Models
  {
    name: 'nova-pro',
    provider: 'bedrock',
    modelName: 'nova-pro',
    credentialsRef: 'test-aws-keys',
    apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    capabilities: {
      chat: true,
      streaming: true,
      functionCalling: true,
      vision: true,
    },
    testConfig: {
      maxTokens: 1000,
      timeout: 25000,
      expectedLatency: 4000,
    },
  },
  {
    name: 'nova-lite',
    provider: 'bedrock',
    modelName: 'nova-lite',
    credentialsRef: 'test-aws-keys',
    apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    capabilities: {
      chat: true,
      streaming: true,
      functionCalling: false,
      vision: false,
    },
    testConfig: {
      maxTokens: 1000,
      timeout: 15000,
      expectedLatency: 2000,
    },
  },

  // Meta Llama Models
  {
    name: 'llama-3.1-405b-instruct',
    provider: 'bedrock',
    modelName: 'llama-3.1-405b-instruct',
    credentialsRef: 'test-aws-keys',
    apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    capabilities: {
      chat: true,
      streaming: true,
      functionCalling: true,
      vision: false,
    },
    testConfig: {
      maxTokens: 1000,
      timeout: 45000,
      expectedLatency: 8000,
    },
  },
  {
    name: 'llama-3.1-70b-instruct',
    provider: 'bedrock',
    modelName: 'llama-3.1-70b-instruct',
    credentialsRef: 'test-aws-keys',
    apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    capabilities: {
      chat: true,
      streaming: true,
      functionCalling: true,
      vision: false,
    },
    testConfig: {
      maxTokens: 1000,
      timeout: 35000,
      expectedLatency: 6000,
    },
  },

  // Mistral Models
  {
    name: 'mistral-large-2407',
    provider: 'bedrock',
    modelName: 'mistral-large-2407',
    credentialsRef: 'test-aws-keys',
    apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    capabilities: {
      chat: true,
      streaming: true,
      functionCalling: true,
      vision: false,
    },
    testConfig: {
      maxTokens: 1000,
      timeout: 30000,
      expectedLatency: 5000,
    },
  },

  // Cohere Models
  {
    name: 'command-r-plus-v1:0',
    provider: 'bedrock',
    modelName: 'command-r-plus-v1:0',
    credentialsRef: 'test-aws-keys',
    apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    capabilities: {
      chat: true,
      streaming: true,
      functionCalling: true,
      vision: false,
    },
    testConfig: {
      maxTokens: 1000,
      timeout: 30000,
      expectedLatency: 5000,
    },
  },

  // AI21 Models
  {
    name: 'jamba-1.5-large',
    provider: 'bedrock',
    modelName: 'jamba-1.5-large',
    credentialsRef: 'test-aws-keys',
    apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    capabilities: {
      chat: true,
      streaming: true,
      functionCalling: false,
      vision: false,
    },
    testConfig: {
      maxTokens: 1000,
      timeout: 35000,
      expectedLatency: 6000,
    },
  },
];

/**
 * OpenAI Test Models
 */
export const OPENAI_TEST_MODELS: ITestModelConfig[] = [
  {
    name: 'gpt-4o',
    provider: 'openai',
    modelName: 'gpt-4o',
    credentialsRef: 'test-openai',
    apiBase: 'https://api.openai.com',
    capabilities: {
      chat: true,
      streaming: true,
      functionCalling: true,
      vision: true,
    },
    testConfig: {
      maxTokens: 1000,
      timeout: 30000,
      expectedLatency: 5000,
    },
  },
  {
    name: 'gpt-4o-mini',
    provider: 'openai',
    modelName: 'gpt-4o-mini',
    credentialsRef: 'test-openai',
    apiBase: 'https://api.openai.com',
    capabilities: {
      chat: true,
      streaming: true,
      functionCalling: true,
      vision: true,
    },
    testConfig: {
      maxTokens: 1000,
      timeout: 20000,
      expectedLatency: 3000,
    },
  },
  {
    name: 'gpt-3.5-turbo',
    provider: 'openai',
    modelName: 'gpt-3.5-turbo',
    credentialsRef: 'test-openai',
    apiBase: 'https://api.openai.com',
    capabilities: {
      chat: true,
      streaming: true,
      functionCalling: true,
      vision: false,
    },
    testConfig: {
      maxTokens: 1000,
      timeout: 15000,
      expectedLatency: 2000,
    },
  },
];

/**
 * Anthropic Test Models
 */
export const ANTHROPIC_TEST_MODELS: ITestModelConfig[] = [
  {
    name: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    modelName: 'claude-3-5-sonnet-20241022',
    credentialsRef: 'test-anthropic',
    apiBase: 'https://api.anthropic.com',
    capabilities: {
      chat: true,
      streaming: true,
      functionCalling: true,
      vision: true,
    },
    testConfig: {
      maxTokens: 1000,
      timeout: 30000,
      expectedLatency: 5000,
    },
  },
  {
    name: 'claude-3-haiku-20240307',
    provider: 'anthropic',
    modelName: 'claude-3-haiku-20240307',
    credentialsRef: 'test-anthropic',
    apiBase: 'https://api.anthropic.com',
    capabilities: {
      chat: true,
      streaming: true,
      functionCalling: true,
      vision: true,
    },
    testConfig: {
      maxTokens: 1000,
      timeout: 15000,
      expectedLatency: 2000,
    },
  },
];

/**
 * Together AI Test Models
 */
export const TOGETHER_TEST_MODELS: ITestModelConfig[] = [
  {
    name: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
    provider: 'together',
    modelName: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
    credentialsRef: 'test-together',
    apiBase: 'https://api.together.xyz',
    capabilities: {
      chat: true,
      streaming: true,
      functionCalling: true,
      vision: false,
    },
    testConfig: {
      maxTokens: 1000,
      timeout: 45000,
      expectedLatency: 8000,
    },
  },
  {
    name: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    provider: 'together',
    modelName: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    credentialsRef: 'test-together',
    apiBase: 'https://api.together.xyz',
    capabilities: {
      chat: true,
      streaming: true,
      functionCalling: true,
      vision: false,
    },
    testConfig: {
      maxTokens: 1000,
      timeout: 35000,
      expectedLatency: 6000,
    },
  },
];

/**
 * RunPod Test Models (Custom endpoints)
 */
export const RUNPOD_TEST_MODELS: ITestModelConfig[] = [
  {
    name: 'custom-llama-70b',
    provider: 'runpod',
    modelName: 'custom-llama-70b',
    credentialsRef: 'test-runpod',
    apiBase: 'https://api.runpod.ai', // This would be replaced with actual endpoint
    capabilities: {
      chat: true,
      streaming: true,
      functionCalling: false,
      vision: false,
    },
    testConfig: {
      maxTokens: 1000,
      timeout: 40000,
      expectedLatency: 7000,
    },
  },
];

/**
 * All test models grouped by provider
 */
export const ALL_TEST_MODELS = {
  bedrock: BEDROCK_TEST_MODELS,
  openai: OPENAI_TEST_MODELS,
  anthropic: ANTHROPIC_TEST_MODELS,
  together: TOGETHER_TEST_MODELS,
  runpod: RUNPOD_TEST_MODELS,
};

/**
 * Get test models for a specific provider
 */
export function getTestModelsForProvider(provider: string): ITestModelConfig[] {
  return ALL_TEST_MODELS[provider as keyof typeof ALL_TEST_MODELS] || [];
}

/**
 * Get all test models
 */
export function getAllTestModels(): ITestModelConfig[] {
  return Object.values(ALL_TEST_MODELS).flat();
}

/**
 * Get models with specific capabilities
 */
export function getModelsWithCapability(
  capability: keyof ITestModelConfig['capabilities']
): ITestModelConfig[] {
  return getAllTestModels().filter((model) => model.capabilities[capability]);
}

/**
 * Get fast models for smoke testing
 */
export function getFastModels(): ITestModelConfig[] {
  return getAllTestModels().filter((model) => model.testConfig.expectedLatency < 3000);
}

/**
 * Model test priorities for CI (fast models first)
 */
export const CI_TEST_PRIORITY = {
  smoke: ['claude-3-haiku-20240307', 'gpt-4o-mini', 'nova-lite'],
  integration: [
    'claude-3-5-sonnet-20241022',
    'gpt-4o',
    'llama-3.1-70b-instruct',
    'mistral-large-2407',
  ],
  comprehensive: getAllTestModels().map((m) => m.name),
};

export default {
  ALL_TEST_MODELS,
  getTestModelsForProvider,
  getAllTestModels,
  getModelsWithCapability,
  getFastModels,
  CI_TEST_PRIORITY,
};
