/**
 * Enterprise-specific domain types for Redis integration and distributed coordination
 */

export interface IEnterpriseConfig {
  mode: 'local' | 'remote';
  instanceId: string;
  redis?: {
    url: string;
    configKeyPrefix: string;
    configChannelPrefix: string;
    connectTimeout: number;
    commandTimeout: number;
    retryAttempts: number;
  };
  platform?: {
    apiUrl: string;
  };
}

export interface IRedisConnectionStatus {
  isConnected: boolean;
  reconnectAttempts: number;
  clientStatus: string;
  subscriberStatus: string;
  lastConnectedAt?: Date;
  lastErrorAt?: Date;
  lastError?: string;
}

export interface IConfigSyncStatus {
  initialized: boolean;
  currentVersion: string | null;
  instanceId: string;
  redisStatus: IRedisConnectionStatus;
  lastSyncAt?: Date;
  lastSyncError?: string;
}

export interface IEnterpriseFeatureStatus {
  enabled: boolean;
  mode: 'local' | 'remote';
  instanceId: string;
  configSync?: IConfigSyncStatus;
  features: {
    redisConfig: boolean;
    metricsPublishing: boolean;
    instanceRegistry: boolean;
  };
}

// Event types for enterprise operations
export type EnterpriseEventType = 
  | 'config_update_received'
  | 'config_update_applied'
  | 'config_update_failed'
  | 'redis_connected'
  | 'redis_disconnected'
  | 'redis_reconnecting'
  | 'instance_registered'
  | 'instance_deregistered';

export interface IEnterpriseEvent {
  type: EnterpriseEventType;
  timestamp: Date;
  instanceId: string;
  data?: Record<string, unknown>;
  error?: string;
}