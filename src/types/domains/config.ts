// Internal configuration types for domain logic
import type { ICircuitBreakerConfig } from './core/index.js';
import type { ICredentialStoreConfig } from './credential.js';

export interface IServerConfig {
  host: string;
  port: number;
  cors: {
    origin: string | string[] | boolean;
    credentials: boolean;
  };
  rateLimiting: {
    enabled: boolean;
    windowMs: number;
    maxRequests: number;
    skipSuccessfulRequests: boolean;
  };
  compression: {
    enabled: boolean;
    level: number;
  };
  gracefulShutdown: {
    timeoutMs: number;
  };
}

export interface ILoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'json' | 'pretty';
  outputs: Array<{
    type: 'console' | 'file' | 'http';
    config?: Record<string, unknown>;
  }>;
  redactSensitive: boolean;
}

export interface ISecurityConfig {
  authentication: {
    apiKeys: string[];
    headerName: string;
    enabled: boolean;
  };
  rateLimiting: {
    global: {
      requestsPerMinute: number;
      burstLimit: number;
    };
    perKey: {
      requestsPerMinute: number;
      burstLimit: number;
    };
  };
  cors: {
    allowedOrigins: string[];
    allowedMethods: string[];
    allowedHeaders: string[];
    maxAge: number;
  };
}

export interface IDomainProviderConfig {
  name: string;
  provider:
    | 'openai'
    | 'anthropic'
    | 'together'
    | 'runpod'
    | 'bedrock'
    | 'vertex'
    | 'azure'
    | 'alibaba'
    | 'custom';

  // Credential configuration - supports both string names and numeric IDs
  credentialsRef?: string | number;

  // Legacy credential configuration (deprecated but supported)
  apiKey?: string;

  apiBase: string;
  modelName: string;
  priority: number;
  weight?: number;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  headers?: Record<string, string>;

  // Provider-specific parameters
  providerParams?: Record<string, unknown>;

  // Health check specific parameters
  healthCheckParams?: Record<string, unknown>;

  // Streaming-specific parameter overrides
  streamingParams?: Record<string, unknown>;

  rateLimits?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
  };
  healthCheck?: {
    enabled: boolean;
    intervalMs: number;
    timeoutMs: number;
    retries: number;
  };
  
  // Cost tracking for optimization
  costPerToken?: number;
}

export interface IPoolDefinition {
  id: string;
  name: string;
  description?: string;
  providers: IDomainProviderConfig[];
  fallbackPoolIds: string[];
  routingStrategy: 'weighted' | 'cost_optimized' | 'fastest_response' | 'round_robin' | 'least_connections';
  circuitBreaker: ICircuitBreakerConfig;
  weightedRouting?: {
    autoAdjust: boolean;
    minWeight: number;
    maxWeight: number;
  };
  costOptimization?: {
    maxCostPerToken: number;
    prioritizeCost: boolean;
  };
  healthThresholds: {
    errorRate: number;
    responseTime: number;
    consecutiveFailures: number;
    minHealthyProviders: number;
  };
}

export interface IModelConfig {
  primaryPoolId: string;
  defaultParameters?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    stop?: string[];
  };
}

export interface IMetricsConfig {
  enabled: boolean;
  collection: {
    intervalMs: number;
    retentionDays: number;
    aggregationWindows: number[];
  };
  exporters: Array<{
    type: 'prometheus' | 'datadog' | 'console';
    config: Record<string, unknown>;
    enabled: boolean;
  }>;
  alerts: {
    enabled: boolean;
    thresholds: {
      errorRate: number;
      responseTime: number;
      queueDepth: number;
    };
    webhooks: Array<{
      url: string;
      events: string[];
    }>;
  };
}

export interface IGatewayConfig {
  server: IServerConfig;
  logging: ILoggingConfig;
  security: ISecurityConfig;

  // Credential stores configuration - supports both object and array formats
  credentialStores?: Record<string, ICredentialStoreConfig> | ICredentialStoreConfig[];

  // Pool-based architecture
  pools: IPoolDefinition[];
  models: Record<string, IModelConfig>;
  
  metrics: IMetricsConfig;
  features: {
    streaming: boolean;
    healthChecks: boolean;
    gracefulShutdown: boolean;
    requestTracing: boolean;
    caching: {
      enabled: boolean;
      ttl: number;
      maxSize: number;
    };
  };
  environment: 'development' | 'staging' | 'production';
  version: string;
}

export interface IConfigOverride {
  environment?: string;
  server?: Partial<IServerConfig>;
  logging?: Partial<ILoggingConfig>;
  security?: Partial<ISecurityConfig>;
  models?: Record<string, Partial<IModelConfig>>;
  pools?: Partial<IPoolDefinition>[];
  metrics?: Partial<IMetricsConfig>;
  features?: Partial<IGatewayConfig['features']>;
}

export interface IConfigValidationError {
  path: string;
  message: string;
  value?: unknown;
}

export interface IConfigValidationResult {
  valid: boolean;
  errors: IConfigValidationError[];
  warnings: IConfigValidationError[];
}

export interface IConfigSource {
  type: 'file' | 'environment' | 'override';
  location: string;
  priority: number;
  lastModified?: Date;
}

export interface IConfigLoadResult {
  config: IGatewayConfig;
  sources: IConfigSource[];
  warnings: string[];
  validationResult: IConfigValidationResult;
}

