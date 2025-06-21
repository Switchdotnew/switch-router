import { redisConfigSchema, type RedisConfig } from '../types/shared/redis-config.js';
import { EnterpriseRedisClient } from './redis/client.js';
import { ConfigurationSync } from './redis/config-sync.js';
import { getRedisConfig } from './utils/feature-detection.js';
import log from '../utils/logging.js';

// Re-export all enterprise functionality
export { EnterpriseRedisClient, ConfigurationSync };
export * from './utils/feature-detection.js';
export * from './redis/errors.js';
export * from '../types/domains/enterprise.js';

/**
 * Factory function to create a configured Redis client for enterprise use
 */
export function createEnterpriseRedisClient(): EnterpriseRedisClient {
  const rawConfig = getRedisConfig();
  
  // Validate the configuration against schema
  const config: RedisConfig = redisConfigSchema.parse({
    url: rawConfig.url,
    connectTimeout: rawConfig.connectTimeout,
    commandTimeout: rawConfig.commandTimeout,
    retryAttempts: rawConfig.retryAttempts,
    retryDelay: rawConfig.retryDelay,
    maxRetryDelay: rawConfig.maxRetryDelay,
  });

  log.debug('Creating enterprise Redis client with configuration', {
    url: config.url.replace(/\/\/[^@]*@/, '//***:***@'), // Mask credentials
    connectTimeout: config.connectTimeout,
    commandTimeout: config.commandTimeout,
    retryAttempts: config.retryAttempts,
  });

  return new EnterpriseRedisClient(config);
}

/**
 * Factory function to create a configured ConfigurationSync instance
 */
export function createConfigurationSync(instanceId: string): {
  redisClient: EnterpriseRedisClient;
  configSync: ConfigurationSync;
} {
  const redisClient = createEnterpriseRedisClient();
  const configSync = new ConfigurationSync(redisClient, instanceId);

  return { redisClient, configSync };
}

/**
 * Enterprise feature status and health check
 */
export async function getEnterpriseStatus(): Promise<{
  enabled: boolean;
  mode: 'local' | 'remote';
  instanceId: string;
  features: {
    redisConfig: boolean;
    configSync: boolean;
  };
  health?: {
    redis: Awaited<ReturnType<EnterpriseRedisClient['healthCheck']>>;
    configSync?: Awaited<ReturnType<ConfigurationSync['healthCheck']>>;
  };
}> {
  const { isEnterpriseMode, getRouterMode, getInstanceId } = await import('./utils/feature-detection.js');
  
  const status = {
    enabled: isEnterpriseMode(),
    mode: getRouterMode(),
    instanceId: getInstanceId(),
    features: {
      redisConfig: isEnterpriseMode(),
      configSync: isEnterpriseMode(),
    },
  };

  // If enterprise mode is not enabled, return basic status
  if (!isEnterpriseMode()) {
    return status;
  }

  // Perform health checks if enterprise mode is enabled
  try {
    const redisClient = createEnterpriseRedisClient();
    await redisClient.connect();
    
    const redisHealth = await redisClient.healthCheck();
    
    const result = {
      ...status,
      health: {
        redis: redisHealth,
      },
    };

    await redisClient.disconnect();
    
    return result;
  } catch (error) {
    log.error('Failed to check enterprise health:', error);
    
    return {
      ...status,
      health: {
        redis: {
          status: 'unhealthy' as const,
          details: {
            ping: false,
            connectionStatus: {
              isConnected: false,
              reconnectAttempts: 0,
              clientStatus: 'disconnected',
              subscriberStatus: 'disconnected',
            },
          },
        },
      },
    };
  }
}

/**
 * Initialize enterprise features if enabled
 */
export async function initializeEnterpriseFeatures(): Promise<{
  enabled: boolean;
  configSync?: ConfigurationSync;
  redisClient?: EnterpriseRedisClient;
}> {
  const { isEnterpriseMode, getInstanceId, validateEnterpriseEnvironment } = await import('./utils/feature-detection.js');
  
  if (!isEnterpriseMode()) {
    log.debug('Enterprise features disabled - running in local mode');
    return { enabled: false };
  }

  try {
    // Validate environment before initializing
    validateEnterpriseEnvironment();
    
    const instanceId = getInstanceId();
    const { redisClient, configSync } = createConfigurationSync(instanceId);

    log.info('Initializing enterprise features...', {
      instanceId,
      features: ['redisConfig', 'configSync'],
    });

    // Connect to Redis
    await redisClient.connect();

    // Initialize configuration sync
    await configSync.initialize();

    log.info('✅ Enterprise features initialized successfully', {
      instanceId,
      configVersion: configSync.getCurrentConfigVersion(),
    });

    return {
      enabled: true,
      configSync,
      redisClient,
    };
  } catch (error) {
    log.error('❌ Failed to initialize enterprise features:', error);
    throw error;
  }
}

/**
 * Gracefully shutdown enterprise features
 */
export async function shutdownEnterpriseFeatures(
  redisClient?: EnterpriseRedisClient
): Promise<void> {
  if (!redisClient) {
    return;
  }

  try {
    log.info('Shutting down enterprise features...');
    await redisClient.disconnect();
    log.info('Enterprise features shutdown complete');
  } catch (error) {
    log.warn('Error during enterprise features shutdown:', error);
  }
}