import log from '../../utils/logging.js';
import { EnterpriseRedisClient } from './client.js';
import { 
  remoteConfigPayloadSchema, 
  type RemoteConfigPayload 
} from '../../types/shared/redis-config.js';
import type { IConfigSyncStatus } from '../../types/domains/enterprise.js';
import { ConfigValidationError, ConfigSyncError } from './errors.js';

export class ConfigurationSync {
  private redisClient: EnterpriseRedisClient;
  private instanceId: string;
  private currentConfigVersion: string | null = null;
  private isInitialized = false;
  private lastSyncAt?: Date;
  private lastSyncError?: string;

  constructor(redisClient: EnterpriseRedisClient, instanceId: string) {
    this.redisClient = redisClient;
    this.instanceId = instanceId;
  }

  async initialize(): Promise<RemoteConfigPayload> {
    log.info(`Initializing configuration sync for instance: ${this.instanceId}`);

    try {
      // Load initial configuration from Redis
      const configData = await this.redisClient.getConfig(this.instanceId);
      
      if (!configData) {
        throw new ConfigSyncError(
          `No configuration found for instance: ${this.instanceId}`,
          undefined
        );
      }

      // Parse and validate configuration
      const config = await this.parseAndValidateConfig(configData);
      this.currentConfigVersion = config.version;
      this.lastSyncAt = new Date();
      this.lastSyncError = undefined;

      // Subscribe to configuration updates
      await this.redisClient.subscribeToConfigUpdates(this.instanceId, (configData) => {
        this.handleConfigUpdate(configData).catch(error => {
          log.error('Failed to handle config update:', error);
          this.lastSyncError = error instanceof Error ? error.message : String(error);
        });
      });

      this.isInitialized = true;
      log.info(`Configuration sync initialized successfully - Version: ${config.version}`, {
        instanceId: this.instanceId,
        configVersion: config.version,
        timestamp: config.timestamp,
        deployedBy: config.deployedBy,
        modelsCount: Object.keys(config.models).length,
        credentialStoresCount: Object.keys(config.credentialStores || {}).length,
      });
      
      return config;
    } catch (error) {
      this.lastSyncError = error instanceof Error ? error.message : String(error);
      log.error('Failed to initialize configuration sync:', error);
      throw error;
    }
  }

  private async parseAndValidateConfig(configData: string): Promise<RemoteConfigPayload> {
    try {
      // Parse JSON
      let parsedConfig: unknown;
      try {
        parsedConfig = JSON.parse(configData);
      } catch (jsonError) {
        throw new ConfigValidationError('Invalid JSON in configuration data');
      }
      
      // Validate against schema
      const validationResult = remoteConfigPayloadSchema.safeParse(parsedConfig);
      
      if (!validationResult.success) {
        const errorDetails = validationResult.error.errors
          .map(err => `${err.path.join('.')}: ${err.message}`)
          .join(', ');
        throw new ConfigValidationError(
          `Configuration validation failed: ${errorDetails}`,
          validationResult.error.errors.map(err => err.message)
        );
      }

      // Additional business logic validation
      await this.validateBusinessRules(validationResult.data);

      return validationResult.data;
    } catch (error) {
      if (error instanceof ConfigValidationError) {
        throw error;
      }
      throw new ConfigValidationError(`Configuration parsing failed: ${error}`);
    }
  }

  private async validateBusinessRules(config: RemoteConfigPayload): Promise<void> {
    const errors: string[] = [];

    // Validate instance ID matches
    if (config.instanceId !== this.instanceId) {
      errors.push(
        `Configuration instance ID (${config.instanceId}) does not match current instance (${this.instanceId})`
      );
    }

    // Validate required models exist
    if (!config.models || Object.keys(config.models).length === 0) {
      errors.push('Configuration must contain at least one model');
    }

    // Validate credential store references
    const credentialStores = new Set(Object.keys(config.credentialStores || {}));
    
    for (const [modelName, model] of Object.entries(config.models)) {
      if (!model || typeof model !== 'object') {
        errors.push(`Model '${modelName}' has invalid configuration`);
        continue;
      }
      
      const providers = (model as any).providers || [];
      if (!Array.isArray(providers) || providers.length === 0) {
        errors.push(`Model '${modelName}' must have at least one provider`);
        continue;
      }

      for (const [index, provider] of providers.entries()) {
        if (!provider || typeof provider !== 'object') {
          errors.push(`Model '${modelName}' provider ${index} has invalid configuration`);
          continue;
        }

        // Validate provider has required fields
        const requiredFields = ['name', 'provider', 'modelName'];
        for (const field of requiredFields) {
          if (!provider[field]) {
            errors.push(`Model '${modelName}' provider '${provider.name || index}' missing required field: ${field}`);
          }
        }

        // Validate credential reference if present
        if (provider.credentialsRef && !credentialStores.has(provider.credentialsRef)) {
          errors.push(
            `Model '${modelName}' provider '${provider.name}' references unknown credential store: ${provider.credentialsRef}`
          );
        }

        // Validate priority is a positive number
        if (typeof provider.priority !== 'number' || provider.priority < 1) {
          errors.push(
            `Model '${modelName}' provider '${provider.name}' must have a priority >= 1`
          );
        }
      }
    }

    // Validate timestamp format
    try {
      new Date(config.timestamp);
    } catch (dateError) {
      errors.push(`Invalid timestamp format: ${config.timestamp}`);
    }

    if (errors.length > 0) {
      throw new ConfigValidationError(
        `Configuration business rules validation failed: ${errors.join('; ')}`,
        errors
      );
    }

    log.debug('Configuration business rules validation passed', {
      instanceId: config.instanceId,
      version: config.version,
      modelsValidated: Object.keys(config.models).length,
      credentialStoresValidated: Object.keys(config.credentialStores || {}).length,
    });
  }

  private async handleConfigUpdate(configData: string): Promise<void> {
    try {
      log.info('Processing configuration update...', {
        instanceId: this.instanceId,
        currentVersion: this.currentConfigVersion,
      });
      
      // Parse and validate new configuration
      const newConfig = await this.parseAndValidateConfig(configData);
      
      // Skip if same version
      if (newConfig.version === this.currentConfigVersion) {
        log.debug(`Skipping config update - same version: ${newConfig.version}`);
        return;
      }

      log.info(`Applying configuration update: ${this.currentConfigVersion} → ${newConfig.version}`, {
        instanceId: this.instanceId,
        oldVersion: this.currentConfigVersion,
        newVersion: newConfig.version,
        deployedBy: newConfig.deployedBy,
        timestamp: newConfig.timestamp,
      });
      
      // TODO: Phase 2 - Trigger router reload
      // const router = getRouter();
      // await router.reloadConfiguration(newConfig);
      
      // For now, just update version tracking and log the change
      const previousVersion = this.currentConfigVersion;
      this.currentConfigVersion = newConfig.version;
      this.lastSyncAt = new Date();
      this.lastSyncError = undefined;
      
      log.info(`Configuration update applied successfully: ${newConfig.version}`, {
        instanceId: this.instanceId,
        previousVersion,
        newVersion: newConfig.version,
        modelsCount: Object.keys(newConfig.models).length,
        credentialStoresCount: Object.keys(newConfig.credentialStores || {}).length,
      });

      // TODO: Phase 2 - Report success back to platform
      // await this.reportConfigUpdateStatus('success', newConfig.version);
      
    } catch (error) {
      this.lastSyncError = error instanceof Error ? error.message : String(error);
      log.error('Failed to apply configuration update:', error);
      
      // TODO: Phase 2 - Report failure back to platform
      // await this.reportConfigUpdateStatus('failed', 'unknown', error.message);
    }
  }

  getCurrentConfigVersion(): string | null {
    return this.currentConfigVersion;
  }

  isConfigSyncInitialized(): boolean {
    return this.isInitialized;
  }

  getStatus(): IConfigSyncStatus {
    return {
      initialized: this.isInitialized,
      currentVersion: this.currentConfigVersion,
      instanceId: this.instanceId,
      redisStatus: this.redisClient.getConnectionStatus(),
      lastSyncAt: this.lastSyncAt,
      lastSyncError: this.lastSyncError,
    };
  }

  async refreshConfig(): Promise<RemoteConfigPayload | null> {
    if (!this.isInitialized) {
      throw new ConfigSyncError('Configuration sync not initialized');
    }

    try {
      log.info('Manually refreshing configuration...', {
        instanceId: this.instanceId,
        currentVersion: this.currentConfigVersion,
      });

      const configData = await this.redisClient.getConfig(this.instanceId);
      if (!configData) {
        log.warn('No configuration found during manual refresh');
        return null;
      }

      const config = await this.parseAndValidateConfig(configData);
      
      if (config.version !== this.currentConfigVersion) {
        log.info(`New configuration version detected during refresh: ${config.version}`);
        await this.handleConfigUpdate(configData);
      } else {
        log.debug('Configuration is up to date');
      }

      return config;
    } catch (error) {
      this.lastSyncError = error instanceof Error ? error.message : String(error);
      log.error('Failed to refresh configuration:', error);
      throw error;
    }
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: {
      initialized: boolean;
      redisConnected: boolean;
      lastSyncAge?: number;
      hasErrors: boolean;
    };
  }> {
    const redisStatus = this.redisClient.getConnectionStatus();
    const lastSyncAge = this.lastSyncAt 
      ? Date.now() - this.lastSyncAt.getTime()
      : undefined;

    const details = {
      initialized: this.isInitialized,
      redisConnected: redisStatus.isConnected,
      lastSyncAge,
      hasErrors: !!this.lastSyncError,
    };

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (!this.isInitialized || !redisStatus.isConnected || this.lastSyncError) {
      status = 'unhealthy';
    } else if (lastSyncAge && lastSyncAge > 300000) { // 5 minutes
      status = 'degraded';
    }

    return { status, details };
  }
}