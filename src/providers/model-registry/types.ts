/**
 * Model Registry Types
 *
 * Defines the structure for model defaults and parameter management
 */

export interface ModelParameterDefaults {
  /**
   * Default provider parameters applied to all requests
   */
  providerParams?: Record<string, unknown>;

  /**
   * Parameters applied only to streaming requests (overrides providerParams)
   */
  streamingParams?: Record<string, unknown>;

  /**
   * Parameters applied only to health check requests (overrides all others)
   */
  healthCheckParams?: Record<string, unknown>;

  /**
   * Parameter validation rules
   */
  parameterValidation?: {
    [paramName: string]: {
      min?: number;
      max?: number;
      clamp?: boolean; // If true, clamp values to min/max range
      allowedValues?: (string | number)[];
      required?: boolean;
    };
  };

  /**
   * Parameters that should be removed for non-streaming requests
   */
  removeForNonStreaming?: string[];

  /**
   * Parameters that should be added only for streaming requests
   */
  addForStreaming?: Record<string, unknown>;

  /**
   * Parameters that are unsupported by this provider/model and should be removed
   */
  unsupportedParams?: string[];

  /**
   * Parameter name transformations (e.g., OpenAI -> Anthropic format)
   */
  parameterMappings?: {
    [openaiParam: string]: string; // Maps OpenAI param name to provider param name
  };
}

export interface ModelRegistryEntry {
  /**
   * Default parameters for this model
   */
  defaults: ModelParameterDefaults;

  /**
   * Optional description of why these defaults are needed
   */
  description?: string;

  /**
   * Documentation link for this model's requirements
   */
  documentation?: string;

  /**
   * Confidence level of these defaults (user can see this)
   */
  confidence?: 'high' | 'medium' | 'low';
}

export interface ProviderModelRegistry {
  /**
   * Pattern-based matches (e.g., "qwen*" matches "qwen3-0.6b", "qwen2.5-72b", etc.)
   */
  patterns: {
    [pattern: string]: ModelRegistryEntry;
  };

  /**
   * Exact model name matches (higher priority than patterns)
   */
  exactMatches: {
    [modelName: string]: ModelRegistryEntry;
  };

  /**
   * Provider-wide defaults applied to all models for this provider
   */
  providerDefaults?: ModelParameterDefaults;
}

export interface ModelRegistryMergeResult {
  /**
   * Final merged parameters
   */
  providerParams: Record<string, unknown>;
  streamingParams: Record<string, unknown>;
  healthCheckParams: Record<string, unknown>;

  /**
   * Log of what defaults were applied
   */
  appliedDefaults: string[];

  /**
   * Warnings about parameter conflicts or issues
   */
  warnings: string[];

  /**
   * Information about transformations made
   */
  transformations: string[];
}
