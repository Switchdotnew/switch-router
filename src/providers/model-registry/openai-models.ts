/**
 * OpenAI Model Defaults
 *
 * Handles requirements for OpenAI and OpenAI-compatible models
 */

import type { ProviderModelRegistry } from './types.js';

export const openaiModelDefaults: ProviderModelRegistry = {
  // Provider-wide defaults for OpenAI
  providerDefaults: {
    // OpenAI has good parameter validation, minimal defaults needed
  },

  patterns: {
    // GPT-4 family
    'gpt-4*': {
      defaults: {
        parameterValidation: {
          max_tokens: { max: 4096, clamp: true },
          temperature: { min: 0, max: 2, clamp: true },
          top_p: { min: 0, max: 1, clamp: true },
        },
        streamingParams: {
          stream_options: { include_usage: true }, // GPT-4 supports usage in streaming
        },
      },
      description: 'GPT-4 models with token limits and streaming usage support',
      confidence: 'high',
    },

    // GPT-3.5 family
    'gpt-3.5*': {
      defaults: {
        parameterValidation: {
          max_tokens: { max: 4096, clamp: true },
          temperature: { min: 0, max: 2, clamp: true },
        },
        streamingParams: {
          stream_options: { include_usage: true },
        },
      },
      description: 'GPT-3.5 models with standard OpenAI parameters',
      confidence: 'high',
    },

    // Legacy text models (if still used)
    'text-*': {
      defaults: {
        unsupportedParams: ['messages', 'tools', 'tool_choice'], // These are chat-only
        parameterValidation: {
          max_tokens: { max: 4096, clamp: true },
        },
      },
      description: 'Legacy OpenAI text completion models',
      confidence: 'medium',
    },
  },

  exactMatches: {
    // GPT-4o specific optimizations
    'gpt-4o': {
      defaults: {
        parameterValidation: {
          max_tokens: { max: 4096, clamp: true },
        },
        providerParams: {
          // GPT-4o specific optimizations if any
        },
        streamingParams: {
          stream_options: { include_usage: true },
        },
      },
      description: 'GPT-4o with optimized settings',
      confidence: 'high',
    },

    // GPT-4o mini
    'gpt-4o-mini': {
      defaults: {
        parameterValidation: {
          max_tokens: { max: 16384, clamp: true }, // Higher limit for mini
        },
        streamingParams: {
          stream_options: { include_usage: true },
        },
      },
      description: 'GPT-4o Mini with higher token limit',
      confidence: 'high',
    },
  },
};
