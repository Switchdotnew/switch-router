// Provider factory with credential resolution

import log from '../utils/logging.js';
import { OpenAIAdapter } from './openai/adapter.js';
import { AnthropicAdapter } from './anthropic/adapter.js';
import { BedrockAdapter } from './bedrock/adapter.js';
import type { CredentialManager } from '../credentials/managers/credential-manager.js';
import type { Domains } from '../types/index.js';
import type { Credential } from '../credentials/types/credential-types.js';

/**
 * Factory for creating provider adapters with credential resolution
 */
export class ProviderFactory {
  private credentialManager?: CredentialManager;

  constructor(credentialManager?: CredentialManager) {
    this.credentialManager = credentialManager;
  }

  /**
   * Create a provider adapter with credential resolution
   */
  public async createProvider(
    config: Domains.IProviderEndpoint
  ): Promise<Domains.IBaseProvider> {
    // Resolve credentials if credentialsRef is provided
    let credential: Credential | undefined;

    if (config.credentialsRef !== undefined) {
      if (!this.credentialManager) {
        throw new Error(
          `Credential reference '${config.credentialsRef}' provided for provider ${config.name} but no credential manager available. ` +
            `Possible solutions:\n` +
            `1. Ensure credential stores are configured in definitions.json or MODEL_DEFINITIONS\n` +
            `2. Set test environment variables (e.g., TEST_OPENAI_API_KEY, TEST_ANTHROPIC_API_KEY)\n` +
            `3. Use direct apiKey instead of credentialsRef for testing`
        );
      }

      try {
        credential = await this.credentialManager.resolveCredentials(config.credentialsRef);
        log.debug(`Resolved credentials for provider ${config.name}`, {
          credentialsRef: config.credentialsRef,
          credentialType: credential.type,
          referenceType: typeof config.credentialsRef,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        log.error(`Failed to resolve credentials for provider ${config.name}: ${message}`, {
          credentialsRef: config.credentialsRef,
          referenceType: typeof config.credentialsRef,
          availableStores: this.credentialManager?.getCredentialStoreIds() || [],
        });

        // Provide helpful error message with available stores
        const availableStores = this.credentialManager?.getCredentialStoreIds() || [];
        const storeList =
          availableStores.length > 0
            ? `Available stores: ${availableStores.join(', ')}`
            : 'No credential stores are currently registered';

        throw new Error(
          `Credential resolution failed for provider ${config.name} with reference '${config.credentialsRef}' (${typeof config.credentialsRef}): ${message}. ` +
            `${storeList}. Check that the credential store exists and environment variables are properly set.`
        );
      }
    } else if (!config.apiKey) {
      throw new Error(
        `Provider ${config.name} must specify either credentialsRef or apiKey. ` +
          `For testing, you can use direct apiKey values, or set up credential stores with test environment variables.`
      );
    }

    // Validate credential type matches provider requirements
    if (credential) {
      this.validateCredentialForProvider(config.provider, credential);
    }

    // Convert config to legacy ProviderConfig format for adapter compatibility
    const providerConfig = {
      name: config.name,
      apiKey: config.apiKey || '', // Will be overridden by credential if provided
      apiBase: config.apiBase,
      modelName: config.modelName,
      timeout: config.timeout ?? 30000, // Default 30 seconds
      maxRetries: config.maxRetries ?? 3, // Default 3 retries
      retryDelay: config.retryDelay ?? 1000, // Default 1 second
      headers: config.headers,
      rateLimits: config.rateLimits,
    };

    // Create the appropriate provider adapter
    switch (config.provider) {
      case 'openai':
        return new OpenAIAdapter(providerConfig, credential);

      case 'anthropic':
        return new AnthropicAdapter(providerConfig, credential);

      case 'bedrock':
        return new BedrockAdapter(providerConfig, credential);

      case 'together':
        // Together AI uses OpenAI-compatible API
        return new OpenAIAdapter(providerConfig, credential);

      case 'runpod':
        // RunPod uses OpenAI-compatible API
        return new OpenAIAdapter(providerConfig, credential);

      case 'vertex':
        throw new Error(
          'Vertex AI provider is not yet implemented. Please use a supported provider.'
        );

      case 'azure':
        throw new Error(
          'Azure OpenAI provider is not yet implemented. Please use a supported provider.'
        );

      case 'custom':
        // For custom providers, default to OpenAI-compatible
        return new OpenAIAdapter(providerConfig, credential);

      default:
        throw new Error(`Unsupported provider type: ${config.provider}`);
    }
  }

  /**
   * Validate that the credential type is compatible with the provider
   */
  private validateCredentialForProvider(providerType: string, credential: Credential): void {
    switch (providerType) {
      case 'bedrock':
        if (credential.type !== 'aws') {
          throw new Error(`Bedrock provider requires AWS credentials, got: ${credential.type}`);
        }
        break;

      case 'vertex':
        if (credential.type !== 'google') {
          throw new Error(
            `Vertex AI provider requires Google credentials, got: ${credential.type}`
          );
        }
        break;

      case 'azure':
        if (credential.type !== 'azure') {
          throw new Error(
            `Azure OpenAI provider requires Azure credentials, got: ${credential.type}`
          );
        }
        break;

      case 'openai':
      case 'anthropic':
      case 'together':
      case 'runpod':
      case 'custom':
        if (credential.type !== 'simple') {
          throw new Error(
            `${providerType} provider requires simple API key credentials, got: ${credential.type}`
          );
        }
        break;

      default:
        // For unknown providers, don't validate credential type
        break;
    }
  }

  /**
   * Validate provider configuration
   */
  public async validateProviderConfig(config: Domains.IProviderEndpoint): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate basic configuration
    if (!config.name) {
      errors.push('Provider name is required');
    }

    if (!config.provider) {
      errors.push('Provider type is required');
    }

    if (!config.modelName) {
      errors.push('Model name is required');
    }

    if (!config.apiBase) {
      errors.push('API base URL is required');
    }

    // Validate credential configuration
    if (config.credentialsRef && config.apiKey) {
      warnings.push(
        'Both credentialsRef and apiKey specified. credentialsRef will take precedence.'
      );
    }

    if (!config.credentialsRef && !config.apiKey) {
      errors.push('Either credentialsRef or apiKey must be specified');
    }

    // Validate credential reference if provided
    if (config.credentialsRef !== undefined) {
      if (!this.credentialManager) {
        errors.push(
          'Credential reference provided but no credential manager available. ' +
            'Set up credential stores via configuration or use direct apiKey values.'
        );
      } else {
        try {
          const validation = await this.credentialManager.validateCredentialReference(
            config.credentialsRef
          );
          if (!validation.valid) {
            const availableStores = this.credentialManager.getCredentialStoreIds();
            const storeHint =
              availableStores.length > 0
                ? ` Available stores: ${availableStores.join(', ')}`
                : ' No credential stores are registered.';
            errors.push(`Credential validation failed: ${validation.error}.${storeHint}`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Credential validation error: ${message}`);
        }
      }
    }

    // Validate provider-specific requirements
    if (config.provider === 'bedrock') {
      if (config.credentialsRef !== undefined && this.credentialManager) {
        try {
          const credential = await this.credentialManager.resolveCredentials(config.credentialsRef);
          if (credential.type !== 'aws') {
            errors.push('Bedrock provider requires AWS credentials');
          }
        } catch (_error) {
          // Error already handled above
        }
      }
    }

    // Validate timeout values
    if (config.timeout && config.timeout <= 0) {
      errors.push('Timeout must be positive');
    }

    if (config.maxRetries && config.maxRetries < 0) {
      errors.push('Max retries must be non-negative');
    }

    if (config.retryDelay && config.retryDelay < 0) {
      errors.push('Retry delay must be non-negative');
    }

    // Validate priority and weight
    if (config.priority && config.priority <= 0) {
      warnings.push('Priority should be positive');
    }

    if (config.weight && config.weight <= 0) {
      warnings.push('Weight should be positive');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * List supported provider types
   */
  public getSupportedProviders(): string[] {
    return [
      'openai',
      'anthropic',
      'bedrock',
      'together',
      'runpod',
      'vertex', // Not yet implemented
      'azure', // Not yet implemented
      'custom',
    ];
  }

  /**
   * Get provider capabilities
   */
  public getProviderCapabilities(providerType: string): {
    chat: boolean;
    completion: boolean;
    streaming: boolean;
    functionCalling: boolean;
    vision: boolean;
    embeddings: boolean;
  } {
    switch (providerType) {
      case 'openai':
        return {
          chat: true,
          completion: true,
          streaming: true,
          functionCalling: true,
          vision: true,
          embeddings: true,
        };

      case 'anthropic':
        return {
          chat: true,
          completion: false,
          streaming: true,
          functionCalling: true,
          vision: true,
          embeddings: false,
        };

      case 'bedrock':
        return {
          chat: true,
          completion: false,
          streaming: true,
          functionCalling: true, // Depends on model
          vision: true, // Depends on model
          embeddings: false, // Separate models
        };

      case 'together':
      case 'runpod':
        return {
          chat: true,
          completion: true,
          streaming: true,
          functionCalling: false, // Depends on model
          vision: false, // Depends on model
          embeddings: false,
        };

      default:
        return {
          chat: true,
          completion: true,
          streaming: false,
          functionCalling: false,
          vision: false,
          embeddings: false,
        };
    }
  }

  /**
   * Set credential manager (for dependency injection)
   */
  public setCredentialManager(credentialManager: CredentialManager): void {
    this.credentialManager = credentialManager;
  }
}
