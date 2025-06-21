// Base credential store implementation

import log from '../../utils/logging.js';
import type {
  ICredentialStore,
  ICredentialResolutionResult,
  ICredentialValidationResult,
} from '../interfaces/credential-store-interface.js';
import type { ICredentialStoreConfig } from '../types/credential-types.js';

/**
 * Base implementation for credential stores
 */
export abstract class BaseCredentialStore implements ICredentialStore {
  public readonly type: string;
  public readonly storeId: string;
  protected config: ICredentialStoreConfig;
  protected cache?: ICredentialResolutionResult;
  protected cacheExpiresAt?: Date;
  protected initialized = false;

  constructor(storeId: string, config: ICredentialStoreConfig) {
    this.storeId = storeId;
    this.config = config;
    this.type = config.type;
  }

  /**
   * Initialize the credential store
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    log.debug(`Initializing credential store: ${this.storeId}`, {
      type: this.type,
      source: this.config.source,
    });

    await this.doInitialize();
    this.initialized = true;

    log.info(`Credential store initialized: ${this.storeId}`);
  }

  /**
   * Resolve credentials with caching
   */
  public async resolve(): Promise<ICredentialResolutionResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Check cache first
    if (this.isCacheValid()) {
      log.debug(`Using cached credentials for store: ${this.storeId}`);
      if (this.cache) {
        return {
          ...this.cache,
          fromCache: true,
        };
      }
    }

    log.debug(`Resolving fresh credentials for store: ${this.storeId}`);

    const result = await this.doResolve();

    // Cache the result if TTL is configured
    if (this.config.cacheTtl && this.config.cacheTtl > 0) {
      this.cache = { ...result, fromCache: false };
      this.cacheExpiresAt = new Date(Date.now() + this.config.cacheTtl * 1000);
    }

    return result;
  }

  /**
   * Validate the store configuration
   */
  public async validate(): Promise<ICredentialValidationResult> {
    try {
      const configValidation = this.validateConfig();
      if (!configValidation.valid) {
        return configValidation;
      }

      if (!this.initialized) {
        await this.initialize();
      }

      return await this.doValidate();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        valid: false,
        errors: [
          {
            field: 'general',
            message: `Validation failed: ${message}`,
            code: 'VALIDATION_ERROR',
          },
        ],
        warnings: [],
      };
    }
  }

  /**
   * Check if credentials need rotation
   */
  public needsRotation(): boolean {
    if (!this.config.rotation?.enabled) {
      return false;
    }

    if (!this.cache?.credential) {
      return false;
    }

    return this.cache.credential.isExpired();
  }

  /**
   * Clean up resources
   */
  public async dispose(): Promise<void> {
    log.debug(`Disposing credential store: ${this.storeId}`);

    this.cache = undefined;
    this.cacheExpiresAt = undefined;
    this.initialized = false;

    await this.doDispose();
  }

  /**
   * Check if cache is valid
   */
  protected isCacheValid(): boolean {
    if (!this.cache) {
      return false;
    }

    if (this.cacheExpiresAt && new Date() > this.cacheExpiresAt) {
      log.debug(`Cache expired for store: ${this.storeId}`);
      this.cache = undefined;
      this.cacheExpiresAt = undefined;
      return false;
    }

    if (this.cache.credential.isExpired()) {
      log.debug(`Cached credential expired for store: ${this.storeId}`);
      this.cache = undefined;
      this.cacheExpiresAt = undefined;
      return false;
    }

    return true;
  }

  /**
   * Validate the basic configuration structure
   */
  protected validateConfig(): ICredentialValidationResult {
    const errors: Array<{ field: string; message: string; code: string }> = [];
    const warnings: Array<{ field: string; message: string; code: string }> = [];

    if (!this.config.type) {
      errors.push({
        field: 'type',
        message: 'Credential type is required',
        code: 'MISSING_TYPE',
      });
    }

    if (!this.config.source) {
      errors.push({
        field: 'source',
        message: 'Credential source is required',
        code: 'MISSING_SOURCE',
      });
    }

    if (!this.config.config || typeof this.config.config !== 'object') {
      errors.push({
        field: 'config',
        message: 'Credential config object is required',
        code: 'MISSING_CONFIG',
      });
    }

    if (this.config.cacheTtl && this.config.cacheTtl < 0) {
      warnings.push({
        field: 'cacheTtl',
        message: 'Cache TTL should be positive',
        code: 'INVALID_CACHE_TTL',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Resolve environment variable with error handling
   */
  protected resolveEnvVar(varName: string, required = true): string | undefined {
    const value = process.env[varName];
    const isTestEnvironment = process.env.NODE_ENV === 'test' || process.env.CI === 'true';

    if (!value && required) {
      const errorMessage = `Required environment variable not found: ${varName}`;
      if (isTestEnvironment) {
        log.debug(`${errorMessage} (in test environment - this may be expected)`);
      }
      throw new Error(errorMessage);
    }

    if (!value) {
      return undefined;
    }

    // Check for placeholder values
    if (value.startsWith('${') && value.endsWith('}')) {
      const errorMessage = `Environment variable ${varName} contains unresolved placeholder: ${value}`;
      if (isTestEnvironment) {
        log.debug(`${errorMessage} (in test environment)`);
      }
      throw new Error(errorMessage);
    }

    // Check for empty values
    if (value.trim().length === 0) {
      const errorMessage = `Environment variable ${varName} is empty`;
      if (isTestEnvironment) {
        log.debug(`${errorMessage} (in test environment)`);
      }
      if (required) {
        throw new Error(errorMessage);
      }
      return undefined;
    }

    return value;
  }

  /**
   * Generate a unique request ID for credentials
   */
  protected generateCredentialId(): string {
    return `cred_${this.storeId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  // Abstract methods to be implemented by specific store types
  protected abstract doInitialize(): Promise<void>;
  protected abstract doResolve(): Promise<ICredentialResolutionResult>;
  protected abstract doValidate(): Promise<ICredentialValidationResult>;
  protected abstract doDispose(): Promise<void>;
}
