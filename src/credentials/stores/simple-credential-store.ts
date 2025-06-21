// Simple API key credential store implementation

import log from '../../utils/logging.js';
import { BaseCredentialStore } from './base-credential-store.js';
import type {
  ICredentialResolutionResult,
  ICredentialValidationResult,
} from '../interfaces/credential-store-interface.js';
import type { ISimpleCredential, ISimpleCredentialConfig } from '../types/credential-types.js';

/**
 * Simple credential implementation for API keys
 */
class SimpleCredential implements ISimpleCredential {
  public readonly type = 'simple';
  public readonly storeId: string;
  public readonly apiKey: string;
  public readonly metadata?: Record<string, unknown>;

  constructor(storeId: string, apiKey: string, metadata?: Record<string, unknown>) {
    this.storeId = storeId;
    this.apiKey = apiKey;
    this.metadata = metadata;
  }

  public async validate(): Promise<boolean> {
    // Basic validation - check if API key exists and has reasonable length
    if (!this.apiKey || this.apiKey.trim().length === 0) {
      return false;
    }

    // Check for placeholder values
    if (this.apiKey.startsWith('${') && this.apiKey.endsWith('}')) {
      return false;
    }

    // API keys should typically be at least 8 characters
    if (this.apiKey.length < 8) {
      return false;
    }

    return true;
  }

  public isExpired(): boolean {
    // Simple API keys don't typically expire
    return false;
  }

  public getAuthHeaders(): Record<string, string> {
    // Most APIs use Authorization: Bearer or x-api-key
    // This is a generic implementation - providers may override
    if (this.apiKey.startsWith('sk-')) {
      // OpenAI-style key
      return {
        Authorization: `Bearer ${this.apiKey}`,
      };
    } else {
      // Generic API key header
      return {
        'x-api-key': this.apiKey,
      };
    }
  }
}

/**
 * Credential store for simple API keys
 */
export class SimpleCredentialStore extends BaseCredentialStore {
  private apiKey?: string;

  protected async doInitialize(): Promise<void> {
    const config = this.config.config as ISimpleCredentialConfig;

    if (config.apiKey) {
      // Direct API key provided (not recommended for production)
      this.apiKey = config.apiKey;
      log.warn(
        `Direct API key provided for store ${this.storeId}. Consider using environment variables.`
      );
    } else if (config.apiKeyVar) {
      // API key from environment variable (recommended)
      this.apiKey = this.resolveEnvVar(config.apiKeyVar, true);
    } else {
      throw new Error(
        `Simple credential store ${this.storeId} must specify either apiKey or apiKeyVar`
      );
    }
  }

  protected async doResolve(): Promise<ICredentialResolutionResult> {
    if (!this.apiKey) {
      throw new Error(`API key not initialized for store: ${this.storeId}`);
    }

    const credential = new SimpleCredential(this.storeId, this.apiKey, {
      source: this.config.source,
      resolvedAt: new Date().toISOString(),
    });

    return {
      credential,
      fromCache: false,
      metadata: {
        storeId: this.storeId,
        keyLength: this.apiKey.length,
        keyPrefix: this.apiKey.substring(0, Math.min(4, this.apiKey.length)) + '...',
      },
    };
  }

  protected async doValidate(): Promise<ICredentialValidationResult> {
    const errors: Array<{ field: string; message: string; code: string }> = [];
    const warnings: Array<{ field: string; message: string; code: string }> = [];

    const config = this.config.config as ISimpleCredentialConfig;

    // Validate configuration
    if (!config.apiKey && !config.apiKeyVar) {
      errors.push({
        field: 'config',
        message: 'Either apiKey or apiKeyVar must be specified',
        code: 'MISSING_API_KEY_CONFIG',
      });
    }

    if (config.apiKey && config.apiKeyVar) {
      warnings.push({
        field: 'config',
        message: 'Both apiKey and apiKeyVar specified. apiKey will take precedence.',
        code: 'REDUNDANT_CONFIG',
      });
    }

    if (config.apiKey) {
      warnings.push({
        field: 'apiKey',
        message: 'Direct API key in config is not recommended for production',
        code: 'INSECURE_CONFIG',
      });
    }

    // Validate the actual credential if available
    if (this.apiKey) {
      const credential = new SimpleCredential(this.storeId, this.apiKey);
      const isValid = await credential.validate();

      if (!isValid) {
        errors.push({
          field: 'apiKey',
          message: 'API key validation failed',
          code: 'INVALID_API_KEY',
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  protected async doDispose(): Promise<void> {
    // Clear sensitive data
    this.apiKey = undefined;
  }
}
