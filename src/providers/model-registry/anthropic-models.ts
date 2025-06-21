/**
 * Anthropic Model Defaults
 *
 * Handles requirements for Anthropic Claude models
 */

import type { ProviderModelRegistry } from './types.js';

export const anthropicModelDefaults: ProviderModelRegistry = {
  // Provider-wide defaults for Anthropic
  providerDefaults: {
    // Anthropic uses different parameter names and formats
    parameterMappings: {
      max_tokens: 'max_tokens', // Same
      temperature: 'temperature', // Same
      top_p: 'top_p', // Same
      stop: 'stop_sequences', // Different
      stream: 'stream', // Same
    },
    unsupportedParams: [
      'frequency_penalty',
      'presence_penalty',
      'logit_bias',
      'user',
      'seed',
      'response_format',
      'tools', // Different format
      'functions', // Different format
    ],
  },

  patterns: {
    // Claude 3 family
    'claude-3*': {
      defaults: {
        parameterValidation: {
          max_tokens: { min: 1, max: 4096, clamp: true },
          temperature: { min: 0, max: 1, clamp: true }, // Claude prefers 0-1 range
          top_p: { min: 0, max: 1, clamp: true },
        },
        healthCheckParams: {
          max_tokens: 1,
          temperature: 0.1,
        },
      },
      description: 'Claude 3 models with Anthropic-specific parameter ranges',
      documentation: 'https://docs.anthropic.com/claude/reference/messages_post',
      confidence: 'high',
    },

    // Claude 2 family
    'claude-2*': {
      defaults: {
        parameterValidation: {
          max_tokens: { min: 1, max: 4096, clamp: true },
          temperature: { min: 0, max: 1, clamp: true },
        },
        healthCheckParams: {
          max_tokens: 1,
          temperature: 0.1,
        },
      },
      description: 'Claude 2 models with Anthropic constraints',
      confidence: 'high',
    },

    // Claude Instant family
    'claude-instant*': {
      defaults: {
        parameterValidation: {
          max_tokens: { min: 1, max: 4096, clamp: true },
          temperature: { min: 0, max: 1, clamp: true },
        },
        providerParams: {
          // Claude Instant might have different optimal defaults
          temperature: 0.5,
        },
        healthCheckParams: {
          max_tokens: 1,
          temperature: 0.1,
        },
      },
      description: 'Claude Instant models optimized for speed',
      confidence: 'high',
    },
  },

  exactMatches: {
    // Claude 3.5 Sonnet specific
    'claude-3-5-sonnet': {
      defaults: {
        parameterValidation: {
          max_tokens: { min: 1, max: 4096, clamp: true },
          temperature: { min: 0, max: 1, clamp: true },
        },
        providerParams: {
          // Sonnet works well with slightly higher temperature by default
          temperature: 0.7,
        },
        healthCheckParams: {
          max_tokens: 1,
          temperature: 0.1,
        },
      },
      description: 'Claude 3.5 Sonnet with optimized defaults',
      confidence: 'high',
    },

    // Claude 3 Opus specific
    'claude-3-opus': {
      defaults: {
        parameterValidation: {
          max_tokens: { min: 1, max: 4096, clamp: true },
          temperature: { min: 0, max: 1, clamp: true },
        },
        providerParams: {
          // Opus can handle more creative tasks, slightly higher default temp
          temperature: 0.8,
        },
        healthCheckParams: {
          max_tokens: 1,
          temperature: 0.1,
        },
      },
      description: 'Claude 3 Opus optimized for creative tasks',
      confidence: 'high',
    },

    // Claude 3 Haiku specific
    'claude-3-haiku': {
      defaults: {
        parameterValidation: {
          max_tokens: { min: 1, max: 4096, clamp: true },
          temperature: { min: 0, max: 1, clamp: true },
        },
        providerParams: {
          // Haiku optimized for speed and efficiency
          temperature: 0.3,
        },
        healthCheckParams: {
          max_tokens: 1,
          temperature: 0.1,
        },
      },
      description: 'Claude 3 Haiku optimized for speed',
      confidence: 'high',
    },
  },
};
