/**
 * Model Registry - Central Parameter Management
 *
 * Provides intelligent defaults for known models while allowing full user override
 */

import type {
  ProviderModelRegistry,
  ModelParameterDefaults,
  ModelRegistryEntry,
  ModelRegistryMergeResult,
} from './types.js';
import { alibabaModelDefaults } from './alibaba-models.js';
import { openaiModelDefaults } from './openai-models.js';
import { anthropicModelDefaults } from './anthropic-models.js';
import { bedrockModels } from './bedrock-models.js';

/**
 * Central registry of all provider model defaults
 */
const modelRegistry: { [provider: string]: ProviderModelRegistry } = {
  alibaba: alibabaModelDefaults,
  dashscope: alibabaModelDefaults, // Alias for Alibaba
  openai: openaiModelDefaults,
  anthropic: anthropicModelDefaults,
  // Easy to extend with more providers...
};

/**
 * Pattern matching utility
 */
function matchesPattern(modelName: string, pattern: string): boolean {
  // Convert glob-style pattern to regex
  const regexPattern = pattern
    .replace(/\*/g, '.*') // * becomes .*
    .replace(/\?/g, '.') // ? becomes .
    .replace(/\[/g, '\\[') // Escape brackets
    .replace(/\]/g, '\\]');

  const regex = new RegExp(`^${regexPattern}$`, 'i'); // Case insensitive
  return regex.test(modelName);
}

/**
 * Find model defaults for a specific provider and model
 */
function findModelDefaults(provider: string, modelName: string): ModelRegistryEntry | null {
  const providerRegistry = modelRegistry[provider.toLowerCase()];
  if (!providerRegistry) {
    return null;
  }

  // 1. Check exact matches first (highest priority)
  if (providerRegistry.exactMatches?.[modelName]) {
    return providerRegistry.exactMatches[modelName];
  }

  // 2. Check pattern matches
  if (providerRegistry.patterns) {
    for (const [pattern, entry] of Object.entries(providerRegistry.patterns)) {
      if (matchesPattern(modelName, pattern)) {
        return entry;
      }
    }
  }

  // 3. No specific defaults found
  return null;
}

/**
 * Apply parameter validation and clamping
 */
function validateAndClampParameters(
  params: Record<string, unknown>,
  validation: ModelParameterDefaults['parameterValidation']
): { params: Record<string, unknown>; warnings: string[] } {
  if (!validation) {
    return { params, warnings: [] };
  }

  const validatedParams = { ...params };
  const warnings: string[] = [];

  for (const [paramName, rules] of Object.entries(validation)) {
    if (!(paramName in validatedParams)) {
      continue;
    }

    const value = validatedParams[paramName];

    // Type checking
    if (typeof value !== 'number' && (rules.min !== undefined || rules.max !== undefined)) {
      continue; // Skip non-numeric values for numeric validation
    }

    const numValue = value as number;

    // Min/max validation with optional clamping
    if (rules.min !== undefined && numValue < rules.min) {
      if (rules.clamp) {
        validatedParams[paramName] = rules.min;
        warnings.push(`Clamped ${paramName} from ${numValue} to ${rules.min} (minimum)`);
      } else {
        warnings.push(`Parameter ${paramName}=${numValue} is below minimum ${rules.min}`);
      }
    }

    if (rules.max !== undefined && numValue > rules.max) {
      if (rules.clamp) {
        validatedParams[paramName] = rules.max;
        warnings.push(`Clamped ${paramName} from ${numValue} to ${rules.max} (maximum)`);
      } else {
        warnings.push(`Parameter ${paramName}=${numValue} is above maximum ${rules.max}`);
      }
    }

    // Allowed values validation
    if (rules.allowedValues && !rules.allowedValues.includes(value as string | number)) {
      warnings.push(
        `Parameter ${paramName}=${value} is not in allowed values: ${rules.allowedValues.join(', ')}`
      );
    }
  }

  return { params: validatedParams, warnings };
}

/**
 * Remove unsupported parameters
 */
function removeUnsupportedParams(
  params: Record<string, unknown>,
  unsupported: string[]
): { params: Record<string, unknown>; removed: string[] } {
  const filteredParams = { ...params };
  const removed: string[] = [];

  for (const paramName of unsupported) {
    if (paramName in filteredParams) {
      delete filteredParams[paramName];
      removed.push(paramName);
    }
  }

  return { params: filteredParams, removed };
}

/**
 * Apply parameter name mappings (e.g., OpenAI -> Anthropic format)
 */
function applyParameterMappings(
  params: Record<string, unknown>,
  mappings: { [key: string]: string }
): { params: Record<string, unknown>; transformations: string[] } {
  const mappedParams = { ...params };
  const transformations: string[] = [];

  for (const [oldName, newName] of Object.entries(mappings)) {
    if (oldName in mappedParams && oldName !== newName) {
      mappedParams[newName] = mappedParams[oldName];
      delete mappedParams[oldName];
      transformations.push(`Mapped parameter '${oldName}' to '${newName}'`);
    }
  }

  return { params: mappedParams, transformations };
}

/**
 * Merge user configuration with model defaults
 */
export function mergeModelDefaults(
  provider: string,
  modelName: string,
  userConfig: {
    providerParams?: Record<string, unknown>;
    streamingParams?: Record<string, unknown>;
    healthCheckParams?: Record<string, unknown>;
    useModelDefaults?: boolean;
  }
): ModelRegistryMergeResult {
  const appliedDefaults: string[] = [];
  const warnings: string[] = [];
  const transformations: string[] = [];

  // If user explicitly disabled model defaults, return user config as-is
  if (userConfig.useModelDefaults === false) {
    return {
      providerParams: userConfig.providerParams || {},
      streamingParams: userConfig.streamingParams || {},
      healthCheckParams: userConfig.healthCheckParams || {},
      appliedDefaults: ['Model defaults disabled by user configuration'],
      warnings: [],
      transformations: [],
    };
  }

  // Find model defaults
  const modelDefaults = findModelDefaults(provider, modelName);
  const providerRegistry = modelRegistry[provider.toLowerCase()];

  if (!modelDefaults && !providerRegistry?.providerDefaults) {
    // No defaults found, return user config
    return {
      providerParams: userConfig.providerParams || {},
      streamingParams: userConfig.streamingParams || {},
      healthCheckParams: userConfig.healthCheckParams || {},
      appliedDefaults: [`No model defaults found for ${provider}:${modelName}`],
      warnings: [],
      transformations: [],
    };
  }

  // Merge defaults with user config (user takes priority)
  let providerParams = {
    ...(providerRegistry?.providerDefaults?.providerParams || {}),
    ...(modelDefaults?.defaults.providerParams || {}),
    ...(userConfig.providerParams || {}),
  };

  let streamingParams = {
    ...(providerRegistry?.providerDefaults?.streamingParams || {}),
    ...(modelDefaults?.defaults.streamingParams || {}),
    ...(userConfig.streamingParams || {}),
  };

  let healthCheckParams = {
    ...(providerRegistry?.providerDefaults?.healthCheckParams || {}),
    ...(modelDefaults?.defaults.healthCheckParams || {}),
    ...(userConfig.healthCheckParams || {}),
  };

  // Log what defaults were applied
  if (modelDefaults) {
    appliedDefaults.push(
      `Applied model defaults for ${modelName} (confidence: ${modelDefaults.confidence || 'unknown'})`
    );
    if (modelDefaults.description) {
      appliedDefaults.push(`Reason: ${modelDefaults.description}`);
    }
  }

  // Apply parameter validation and clamping
  const allDefaults = modelDefaults?.defaults || {};
  const validation = {
    ...providerRegistry?.providerDefaults?.parameterValidation,
    ...allDefaults.parameterValidation,
  };

  if (validation && Object.keys(validation).length > 0) {
    const providerResult = validateAndClampParameters(providerParams, validation);
    const streamingResult = validateAndClampParameters(streamingParams, validation);
    const healthResult = validateAndClampParameters(healthCheckParams, validation);

    providerParams = providerResult.params;
    streamingParams = streamingResult.params;
    healthCheckParams = healthResult.params;

    warnings.push(
      ...providerResult.warnings,
      ...streamingResult.warnings,
      ...healthResult.warnings
    );
  }

  // Remove unsupported parameters
  const unsupported = [
    ...(providerRegistry?.providerDefaults?.unsupportedParams || []),
    ...(allDefaults.unsupportedParams || []),
  ];

  if (unsupported.length > 0) {
    const providerResult = removeUnsupportedParams(providerParams, unsupported);
    const streamingResult = removeUnsupportedParams(streamingParams, unsupported);
    const healthResult = removeUnsupportedParams(healthCheckParams, unsupported);

    providerParams = providerResult.params;
    streamingParams = streamingResult.params;
    healthCheckParams = healthResult.params;

    const allRemoved = [
      ...providerResult.removed,
      ...streamingResult.removed,
      ...healthResult.removed,
    ];
    if (allRemoved.length > 0) {
      transformations.push(`Removed unsupported parameters: ${allRemoved.join(', ')}`);
    }
  }

  // Apply parameter name mappings
  const mappings = {
    ...providerRegistry?.providerDefaults?.parameterMappings,
    ...allDefaults.parameterMappings,
  };

  if (mappings && Object.keys(mappings).length > 0) {
    const providerResult = applyParameterMappings(providerParams, mappings);
    const streamingResult = applyParameterMappings(streamingParams, mappings);
    const healthResult = applyParameterMappings(healthCheckParams, mappings);

    providerParams = providerResult.params;
    streamingParams = streamingResult.params;
    healthCheckParams = healthResult.params;

    transformations.push(
      ...providerResult.transformations,
      ...streamingResult.transformations,
      ...healthResult.transformations
    );
  }

  return {
    providerParams,
    streamingParams,
    healthCheckParams,
    appliedDefaults,
    warnings,
    transformations,
  };
}

/**
 * Get list of all supported providers in the registry
 */
export function getSupportedProviders(): string[] {
  return Object.keys(modelRegistry);
}

/**
 * Get information about a specific provider's defaults
 */
export function getProviderInfo(provider: string): {
  hasDefaults: boolean;
  patternCount: number;
  exactMatchCount: number;
  patterns: string[];
} {
  const registry = modelRegistry[provider.toLowerCase()];

  if (!registry) {
    return { hasDefaults: false, patternCount: 0, exactMatchCount: 0, patterns: [] };
  }

  return {
    hasDefaults: true,
    patternCount: Object.keys(registry.patterns || {}).length,
    exactMatchCount: Object.keys(registry.exactMatches || {}).length,
    patterns: Object.keys(registry.patterns || {}),
  };
}

/**
 * Get Bedrock model information by model name
 */
export function getBedrockModelInfo(modelName: string) {
  return bedrockModels[modelName] || null;
}

/**
 * Get all Bedrock models
 */
export function getAllBedrockModels() {
  return bedrockModels;
}

/**
 * Get Bedrock models by family
 */
export function getBedrockModelsByFamily(family: string) {
  return Object.fromEntries(
    Object.entries(bedrockModels).filter(([, model]) => model.modelFamily === family)
  );
}

/**
 * Validate if a model is supported in Bedrock
 */
export function isBedrockModelSupported(modelName: string): boolean {
  return modelName in bedrockModels;
}

/**
 * Get Bedrock model by its AWS model ID
 */
export function getBedrockModelByAwsId(awsModelId: string) {
  return Object.values(bedrockModels).find((model) => model.bedrockModelId === awsModelId) || null;
}

// Export types for external use
export type {
  ProviderModelRegistry,
  ModelParameterDefaults,
  ModelRegistryEntry,
  ModelRegistryMergeResult,
} from './types.js';

// Re-export Bedrock model functions for convenience
export {
  bedrockModels,
  getModelByBedrockId,
  getModelsByFamily,
  getModelsByRegion,
  getModelsByCapability,
  calculateBedrockCost,
  validateModelParameters,
  anthropicModels,
  amazonModels,
  metaModels,
  mistralModels,
  cohereModels,
  ai21Models,
} from './bedrock-models.js';
