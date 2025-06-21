// AWS credential store implementation

import log from '../../utils/logging.js';
import { BaseCredentialStore } from './base-credential-store.js';
import type {
  ICredentialResolutionResult,
  ICredentialValidationResult,
} from '../interfaces/credential-store-interface.js';
import type { IAWSCredential, IAWSCredentialConfig } from '../types/credential-types.js';

/**
 * AWS credential implementation
 */
class AWSCredential implements IAWSCredential {
  public readonly type = 'aws';
  public readonly storeId: string;
  public readonly accessKeyId: string;
  public readonly secretAccessKey: string;
  public readonly sessionToken?: string;
  public readonly region: string;
  public readonly profile?: string;
  public readonly metadata?: Record<string, unknown>;

  constructor(
    storeId: string,
    accessKeyId: string,
    secretAccessKey: string,
    region: string,
    sessionToken?: string,
    profile?: string,
    metadata?: Record<string, unknown>
  ) {
    this.storeId = storeId;
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.region = region;
    this.sessionToken = sessionToken;
    this.profile = profile;
    this.metadata = metadata;
  }

  public async validate(): Promise<boolean> {
    // Validate required fields
    if (!this.accessKeyId || !this.secretAccessKey || !this.region) {
      return false;
    }

    // Check for placeholder values
    const fields = [this.accessKeyId, this.secretAccessKey, this.region];
    if (this.sessionToken) fields.push(this.sessionToken);

    for (const field of fields) {
      if (field.startsWith('${') && field.endsWith('}')) {
        return false;
      }
    }

    // Basic format validation
    if (this.accessKeyId.length < 16 || this.accessKeyId.length > 32) {
      return false;
    }

    if (this.secretAccessKey.length < 32) {
      return false;
    }

    // AWS region format validation
    const regionPattern = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
    if (!regionPattern.test(this.region)) {
      return false;
    }

    return true;
  }

  public isExpired(): boolean {
    // AWS credentials with session tokens can expire
    // For now, we'll assume non-session credentials don't expire
    // This could be enhanced to check actual expiration if available
    return false;
  }

  public getAuthHeaders(): Record<string, string> {
    // AWS uses AWS Signature V4 for authentication
    // This will be handled by the AWS SDK, so we return empty headers
    // The actual signing will be done in the provider adapter
    return {};
  }

  public getProviderConfig(): Record<string, unknown> {
    const config: Record<string, unknown> = {
      region: this.region,
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
      },
    };

    if (this.sessionToken) {
      (config.credentials as { sessionToken: string }).sessionToken = this.sessionToken;
    }

    return config;
  }
}

/**
 * Credential store for AWS credentials
 */
export class AWSCredentialStore extends BaseCredentialStore {
  private accessKeyId?: string;
  private secretAccessKey?: string;
  private sessionToken?: string;
  private region?: string;
  private profile?: string;

  protected async doInitialize(): Promise<void> {
    const config = this.config.config as IAWSCredentialConfig;

    // Resolve region
    if (config.region) {
      this.region = config.region;
    } else if (config.regionVar) {
      this.region = this.resolveEnvVar(config.regionVar, true);
    } else {
      // Default to us-east-1 if not specified
      this.region = 'us-east-1';
      log.warn(
        `No region specified for AWS credential store ${this.storeId}, defaulting to us-east-1`
      );
    }

    // Check for instance profile or web identity usage
    if (config.useInstanceProfile) {
      log.info(`AWS credential store ${this.storeId} configured to use EC2 instance profile`);
      return; // Instance profile will be handled by AWS SDK
    }

    if (config.useWebIdentity) {
      log.info(`AWS credential store ${this.storeId} configured to use web identity`);
      return; // Web identity will be handled by AWS SDK
    }

    // Resolve access key ID
    if (config.accessKeyId) {
      this.accessKeyId = config.accessKeyId;
      log.warn(
        `Direct access key ID provided for store ${this.storeId}. Consider using environment variables.`
      );
    } else if (config.accessKeyIdVar) {
      this.accessKeyId = this.resolveEnvVar(config.accessKeyIdVar, true);
    } else {
      throw new Error(
        `AWS credential store ${this.storeId} must specify accessKeyId, accessKeyIdVar, or use instance profile/web identity`
      );
    }

    // Resolve secret access key
    if (config.secretAccessKey) {
      this.secretAccessKey = config.secretAccessKey;
      log.warn(
        `Direct secret access key provided for store ${this.storeId}. Consider using environment variables.`
      );
    } else if (config.secretAccessKeyVar) {
      this.secretAccessKey = this.resolveEnvVar(config.secretAccessKeyVar, true);
    } else {
      throw new Error(
        `AWS credential store ${this.storeId} must specify secretAccessKey or secretAccessKeyVar`
      );
    }

    // Resolve optional session token
    if (config.sessionToken) {
      this.sessionToken = config.sessionToken;
    } else if (config.sessionTokenVar) {
      this.sessionToken = this.resolveEnvVar(config.sessionTokenVar, false);
    }

    // Resolve optional profile
    if (config.profile) {
      this.profile = config.profile;
    } else if (config.profileVar) {
      this.profile = this.resolveEnvVar(config.profileVar, false);
    }
  }

  protected async doResolve(): Promise<ICredentialResolutionResult> {
    if (!this.region) {
      throw new Error(`Region not initialized for AWS store: ${this.storeId}`);
    }

    // Handle instance profile case
    const config = this.config.config as IAWSCredentialConfig;
    if (config.useInstanceProfile || config.useWebIdentity) {
      const credential = new AWSCredential(
        this.storeId,
        '', // Will be resolved by AWS SDK
        '', // Will be resolved by AWS SDK
        this.region,
        undefined,
        this.profile,
        {
          source: this.config.source,
          useInstanceProfile: config.useInstanceProfile,
          useWebIdentity: config.useWebIdentity,
          resolvedAt: new Date().toISOString(),
        }
      );

      return {
        credential,
        fromCache: false,
        metadata: {
          storeId: this.storeId,
          region: this.region,
          authMethod: config.useInstanceProfile ? 'instance-profile' : 'web-identity',
        },
      };
    }

    if (!this.accessKeyId || !this.secretAccessKey) {
      throw new Error(`AWS credentials not initialized for store: ${this.storeId}`);
    }

    const credential = new AWSCredential(
      this.storeId,
      this.accessKeyId,
      this.secretAccessKey,
      this.region,
      this.sessionToken,
      this.profile,
      {
        source: this.config.source,
        resolvedAt: new Date().toISOString(),
      }
    );

    return {
      credential,
      fromCache: false,
      metadata: {
        storeId: this.storeId,
        region: this.region,
        hasSessionToken: !!this.sessionToken,
        profile: this.profile,
        accessKeyPrefix: this.accessKeyId.substring(0, 4) + '...',
      },
    };
  }

  protected async doValidate(): Promise<ICredentialValidationResult> {
    const errors: Array<{ field: string; message: string; code: string }> = [];
    const warnings: Array<{ field: string; message: string; code: string }> = [];

    const config = this.config.config as IAWSCredentialConfig;

    // Validate region
    if (!config.region && !config.regionVar && !this.region) {
      warnings.push({
        field: 'region',
        message: 'No region specified, will default to us-east-1',
        code: 'MISSING_REGION',
      });
    }

    // Validate authentication method
    const hasDirectKeys = config.accessKeyId || config.accessKeyIdVar;
    const hasInstanceProfile = config.useInstanceProfile;
    const hasWebIdentity = config.useWebIdentity;

    if (!hasDirectKeys && !hasInstanceProfile && !hasWebIdentity) {
      errors.push({
        field: 'config',
        message: 'Must specify either access keys, instance profile, or web identity',
        code: 'MISSING_AUTH_METHOD',
      });
    }

    if (hasDirectKeys && (hasInstanceProfile || hasWebIdentity)) {
      warnings.push({
        field: 'config',
        message:
          'Multiple authentication methods specified. Instance profile/web identity will take precedence.',
        code: 'REDUNDANT_AUTH_CONFIG',
      });
    }

    // Validate direct keys configuration
    if (hasDirectKeys) {
      if (!config.accessKeyId && !config.accessKeyIdVar) {
        errors.push({
          field: 'accessKeyId',
          message: 'Either accessKeyId or accessKeyIdVar must be specified',
          code: 'MISSING_ACCESS_KEY_ID',
        });
      }

      if (!config.secretAccessKey && !config.secretAccessKeyVar) {
        errors.push({
          field: 'secretAccessKey',
          message: 'Either secretAccessKey or secretAccessKeyVar must be specified',
          code: 'MISSING_SECRET_ACCESS_KEY',
        });
      }

      if (config.accessKeyId || config.secretAccessKey) {
        warnings.push({
          field: 'credentials',
          message: 'Direct AWS credentials in config are not recommended for production',
          code: 'INSECURE_CONFIG',
        });
      }
    }

    // Validate the actual credentials if available
    if (this.accessKeyId && this.secretAccessKey && this.region) {
      const credential = new AWSCredential(
        this.storeId,
        this.accessKeyId,
        this.secretAccessKey,
        this.region,
        this.sessionToken
      );

      const isValid = await credential.validate();
      if (!isValid) {
        errors.push({
          field: 'credentials',
          message: 'AWS credential validation failed',
          code: 'INVALID_CREDENTIALS',
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
    this.accessKeyId = undefined;
    this.secretAccessKey = undefined;
    this.sessionToken = undefined;
  }
}
