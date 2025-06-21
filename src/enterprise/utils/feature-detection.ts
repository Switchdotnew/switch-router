import log from '../../utils/logging.js';

export enum RouterMode {
  LOCAL = 'local',
  REMOTE = 'remote'
}

export function getRouterMode(): RouterMode {
  const mode = process.env.SWITCH_MODE?.toLowerCase();
  return mode === 'remote' ? RouterMode.REMOTE : RouterMode.LOCAL;
}

export function isEnterpriseMode(): boolean {
  return getRouterMode() === RouterMode.REMOTE;
}

export function requireEnterprise(feature: string): void {
  if (!isEnterpriseMode()) {
    throw new Error(
      `Feature '${feature}' requires enterprise mode. Set SWITCH_MODE=remote to enable.`
    );
  }
}

export function getInstanceId(): string {
  const instanceId = process.env.INSTANCE_ID;
  if (!instanceId && isEnterpriseMode()) {
    throw new Error('INSTANCE_ID environment variable is required in remote mode');
  }
  return instanceId || 'local-instance';
}

export function getRedisConfig(): {
  url: string;
  configKeyPrefix: string;
  configChannelPrefix: string;
  connectTimeout: number;
  commandTimeout: number;
  retryAttempts: number;
  retryDelay: number;
  maxRetryDelay: number;
} {
  return {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    configKeyPrefix: process.env.REDIS_CONFIG_KEY_PREFIX || 'switch:instances',
    configChannelPrefix: process.env.REDIS_CONFIG_CHANNEL_PREFIX || 'switch:config',
    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '5000'),
    commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '3000'),
    retryAttempts: parseInt(process.env.REDIS_RETRY_ATTEMPTS || '5'),
    retryDelay: parseInt(process.env.REDIS_RETRY_DELAY || '1000'),
    maxRetryDelay: parseInt(process.env.REDIS_MAX_RETRY_DELAY || '30000'),
  };
}

export function logModeStatus(): void {
  const mode = getRouterMode();
  const instanceId = getInstanceId();
  
  if (mode === RouterMode.REMOTE) {
    log.info(`🏢 Enterprise mode enabled - Instance: ${instanceId}`);
    log.info(`📡 Redis configuration: ${getRedisConfig().url}`);
  } else {
    log.info(`🏠 Local mode enabled - Standalone operation`);
  }
}

export function validateEnterpriseEnvironment(): void {
  if (!isEnterpriseMode()) {
    return;
  }

  const requiredEnvVars = [
    'INSTANCE_ID',
    'REDIS_URL'
  ];

  const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for enterprise mode: ${missing.join(', ')}`
    );
  }

  // Validate Redis URL format
  const redisUrl = process.env.REDIS_URL!;
  try {
    new URL(redisUrl);
  } catch (error) {
    throw new Error(`Invalid REDIS_URL format: ${redisUrl}`);
  }

  log.debug('Enterprise environment validation passed');
}