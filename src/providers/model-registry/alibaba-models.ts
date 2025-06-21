/**
 * Alibaba/Dashscope Model Defaults
 *
 * Handles the specific requirements for Alibaba Cloud models
 */

import type { ProviderModelRegistry } from './types.js';

export const alibabaModelDefaults: ProviderModelRegistry = {
  // Provider-wide defaults for all Alibaba models
  providerDefaults: {
    // Most Alibaba models have these common requirements
    removeForNonStreaming: ['enable_thinking'],
    unsupportedParams: ['logit_bias', 'user', 'seed'],
  },

  // Pattern-based matching for model families
  patterns: {
    // All Qwen models (qwen*, qwen2*, qwen3*, etc.)
    'qwen*': {
      defaults: {
        providerParams: {
          enable_thinking: false,
          incremental_output: false,
        },
        streamingParams: {
          enable_thinking: true,
          incremental_output: true,
        },
        healthCheckParams: {
          enable_thinking: false,
          max_tokens: 1,
          temperature: 0.1,
        },
        parameterValidation: {
          temperature: { min: 0.1, max: 2.0, clamp: true },
          top_p: { max: 0.99, clamp: true },
          max_tokens: { min: 1, max: 8192 },
        },
        removeForNonStreaming: ['enable_thinking'],
        addForStreaming: {
          incremental_output: true,
        },
      },
      description:
        'Qwen models require enable_thinking=false for non-streaming calls and have specific parameter ranges',
      documentation: 'https://help.aliyun.com/zh/dashscope/developer-reference/api-details',
      confidence: 'high',
    },

    // Baichuan models
    'baichuan*': {
      defaults: {
        providerParams: {
          enable_thinking: false,
        },
        streamingParams: {
          enable_thinking: true,
        },
        healthCheckParams: {
          enable_thinking: false,
          max_tokens: 1,
        },
        parameterValidation: {
          temperature: { min: 0.1, max: 2.0, clamp: true },
          top_p: { min: 0.1, max: 0.99, clamp: true },
        },
      },
      description: 'Baichuan models have similar requirements to Qwen',
      confidence: 'medium',
    },

    // ChatGLM models
    'chatglm*': {
      defaults: {
        providerParams: {
          enable_thinking: false,
        },
        healthCheckParams: {
          enable_thinking: false,
          max_tokens: 1,
        },
        parameterValidation: {
          temperature: { min: 0.1, max: 1.0, clamp: true },
          top_p: { max: 0.99, clamp: true },
        },
      },
      description: 'ChatGLM models with Alibaba-specific constraints',
      confidence: 'medium',
    },
  },

  // Exact model name overrides
  exactMatches: {
    // Specific Qwen model with different requirements
    'qwen2.5-72b-instruct': {
      defaults: {
        providerParams: {
          enable_thinking: false,
          incremental_output: false,
          // This specific model might have different optimal settings
          temperature: 0.3,
        },
        streamingParams: {
          enable_thinking: true,
          incremental_output: true,
          temperature: 0.7, // Different default for streaming
        },
        healthCheckParams: {
          enable_thinking: false,
          max_tokens: 1,
          temperature: 0.1,
        },
      },
      description: 'Qwen 2.5 72B with optimized temperature defaults',
      confidence: 'high',
    },

    // Another specific model
    'qwen-turbo': {
      defaults: {
        providerParams: {
          enable_thinking: false,
          response_mode: 'blocking', // Specific to this model
        },
        streamingParams: {
          enable_thinking: true,
          response_mode: 'streaming',
        },
        healthCheckParams: {
          enable_thinking: false,
          max_tokens: 1,
          response_mode: 'blocking',
        },
      },
      description: 'Qwen Turbo with response_mode parameter',
      confidence: 'high',
    },
  },
};
