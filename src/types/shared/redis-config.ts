import { z } from 'zod';

// Redis connection configuration
export const redisConfigSchema = z.object({
  url: z.string().url(),
  connectTimeout: z.number().default(5000),
  commandTimeout: z.number().default(3000),
  retryAttempts: z.number().default(5),
  retryDelay: z.number().default(1000),
  maxRetryDelay: z.number().default(30000),
});

export type RedisConfig = z.infer<typeof redisConfigSchema>;

// Remote configuration payload
export const remoteConfigPayloadSchema = z.object({
  instanceId: z.string(),
  version: z.string(),
  timestamp: z.string().datetime(),
  deployedBy: z.string().optional(),
  credentialStores: z.record(z.unknown()).optional(),
  models: z.record(z.unknown()),
  routing: z.object({
    enableFallback: z.boolean().default(true),
    healthCheckInterval: z.number().default(30000),
    permanentFailureHandling: z.object({
      enabled: z.boolean().default(true),
      timeoutMultiplier: z.number().default(5),
      baseTimeoutMs: z.number().default(300000),
      maxBackoffMultiplier: z.number().default(4),
    }).optional(),
  }).optional(),
});

export type RemoteConfigPayload = z.infer<typeof remoteConfigPayloadSchema>;

// Configuration update event
export const configUpdateEventSchema = z.object({
  instanceId: z.string(),
  configVersion: z.string(),
  status: z.enum(['success', 'failed']),
  timestamp: z.string().datetime(),
  error: z.string().optional(),
});

export type ConfigUpdateEvent = z.infer<typeof configUpdateEventSchema>;