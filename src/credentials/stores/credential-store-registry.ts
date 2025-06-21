// Credential store registry implementation

import log from '../../utils/logging.js';
import { SimpleCredentialStore } from './simple-credential-store.js';
import { AWSCredentialStore } from './aws-credential-store.js';
import type {
  ICredentialStore,
  ICredentialStoreRegistry,
  ICredentialStoreFactory,
} from '../interfaces/credential-store-interface.js';
import type {
  ICredentialStoreConfig,
  ICredentialValidationResult,
  ICredentialStoreEntry,
} from '../types/credential-types.js';

/**
 * Factory for creating credential stores
 */
export class CredentialStoreFactory implements ICredentialStoreFactory {
  private static readonly SUPPORTED_TYPES = ['simple', 'aws', 'google', 'azure', 'oauth'];

  public async createStore(
    storeId: string,
    config: ICredentialStoreConfig
  ): Promise<ICredentialStore> {
    // Validate configuration first
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      const errorMessages = validation.errors.map((e) => e.message).join(', ');
      throw new Error(`Invalid credential store config for ${storeId}: ${errorMessages}`);
    }

    switch (config.type) {
      case 'simple':
        return new SimpleCredentialStore(storeId, config);

      case 'aws':
        return new AWSCredentialStore(storeId, config);

      case 'google':
        throw new Error(
          'Google credential store is not yet implemented. Please use a supported credential store type.'
        );

      case 'azure':
        throw new Error(
          'Azure credential store is not yet implemented. Please use a supported credential store type.'
        );

      case 'oauth':
        throw new Error(
          'OAuth credential store is not yet implemented. Please use a supported credential store type.'
        );

      default:
        throw new Error(`Unsupported credential store type: ${config.type}`);
    }
  }

  public getSupportedTypes(): string[] {
    return [...CredentialStoreFactory.SUPPORTED_TYPES];
  }

  public validateConfig(config: ICredentialStoreConfig): ICredentialValidationResult {
    const errors: Array<{ field: string; message: string; code: string }> = [];
    const warnings: Array<{ field: string; message: string; code: string }> = [];

    // Validate type
    if (!config.type) {
      errors.push({
        field: 'type',
        message: 'Credential store type is required',
        code: 'MISSING_TYPE',
      });
    } else if (!CredentialStoreFactory.SUPPORTED_TYPES.includes(config.type)) {
      errors.push({
        field: 'type',
        message: `Unsupported credential store type: ${config.type}`,
        code: 'INVALID_TYPE',
      });
    }

    // Validate source
    const validSources = ['env', 'file', 'vault', 'aws-secrets', 'inline'];
    if (!config.source) {
      errors.push({
        field: 'source',
        message: 'Credential source is required',
        code: 'MISSING_SOURCE',
      });
    } else if (!validSources.includes(config.source)) {
      errors.push({
        field: 'source',
        message: `Invalid credential source: ${config.source}`,
        code: 'INVALID_SOURCE',
      });
    }

    // Warn about inline credentials in production
    if (config.source === 'inline') {
      warnings.push({
        field: 'source',
        message: 'Inline credentials are not recommended for production use',
        code: 'INSECURE_SOURCE',
      });
    }

    // Validate config object
    if (!config.config || typeof config.config !== 'object') {
      errors.push({
        field: 'config',
        message: 'Credential config object is required',
        code: 'MISSING_CONFIG',
      });
    }

    // Validate cache TTL
    if (config.cacheTtl !== undefined) {
      if (typeof config.cacheTtl !== 'number' || config.cacheTtl < 0) {
        errors.push({
          field: 'cacheTtl',
          message: 'Cache TTL must be a non-negative number',
          code: 'INVALID_CACHE_TTL',
        });
      } else if (config.cacheTtl > 86400) {
        // 24 hours
        warnings.push({
          field: 'cacheTtl',
          message: 'Cache TTL longer than 24 hours may pose security risks',
          code: 'LONG_CACHE_TTL',
        });
      }
    }

    // Validate rotation config
    if (config.rotation) {
      if (typeof config.rotation !== 'object') {
        errors.push({
          field: 'rotation',
          message: 'Rotation config must be an object',
          code: 'INVALID_ROTATION_CONFIG',
        });
      } else {
        if (typeof config.rotation.enabled !== 'boolean') {
          errors.push({
            field: 'rotation.enabled',
            message: 'Rotation enabled flag must be a boolean',
            code: 'INVALID_ROTATION_ENABLED',
          });
        }

        if (
          config.rotation.intervalHours !== undefined &&
          (typeof config.rotation.intervalHours !== 'number' || config.rotation.intervalHours <= 0)
        ) {
          errors.push({
            field: 'rotation.intervalHours',
            message: 'Rotation interval hours must be a positive number',
            code: 'INVALID_ROTATION_INTERVAL',
          });
        }

        if (
          config.rotation.beforeExpiryHours !== undefined &&
          (typeof config.rotation.beforeExpiryHours !== 'number' ||
            config.rotation.beforeExpiryHours < 0)
        ) {
          errors.push({
            field: 'rotation.beforeExpiryHours',
            message: 'Before expiry hours must be a non-negative number',
            code: 'INVALID_BEFORE_EXPIRY',
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

/**
 * Registry for managing credential stores
 */
export class CredentialStoreRegistry implements ICredentialStoreRegistry {
  private stores = new Map<string, ICredentialStore>();
  private entries = new Map<string, ICredentialStoreEntry>();
  private factory: ICredentialStoreFactory;
  
  // Mapping for array-based configuration support
  private idToNameMapping = new Map<number, string>(); // numeric ID -> string name
  private nameToIdMapping = new Map<string, number>(); // string name -> numeric ID

  constructor(factory?: ICredentialStoreFactory) {
    this.factory = factory || new CredentialStoreFactory();
  }

  public async register(storeId: string, config: ICredentialStoreConfig): Promise<void> {
    if (this.stores.has(storeId)) {
      throw new Error(`Credential store with ID ${storeId} is already registered`);
    }

    log.info(`Registering credential store: ${storeId}`, {
      type: config.type,
      source: config.source,
    });

    try {
      const store = await this.factory.createStore(storeId, config);

      // Test the store by initializing it
      await store.initialize();

      // Validate the store
      const validation = await store.validate();
      if (!validation.valid) {
        const errorMessages = validation.errors.map((e) => e.message).join(', ');
        throw new Error(`Credential store validation failed: ${errorMessages}`);
      }

      this.stores.set(storeId, store);
      this.entries.set(storeId, {
        id: storeId,
        config,
        status: 'active',
        lastAccessed: new Date(),
      });

      // Register ID mappings for array-based configuration support
      const configWithIds = config as ICredentialStoreConfig & { id?: number; name?: string };
      if (typeof configWithIds.id === 'number' && typeof configWithIds.name === 'string') {
        this.idToNameMapping.set(configWithIds.id, configWithIds.name);
        this.nameToIdMapping.set(configWithIds.name, configWithIds.id);
        log.debug(`Registered credential store mappings: ID ${configWithIds.id} -> name "${configWithIds.name}"`);
      }

      log.info(`Credential store registered successfully: ${storeId}`);

      // Log warnings if any
      if (validation.warnings.length > 0) {
        for (const warning of validation.warnings) {
          log.warn(`Credential store warning for ${storeId}: ${warning.message}`, {
            field: warning.field,
            code: warning.code,
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error(`Failed to register credential store ${storeId}: ${message}`);

      this.entries.set(storeId, {
        id: storeId,
        config,
        status: 'error',
        errorMessage: message,
      });

      throw error;
    }
  }

  /**
   * Helper method to resolve store reference (string name or numeric ID) to actual store ID
   */
  private resolveStoreReference(storeRef: string | number): string | null {
    if (typeof storeRef === 'string') {
      // Direct string lookup (backward compatibility)
      if (this.stores.has(storeRef)) {
        return storeRef;
      }
      // String could be a numeric ID passed as string, try to parse
      const numericId = parseInt(storeRef, 10);
      if (!isNaN(numericId)) {
        const mappedName = this.idToNameMapping.get(numericId);
        if (mappedName && this.stores.has(mappedName)) {
          return mappedName;
        }
      }
      return null;
    } else {
      // Numeric ID lookup
      const mappedName = this.idToNameMapping.get(storeRef);
      if (mappedName && this.stores.has(mappedName)) {
        return mappedName;
      }
      return null;
    }
  }

  public async getStore(storeRef: string | number): Promise<ICredentialStore> {
    const storeId = this.resolveStoreReference(storeRef);
    if (!storeId) {
      throw new Error(`Credential store not found: ${storeRef} (${typeof storeRef})`);
    }

    const store = this.stores.get(storeId);
    if (!store) {
      throw new Error(`Credential store not found: ${storeRef} (resolved to ${storeId})`);
    }

    // Update last accessed time
    const entry = this.entries.get(storeId);
    if (entry) {
      entry.lastAccessed = new Date();
    }

    return store;
  }

  public hasStore(storeRef: string | number): boolean {
    const storeId = this.resolveStoreReference(storeRef);
    return storeId !== null && this.stores.has(storeId);
  }

  public async unregister(storeId: string): Promise<void> {
    const store = this.stores.get(storeId);
    const entry = this.entries.get(storeId);
    
    if (store) {
      log.info(`Unregistering credential store: ${storeId}`);

      try {
        await store.dispose();
      } catch (error) {
        log.warn(`Error disposing credential store ${storeId}:`, error);
      }

      this.stores.delete(storeId);
    }

    // Clean up ID mappings
    if (entry?.config) {
      const configWithIds = entry.config as ICredentialStoreConfig & { id?: number; name?: string };
      if (typeof configWithIds.id === 'number' && typeof configWithIds.name === 'string') {
        this.idToNameMapping.delete(configWithIds.id);
        this.nameToIdMapping.delete(configWithIds.name);
        log.debug(`Removed credential store mappings: ID ${configWithIds.id} -> name "${configWithIds.name}"`);
      }
    }

    this.entries.delete(storeId);
  }

  public listStores(): string[] {
    return Array.from(this.stores.keys());
  }

  public getStoreEntries(): ICredentialStoreEntry[] {
    return Array.from(this.entries.values());
  }

  public getStoreEntry(storeId: string): ICredentialStoreEntry | undefined {
    return this.entries.get(storeId);
  }

  public async validateAll(): Promise<Map<string, ICredentialValidationResult>> {
    const results = new Map<string, ICredentialValidationResult>();

    for (const [storeId, store] of this.stores) {
      try {
        const result = await store.validate();
        results.set(storeId, result);

        // Update entry status based on validation
        const entry = this.entries.get(storeId);
        if (entry) {
          entry.status = result.valid ? 'active' : 'error';
          if (!result.valid) {
            entry.errorMessage = result.errors.map((e) => e.message).join(', ');
          } else {
            entry.errorMessage = undefined;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        results.set(storeId, {
          valid: false,
          errors: [
            {
              field: 'general',
              message,
              code: 'VALIDATION_ERROR',
            },
          ],
          warnings: [],
        });

        // Update entry status
        const entry = this.entries.get(storeId);
        if (entry) {
          entry.status = 'error';
          entry.errorMessage = message;
        }
      }
    }

    return results;
  }

  public async dispose(): Promise<void> {
    log.info('Disposing all credential stores');

    const disposePromises = Array.from(this.stores.values()).map(async (store) => {
      try {
        await store.dispose();
      } catch (error) {
        log.warn(`Error disposing credential store:`, error);
      }
    });

    await Promise.all(disposePromises);

    this.stores.clear();
    this.entries.clear();
  }
}
