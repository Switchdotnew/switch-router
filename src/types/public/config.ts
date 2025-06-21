// Public configuration types for external API consumers

export interface ServerConfig {
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

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'json' | 'pretty';
  outputs: Array<{
    type: 'console' | 'file' | 'http';
    config?: Record<string, unknown>;
  }>;
  redactSensitive: boolean;
}

export interface SecurityConfig {
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

export interface CredentialStoreConfig {
  type: 'simple' | 'aws' | 'google' | 'azure' | 'oauth';
  source: 'env' | 'file' | 'vault' | 'aws-secrets' | 'inline';
  config: Record<string, unknown>;
  cacheTtl?: number;
  rotation?: {
    enabled: boolean;
    intervalHours: number;
    beforeExpiryHours: number;
  };
}

export interface CircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number;
  resetTimeout: number;
  monitoringWindow: number;
  minRequestsThreshold: number;
  errorThresholdPercentage: number;
}

export interface ProviderEndpointConfig {
  name: string;
  provider: 'openai' | 'anthropic' | 'together' | 'runpod' | 'alibaba' | 'custom';
  credentialsRef: string;
  apiBase: string;
  modelName: string;
  priority: number;
  weight?: number;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
  rateLimits?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
  };
  providerParams?: Record<string, unknown>;
  healthCheck?: {
    enabled?: boolean;
    intervalMs?: number;
    timeoutMs?: number;
    retries?: number;
  };
  healthCheckParams?: Record<string, unknown>;
  circuitBreaker?: CircuitBreakerConfig;
}

export interface ModelConfig {
  name: string;
  description?: string;
  providers: ProviderEndpointConfig[];
  defaultParameters?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    stop?: string[];
  };
  loadBalancing?: {
    strategy?:
      | 'round-robin'
      | 'weighted'
      | 'least-connections'
      | 'fastest-response'
      | 'priority-based';
    stickySessions?: boolean;
    sessionAffinityTtl?: number;
    healthCheckWeight?: number;
  };
  fallback?: {
    strategy?: 'simple' | 'priority-cascade' | 'model-degradation' | 'provider-failover';
    enabled?: boolean;
    maxAttempts?: number;
    delayMs?: number;
    backoffMultiplier?: number;
    enableModelDegradation?: boolean;
    degradationThresholds?: {
      responseTime?: number;
      errorRate?: number;
    };
  };
  limits?: {
    maxConcurrentRequests?: number;
    queueTimeoutMs?: number;
    requestTimeoutMs?: number;
  };
  circuitBreaker?: CircuitBreakerConfig;
}

export interface MetricsConfig {
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

export interface GatewayConfig {
  credentialStores?: Record<string, CredentialStoreConfig>;
  server?: ServerConfig;
  logging?: LoggingConfig;
  security?: SecurityConfig;
  models: Record<string, ModelConfig>;
  metrics?: MetricsConfig;
  features?: {
    streaming?: boolean;
    healthChecks?: boolean;
    gracefulShutdown?: boolean;
    requestTracing?: boolean;
    caching?: {
      enabled?: boolean;
      ttl?: number;
      maxSize?: number;
    };
  };
  environment?: 'development' | 'staging' | 'production';
  version?: string;
}

export interface ConfigOverride {
  environment?: string;
  server?: Partial<ServerConfig>;
  logging?: Partial<LoggingConfig>;
  security?: Partial<SecurityConfig>;
  models?: Record<string, Partial<ModelConfig>>;
  metrics?: Partial<MetricsConfig>;
  features?: Partial<GatewayConfig['features']>;
}

export interface ConfigValidationError {
  path: string;
  message: string;
  value?: unknown;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: ConfigValidationError[];
  warnings: ConfigValidationError[];
}

export interface ConfigSource {
  type: 'file' | 'environment' | 'override';
  location: string;
  priority: number;
  lastModified?: Date;
}

export interface ConfigLoadResult {
  config: GatewayConfig;
  sources: ConfigSource[];
  warnings: string[];
  validationResult: ConfigValidationResult;
}
