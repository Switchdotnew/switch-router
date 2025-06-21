// Central credential management system

import log from '../../utils/logging.js';
import {
  CredentialStoreRegistry,
  CredentialStoreFactory,
} from '../stores/credential-store-registry.js';
import { CredentialResolver } from '../resolvers/credential-resolver.js';
import type {
  ICredentialStoreRegistry,
  ICredentialStoreEntry,
} from '../interfaces/credential-store-interface.js';
import type {
  Credential,
  ICredentialStoreConfig,
  ICredentialValidationResult,
} from '../types/credential-types.js';
import type { IRequestContext } from '../../utils/request-context.js';

/**
 * Configuration for credential stores - supports both object and array formats
 */
export type ICredentialStoresConfig = Record<string, ICredentialStoreConfig> | ICredentialStoreConfig[];

/**
 * Central manager for all credential operations
 */
export class CredentialManager {
  private registry: ICredentialStoreRegistry;
  private resolver: CredentialResolver;
  private cleanupInterval?: NodeJS.Timeout;
  private initialized = false;

  constructor() {
    this.registry = new CredentialStoreRegistry(new CredentialStoreFactory());
    this.resolver = new CredentialResolver(this.registry);
  }

  /**
   * Extract environment variable references from a credential config
   */
  private extractEnvVarReferences(config: Record<string, unknown>): string[] {
    const envVars: string[] = [];

    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string' && key.endsWith('Var')) {
        envVars.push(value);
      }
    }

    return envVars;
  }

  /**
   * Initialize the credential manager with store configurations
   */
  public async initialize(storesConfig: ICredentialStoresConfig): Promise<void> {
    if (this.initialized) {
      log.warn('Credential manager already initialized');
      return;
    }

    log.info('Initializing credential manager', {
      storeCount: Object.keys(storesConfig).length,
      storeIds: Object.keys(storesConfig),
    });

    // Log detailed configuration for debugging
    for (const [storeId, config] of Object.entries(storesConfig)) {
      log.debug(`Credential store configuration for ${storeId}:`, {
        type: config.type,
        source: config.source,
        cacheTtl: config.cacheTtl,
        // Log environment variable names being referenced (not values)
        envVarsReferenced: this.extractEnvVarReferences(config.config),
      });

      // Check if referenced environment variables exist
      const envVarReferences = this.extractEnvVarReferences(config.config);
      for (const envVar of envVarReferences) {
        const exists = process.env[envVar] !== undefined;
        const hasValue = exists && process.env[envVar] !== '';
        log.debug(`Environment variable ${envVar}: exists=${exists}, hasValue=${hasValue}`);

        if (!exists) {
          log.warn(`Missing environment variable: ${envVar} (required for store ${storeId})`);
        } else if (!hasValue) {
          log.warn(`Empty environment variable: ${envVar} (required for store ${storeId})`);
        }
      }
    }

    const startTime = Date.now();
    const registrationPromises: Promise<void>[] = [];
    const errors: Array<{ storeId: string; error: string; details?: Record<string, unknown> }> = [];

    // Register all credential stores
    for (const [storeId, config] of Object.entries(storesConfig)) {
      const registrationPromise = this.registry.register(storeId, config).catch((error) => {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const errorDetails = {
          configType: config.type,
          configSource: config.source,
          envVarsReferenced: this.extractEnvVarReferences(config.config),
        } as Record<string, unknown>;

        errors.push({ storeId, error: message, details: errorDetails });
        log.error(`Failed to register credential store ${storeId}: ${message}`, errorDetails);
      });

      registrationPromises.push(registrationPromise);
    }

    // Wait for all registrations to complete
    await Promise.all(registrationPromises);

    // Check if we have any successful registrations
    const successfulStores = this.registry.listStores();
    const totalStores = Object.keys(storesConfig).length;

    if (successfulStores.length === 0) {
      // In test environments or when no credentials are provided, this might be expected
      const isTestEnvironment = process.env.NODE_ENV === 'test' || process.env.CI === 'true';

      if (isTestEnvironment) {
        log.warn(
          'No credential stores could be registered in test environment. This may be expected if test credentials are not provided.'
        );
        log.warn('Failed stores:');
        for (const error of errors) {
          log.warn(`- ${error.storeId}: ${error.error}`);
          if (
            error.details?.envVarsReferenced &&
            Array.isArray(error.details.envVarsReferenced) &&
            error.details.envVarsReferenced.length > 0
          ) {
            log.warn(
              `  Environment variables checked: ${error.details.envVarsReferenced.join(', ')}`
            );
          }
        }
        log.warn('Tests that require credentials will be skipped.');
      } else {
        log.error('No credential stores could be registered. Common issues:');
        log.error('1. Missing required environment variables');
        log.error('2. Invalid credential store configuration');
        log.error('3. Environment variables exist but are empty');
        log.error('');
        log.error('Failed stores:');
        for (const error of errors) {
          log.error(`- ${error.storeId}: ${error.error}`);
          if (
            error.details?.envVarsReferenced &&
            Array.isArray(error.details.envVarsReferenced) &&
            error.details.envVarsReferenced.length > 0
          ) {
            log.error(
              `  Environment variables checked: ${error.details.envVarsReferenced.join(', ')}`
            );
          }
        }
        throw new Error(
          'Failed to register any credential stores. Check environment variables and configurations.'
        );
      }
    }

    if (errors.length > 0) {
      log.warn(`Some credential stores failed to register: ${errors.length}/${totalStores}`, {
        failures: errors.map((e) => ({ storeId: e.storeId, error: e.error })),
      });
    }

    // Start automatic cache cleanup
    this.cleanupInterval = this.resolver.startCacheCleanup();

    this.initialized = true;

    const initTime = Date.now() - startTime;
    log.info('Credential manager initialized successfully', {
      successfulStores: successfulStores.length,
      failedStores: errors.length,
      totalStores,
      successfulStoreIds: successfulStores,
      initTimeMs: initTime,
    });
  }

  /**
   * Resolve credentials by reference with optional timeout context
   * Supports both string names and numeric IDs for credential references
   */
  public async resolveCredentials(credentialsRef: string | number, requestContext?: IRequestContext): Promise<Credential> {
    if (!this.initialized) {
      throw new Error(
        `Credential manager not initialized. Cannot resolve credentials for '${credentialsRef}'. ` +
          'Ensure the credential manager is initialized with credential store configurations before use.'
      );
    }

    return this.resolver.resolve(credentialsRef, requestContext);
  }

  /**
   * Check if a credential reference exists
   * Supports both string names and numeric IDs for credential references
   */
  public hasCredentials(credentialsRef: string | number): boolean {
    return this.resolver.canResolve(credentialsRef);
  }

  /**
   * Validate a credential reference
   * Supports both string names and numeric IDs for credential references
   */
  public async validateCredentialReference(credentialsRef: string | number): Promise<{
    valid: boolean;
    error?: string;
  }> {
    if (!this.initialized) {
      return {
        valid: false,
        error: `Credential manager not initialized. Cannot validate credentials for '${credentialsRef}'.`,
      };
    }

    return this.resolver.validateReference(credentialsRef);
  }

  /**
   * Get all registered credential store IDs
   */
  public getCredentialStoreIds(): string[] {
    return this.registry.listStores();
  }

  /**
   * Get credential store entries with status information
   */
  public getCredentialStoreEntries(): ICredentialStoreEntry[] {
    return this.registry.getStoreEntries();
  }

  /**
   * Get specific credential store entry
   */
  public getCredentialStoreEntry(storeId: string): ICredentialStoreEntry | undefined {
    return this.registry.getStoreEntry(storeId);
  }

  /**
   * Validate all credential stores
   */
  public async validateAllCredentialStores(): Promise<Map<string, ICredentialValidationResult>> {
    if (!this.initialized) {
      throw new Error('Credential manager not initialized');
    }

    return this.registry.validateAll();
  }

  /**
   * Pre-warm credential cache for commonly used references
   * Supports both string names and numeric IDs for credential references
   */
  public async preWarmCredentials(credentialsRefs: (string | number)[]): Promise<void> {
    if (!this.initialized) {
      throw new Error('Credential manager not initialized');
    }

    await this.resolver.preWarm(credentialsRefs);
  }

  /**
   * Add a new credential store at runtime
   */
  public async addCredentialStore(storeId: string, config: ICredentialStoreConfig): Promise<void> {
    if (!this.initialized) {
      throw new Error('Credential manager not initialized');
    }

    await this.registry.register(storeId, config);
    log.info(`Added credential store at runtime: ${storeId}`);
  }

  /**
   * Remove a credential store
   */
  public async removeCredentialStore(storeId: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('Credential manager not initialized');
    }

    await this.registry.unregister(storeId);
    this.resolver.clearCacheFor(storeId);
    log.info(`Removed credential store: ${storeId}`);
  }

  /**
   * Refresh credentials for a specific store (clears cache)
   * Supports both string names and numeric IDs for credential references
   */
  public refreshCredentials(credentialsRef: string | number): void {
    this.resolver.clearCacheFor(credentialsRef);
    log.info(`Refreshed credentials for: ${credentialsRef} (${typeof credentialsRef})`);
  }

  /**
   * Clear all credential caches
   */
  public clearAllCredentialCaches(): void {
    this.resolver.clearCache();
    log.info('Cleared all credential caches');
  }

  /**
   * Get credential cache statistics
   */
  public getCredentialCacheStats(): {
    totalEntries: number;
    hitRate?: number;
    entries: Array<{
      ref: string;
      expiresAt: Date;
      type: string;
    }>;
  } {
    return this.resolver.getCacheStats();
  }

  /**
   * Health check for all credential stores
   */
  public async healthCheck(): Promise<{
    healthy: boolean;
    stores: Array<{
      storeId: string;
      healthy: boolean;
      error?: string;
    }>;
  }> {
    if (!this.initialized) {
      return {
        healthy: false,
        stores: [{ storeId: 'manager', healthy: false, error: 'Not initialized' }],
      };
    }

    const storeIds = this.registry.listStores();
    const healthChecks = await Promise.allSettled(
      storeIds.map(async (storeId) => {
        const validation = await this.resolver.validateReference(storeId);
        return {
          storeId,
          healthy: validation.valid,
          error: validation.error,
        };
      })
    );

    const stores = healthChecks.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          storeId: storeIds[index],
          healthy: false,
          error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
        };
      }
    });

    const healthyCount = stores.filter((s) => s.healthy).length;
    const healthy = healthyCount > 0; // At least one store should be healthy

    return {
      healthy,
      stores,
    };
  }

  /**
   * Get configuration summary for debugging
   */
  public getConfigurationSummary(): {
    initialized: boolean;
    storeCount: number;
    cacheStats: {
      totalEntries: number;
      hitRate?: number;
      entries: Array<{
        ref: string;
        expiresAt: Date;
        type: string;
      }>;
    };
    stores: Array<{
      storeId: string;
      type: string;
      source: string;
      status: string;
      lastAccessed?: Date;
    }>;
  } {
    const entries = this.registry.getStoreEntries();

    return {
      initialized: this.initialized,
      storeCount: entries.length,
      cacheStats: this.resolver.getCacheStats(),
      stores: entries.map((entry: ICredentialStoreEntry) => ({
        storeId: entry.id,
        type: entry.config.type,
        source: entry.config.source,
        status: entry.status,
        lastAccessed: entry.lastAccessed,
      })),
    };
  }

  /**
   * Dispose of the credential manager
   */
  public async dispose(): Promise<void> {
    log.info('Disposing credential manager');

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    this.resolver.clearCache();
    await this.registry.dispose();

    this.initialized = false;

    log.info('Credential manager disposed');
  }
}
