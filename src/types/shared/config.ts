import { z } from 'zod';
import { LogLevelValues } from './enums.js';

export const serverConfigSchema = z.object({
  port: z.number().default(3000),
  hostname: z.string().default('localhost'),
});

export const logConfigSchema = z.object({
  level: z
    .enum(Object.values(LogLevelValues) as [string, ...string[]])
    .default(LogLevelValues.INFO),
});

export const permanentFailureConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    timeoutMultiplier: z.number().min(1).max(20).default(5),
    baseTimeoutMs: z.number().min(60000).default(300000), // Minimum 1 minute, default 5 minutes
    maxBackoffMultiplier: z.number().min(1).max(10).default(4), // Max 2^4 = 16x multiplier
    errorPatterns: z
      .array(z.string())
      .default([
        '404.*not found',
        '401.*unauthorized',
        '403.*forbidden',
        'authentication.*failed',
        'invalid.*credentials',
        'api.*key.*invalid',
        'endpoint.*not.*found',
      ])
      .optional(),
  })
  .optional();

export const timeoutConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultTimeoutMs: z.number().min(1000).max(600000).default(60000), // 1s to 10min, default 60s
  maxTimeoutMs: z.number().min(5000).max(1800000).default(300000), // 5s to 30min, default 5min
  minTimeoutMs: z.number().min(100).max(30000).default(1000), // 100ms to 30s, default 1s
  includeTimeoutHeaders: z.boolean().default(true),
  endpointTimeouts: z.record(z.string(), z.number().positive()).optional(),
  credentialResolutionTimeoutMs: z.number().min(1000).max(60000).default(10000), // 1s to 1min, default 10s
  providerTimeoutMultiplier: z.number().min(0.1).max(2.0).default(0.8), // 10% to 200% of request timeout
  streamingTimeoutMs: z.number().min(10000).max(1800000).default(600000), // 10s to 30min, default 10min
});

export const performanceConfigSchema = z.object({
  mode: z.enum(['standard', 'high_throughput']).default('standard'),
  disable_debug_logging: z.boolean().default(false),
  disable_metrics: z.boolean().default(false),
  cache_duration_ms: z.number().default(10000),
  lightweight_validation: z.boolean().default(false),
  disable_pretty_logging: z.boolean().default(false),
  max_concurrent_requests: z.number().default(50),
});

export const healthCheckConfigSchema = z.object({
  maxConcurrentChecks: z.number().min(1).max(100).default(20),
  defaultTimeoutMs: z.number().min(1000).max(30000).default(5000),
  primaryProviderIntervalMs: z.number().min(5000).max(300000).default(30000),
  fallbackProviderIntervalMs: z.number().min(10000).max(600000).default(45000),
  failedProviderIntervalMs: z.number().min(5000).max(60000).default(15000),
  maxRetries: z.number().min(0).max(10).default(3),
  retryDelayMs: z.number().min(100).max(10000).default(1000),
  enablePrioritization: z.boolean().default(true),
  enableAdaptiveIntervals: z.boolean().default(true),
});

export const routingConfigSchema = z.object({
  enableFallback: z.boolean().default(true),
  healthCheckInterval: z.number().default(30000),
  permanentFailureHandling: permanentFailureConfigSchema,
  healthCheck: healthCheckConfigSchema.optional(),
});

export const credentialStoreConfigSchema = z.object({
  id: z.number().optional(),
  name: z.string().optional(),
  type: z.enum(['simple', 'aws', 'google', 'azure', 'oauth']),
  source: z.enum(['env', 'file', 'vault', 'aws-secrets', 'inline']),
  config: z.record(z.unknown()),
  cacheTtl: z.number().optional(),
  rotation: z
    .object({
      enabled: z.boolean().default(true),
      intervalHours: z.number().positive(),
      beforeExpiryHours: z.number().min(0),
    })
    .optional(),
});

// Provider configuration within pools
export const providerConfigSchema = z.object({
  name: z.string(),
  provider: z.enum(['openai', 'anthropic', 'bedrock', 'together', 'runpod', 'alibaba', 'custom', 'azure', 'vertex']),
  credentialsRef: z.union([z.string(), z.number()]),
  apiBase: z.string().url(),
  modelName: z.string(),
  priority: z.number().int().min(1).max(10),
  weight: z.number().int().positive().optional().default(1),
  timeout: z.number().int().positive().optional().default(30000),
  maxRetries: z.number().int().min(0).max(10).optional().default(3),
  retryDelay: z.number().int().positive().optional().default(1000),
  headers: z.record(z.string()).optional(),
  rateLimits: z
    .object({
      requestsPerMinute: z.number().int().positive().optional(),
      tokensPerMinute: z.number().int().positive().optional(),
    })
    .optional(),
  providerParams: z.record(z.unknown()).optional(),
  healthCheck: z
    .object({
      enabled: z.boolean().optional().default(true),
      intervalMs: z.number().int().positive().optional().default(30000),
      timeoutMs: z.number().int().positive().optional().default(5000),
      retries: z.number().int().min(0).max(5).optional().default(3),
    })
    .optional(),
  healthCheckParams: z.record(z.unknown()).optional(),
  streamingParams: z.record(z.unknown()).optional(),
  useModelDefaults: z.boolean().optional().default(true),
  costPerToken: z.number().optional(), // For cost optimization
});

export const circuitBreakerConfigSchema = z.object({
  enabled: z.boolean().default(true),
  failureThreshold: z.number().default(5),
  resetTimeout: z.number().default(60000),
  monitoringWindow: z.number().default(300000),
  minRequestsThreshold: z.number().default(10),
  errorThresholdPercentage: z.number().default(50),
  permanentFailureHandling: permanentFailureConfigSchema,
});

// Pool definition schema
export const poolDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  providers: z.array(providerConfigSchema),
  fallbackPoolIds: z.array(z.string()).default([]),
  routingStrategy: z
    .enum(['weighted', 'cost_optimized', 'fastest_response', 'round_robin', 'least_connections'])
    .default('fastest_response'),
  circuitBreaker: circuitBreakerConfigSchema,
  weightedRouting: z
    .object({
      autoAdjust: z.boolean().default(false),
      minWeight: z.number().min(0).default(1),
      maxWeight: z.number().min(1).default(100),
    })
    .optional(),
  costOptimization: z
    .object({
      maxCostPerToken: z.number().positive().optional(),
      prioritizeCost: z.boolean().default(false),
    })
    .optional(),
  healthThresholds: z.object({
    errorRate: z.number().min(0).max(100).default(20),
    responseTime: z.number().positive().default(30000),
    consecutiveFailures: z.number().int().min(1).default(3),
    minHealthyProviders: z.number().int().min(1).default(1),
  }),
});

// Model to pool mapping
export const modelConfigSchema = z.object({
  primaryPoolId: z.string(),
  defaultParameters: z
    .object({
      temperature: z.number().optional(),
      maxTokens: z.number().optional(),
    })
    .optional(),
});

// Main configuration schema with pool-based architecture
export const configSchema = z.object({
  server: serverConfigSchema,
  log: logConfigSchema,
  pools: z.array(poolDefinitionSchema),
  models: z.record(z.string(), modelConfigSchema),
  routing: routingConfigSchema,
  performance: performanceConfigSchema.optional(),
  timeout: timeoutConfigSchema.optional(),
  credentialStores: z.union([
    z.record(z.string(), credentialStoreConfigSchema),
    z.array(credentialStoreConfigSchema)
  ]).optional(),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;
export type LogConfig = z.infer<typeof logConfigSchema>;
export type RoutingConfig = z.infer<typeof routingConfigSchema>;
export type PerformanceConfig = z.infer<typeof performanceConfigSchema>;
export type TimeoutConfig = z.infer<typeof timeoutConfigSchema>;
export type HealthCheckConfig = z.infer<typeof healthCheckConfigSchema>;
export type CredentialStoreConfig = z.infer<typeof credentialStoreConfigSchema>;
export type PermanentFailureConfig = z.infer<typeof permanentFailureConfigSchema>;
export type CircuitBreakerConfig = z.infer<typeof circuitBreakerConfigSchema>;
export type ProviderConfig = z.infer<typeof providerConfigSchema>;
export type PoolDefinition = z.infer<typeof poolDefinitionSchema>;
export type ModelConfig = z.infer<typeof modelConfigSchema>;
export type Config = z.infer<typeof configSchema>;
