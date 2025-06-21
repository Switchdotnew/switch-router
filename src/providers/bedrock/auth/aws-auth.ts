// Enhanced AWS authentication for Bedrock
// Provides comprehensive AWS SDK v3 integration and authentication methods

import type { IAWSCredential } from '../../../credentials/types/credential-types.js';

/**
 * AWS authentication configuration options
 */
export interface IAWSAuthConfig {
  region: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
  profile?: string;
  roleArn?: string;
  roleSessionName?: string;
  webIdentityTokenFile?: string;
  useInstanceProfile?: boolean;
  endpoint?: string;
  maxRetries?: number;
  retryMode?: 'legacy' | 'standard' | 'adaptive';
}

/**
 * AWS regions configuration
 */
export class AWSRegions {
  private static readonly US_REGIONS = [
    'us-east-1', // US East (N. Virginia)
    'us-east-2', // US East (Ohio)
    'us-west-1', // US West (N. California)
    'us-west-2', // US West (Oregon)
    'us-gov-east-1', // AWS GovCloud (US-East)
    'us-gov-west-1', // AWS GovCloud (US-West)
  ];

  private static readonly EU_REGIONS = [
    'eu-west-1', // Europe (Ireland)
    'eu-west-2', // Europe (London)
    'eu-west-3', // Europe (Paris)
    'eu-central-1', // Europe (Frankfurt)
    'eu-central-2', // Europe (Zurich)
    'eu-south-1', // Europe (Milan)
    'eu-south-2', // Europe (Spain)
    'eu-north-1', // Europe (Stockholm)
  ];

  private static readonly AP_REGIONS = [
    'ap-northeast-1', // Asia Pacific (Tokyo)
    'ap-northeast-2', // Asia Pacific (Seoul)
    'ap-northeast-3', // Asia Pacific (Osaka)
    'ap-south-1', // Asia Pacific (Mumbai)
    'ap-south-2', // Asia Pacific (Hyderabad)
    'ap-southeast-1', // Asia Pacific (Singapore)
    'ap-southeast-2', // Asia Pacific (Sydney)
  ];

  private static readonly OTHER_REGIONS = [
    'ca-central-1', // Canada (Central)
    'sa-east-1', // South America (São Paulo)
  ];

  public static getAllRegions(): string[] {
    return [...this.US_REGIONS, ...this.EU_REGIONS, ...this.AP_REGIONS, ...this.OTHER_REGIONS];
  }

  public static isValidRegion(region: string): boolean {
    return this.getAllRegions().includes(region);
  }

  public static getBedrockSupportedRegions(): string[] {
    // Based on AWS Bedrock availability
    return [
      'us-east-1',
      'us-west-2',
      'eu-west-1',
      'eu-central-1',
      'ap-southeast-1',
      'ap-northeast-1',
    ];
  }

  public static isBedrockSupported(region: string): boolean {
    return this.getBedrockSupportedRegions().includes(region);
  }
}

/**
 * AWS authentication method detector
 */
export class AWSAuthMethod {
  /**
   * Determine the authentication method from credential configuration
   */
  public static detectMethod(
    credential: IAWSCredential
  ): 'keys' | 'instance-profile' | 'web-identity' | 'unknown' {
    const metadata = credential.metadata;

    if (metadata?.useInstanceProfile) {
      return 'instance-profile';
    }

    if (metadata?.useWebIdentity) {
      return 'web-identity';
    }

    if (credential.accessKeyId && credential.secretAccessKey) {
      return 'keys';
    }

    return 'unknown';
  }

  /**
   * Validate authentication method compatibility with Bedrock
   */
  public static validateForBedrock(credential: IAWSCredential): { valid: boolean; error?: string } {
    const method = this.detectMethod(credential);

    switch (method) {
      case 'keys':
        if (!credential.accessKeyId || !credential.secretAccessKey) {
          return { valid: false, error: 'Access key ID and secret access key are required' };
        }
        break;

      case 'instance-profile':
        // Instance profile is valid for Bedrock
        break;

      case 'web-identity':
        // Web identity is valid for Bedrock
        break;

      case 'unknown':
        return { valid: false, error: 'Unknown authentication method' };
    }

    // Validate region
    if (!AWSRegions.isValidRegion(credential.region)) {
      return { valid: false, error: `Invalid AWS region: ${credential.region}` };
    }

    if (!AWSRegions.isBedrockSupported(credential.region)) {
      return {
        valid: false,
        error: `Bedrock is not supported in region: ${credential.region}. Supported regions: ${AWSRegions.getBedrockSupportedRegions().join(', ')}`,
      };
    }

    return { valid: true };
  }
}

/**
 * AWS service endpoint builder
 */
export class AWSEndpoint {
  /**
   * Build Bedrock runtime endpoint URL
   */
  public static buildBedrockEndpoint(region: string, modelId: string): string {
    return `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/invoke`;
  }

  /**
   * Build Bedrock runtime streaming endpoint URL
   */
  public static buildBedrockStreamingEndpoint(region: string, modelId: string): string {
    return `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/invoke-with-response-stream`;
  }

  /**
   * Build Bedrock converse endpoint URL
   */
  public static buildConverseEndpoint(region: string): string {
    return `https://bedrock-runtime.${region}.amazonaws.com/converse`;
  }

  /**
   * Build Bedrock converse streaming endpoint URL
   */
  public static buildConverseStreamingEndpoint(region: string): string {
    return `https://bedrock-runtime.${region}.amazonaws.com/converse-stream`;
  }

  /**
   * Build Bedrock embedding endpoint URL
   */
  public static buildEmbeddingEndpoint(region: string, modelId: string): string {
    return `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/invoke`;
  }

  /**
   * Build Bedrock image generation endpoint URL
   */
  public static buildImageGenerationEndpoint(region: string, modelId: string): string {
    return `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/invoke`;
  }
}

/**
 * AWS error code mapping for Bedrock
 */
export class AWSErrorMapping {
  private static readonly ERROR_MAP: Record<
    string,
    { code: string; retryable: boolean; isRateLimit: boolean }
  > = {
    // Authentication errors
    UnauthorizedOperation: { code: 'AUTHENTICATION_ERROR', retryable: false, isRateLimit: false },
    InvalidSignatureException: {
      code: 'AUTHENTICATION_ERROR',
      retryable: false,
      isRateLimit: false,
    },
    TokenRefreshRequired: { code: 'AUTHENTICATION_ERROR', retryable: false, isRateLimit: false },
    ExpiredTokenException: { code: 'AUTHENTICATION_ERROR', retryable: false, isRateLimit: false },
    AccessDeniedException: { code: 'PERMISSION_DENIED', retryable: false, isRateLimit: false },

    // Rate limiting
    ThrottlingException: { code: 'RATE_LIMIT_EXCEEDED', retryable: true, isRateLimit: true },
    TooManyRequestsException: { code: 'RATE_LIMIT_EXCEEDED', retryable: true, isRateLimit: true },
    ServiceQuotaExceededException: { code: 'QUOTA_EXCEEDED', retryable: false, isRateLimit: true },

    // Model errors
    ModelNotReadyException: { code: 'MODEL_NOT_READY', retryable: true, isRateLimit: false },
    ModelStreamErrorException: { code: 'STREAM_ERROR', retryable: false, isRateLimit: false },
    ModelTimeoutException: { code: 'MODEL_TIMEOUT', retryable: true, isRateLimit: false },

    // Validation errors
    ValidationException: { code: 'INVALID_REQUEST', retryable: false, isRateLimit: false },
    ModelNotSupportedException: {
      code: 'MODEL_NOT_SUPPORTED',
      retryable: false,
      isRateLimit: false,
    },
    ResourceNotFoundException: { code: 'RESOURCE_NOT_FOUND', retryable: false, isRateLimit: false },

    // Service errors
    InternalServerException: { code: 'INTERNAL_ERROR', retryable: true, isRateLimit: false },
    ServiceUnavailableException: {
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
      isRateLimit: false,
    },
  };

  /**
   * Map AWS error to standardised error information
   */
  public static mapError(awsErrorCode: string): {
    code: string;
    retryable: boolean;
    isRateLimit: boolean;
  } {
    return (
      this.ERROR_MAP[awsErrorCode] || {
        code: 'UNKNOWN_ERROR',
        retryable: false,
        isRateLimit: false,
      }
    );
  }

  /**
   * Check if an error is retryable
   */
  public static isRetryable(awsErrorCode: string): boolean {
    return this.mapError(awsErrorCode).retryable;
  }

  /**
   * Check if an error is a rate limit
   */
  public static isRateLimit(awsErrorCode: string): boolean {
    return this.mapError(awsErrorCode).isRateLimit;
  }

  /**
   * Get retry delay for rate limit errors (exponential backoff)
   */
  public static getRetryDelay(attempt: number, baseDelay: number = 1000): number {
    return Math.min(baseDelay * Math.pow(2, attempt), 30000); // Max 30 seconds
  }
}

/**
 * AWS request signing utilities
 */
export class AWSRequestSigner {
  /**
   * Get common headers for AWS requests
   */
  public static getCommonHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'switch-bedrock-client/1.0',
    };
  }

  /**
   * Get streaming headers for AWS requests
   */
  public static getStreamingHeaders(): Record<string, string> {
    return {
      ...this.getCommonHeaders(),
      Accept: 'text/event-stream',
    };
  }

  /**
   * Prepare headers for AWS request (placeholder for AWS SDK integration)
   */
  public static prepareHeaders(
    credential: IAWSCredential,
    endpoint: string,
    body: string,
    streaming: boolean = false
  ): Record<string, string> {
    const headers = streaming ? this.getStreamingHeaders() : this.getCommonHeaders();

    // Add AWS-specific headers
    const now = new Date();
    const dateStamp = now.toISOString().substring(0, 10).replace(/-/g, '');
    const timeStamp = now.toISOString().replace(/[:.-]/g, '').substring(0, 15);

    headers['X-Amz-Date'] = timeStamp;
    headers['X-Amz-Content-Sha256'] = 'UNSIGNED-PAYLOAD'; // Simplified for now

    // TODO: Implement proper AWS Signature V4 signing
    // This should be replaced with actual AWS SDK v3 integration
    if (credential.accessKeyId && credential.secretAccessKey) {
      headers['Authorization'] =
        `AWS4-HMAC-SHA256 Credential=${credential.accessKeyId}/${dateStamp}/${credential.region}/bedrock/aws4_request, SignedHeaders=host;x-amz-date, Signature=placeholder`;
    }

    return headers;
  }
}

/**
 * Configuration builder for AWS clients
 */
export class AWSConfigBuilder {
  /**
   * Build configuration for AWS SDK clients
   */
  public static buildConfig(credential: IAWSCredential): IAWSAuthConfig {
    const config: IAWSAuthConfig = {
      region: credential.region,
      maxRetries: 3,
      retryMode: 'adaptive',
    };

    const authMethod = AWSAuthMethod.detectMethod(credential);

    switch (authMethod) {
      case 'keys':
        config.credentials = {
          accessKeyId: credential.accessKeyId,
          secretAccessKey: credential.secretAccessKey,
          sessionToken: credential.sessionToken,
        };
        break;

      case 'instance-profile':
        // AWS SDK will automatically use instance profile
        config.useInstanceProfile = true;
        break;

      case 'web-identity':
        // AWS SDK will automatically use web identity
        config.webIdentityTokenFile = process.env.AWS_WEB_IDENTITY_TOKEN_FILE;
        config.roleArn = process.env.AWS_ROLE_ARN;
        config.roleSessionName = process.env.AWS_ROLE_SESSION_NAME || 'switch-session';
        break;
    }

    if (credential.profile) {
      config.profile = credential.profile;
    }

    return config;
  }

  /**
   * Validate AWS configuration
   */
  public static validateConfig(config: IAWSAuthConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.region) {
      errors.push('Region is required');
    } else if (!AWSRegions.isValidRegion(config.region)) {
      errors.push(`Invalid region: ${config.region}`);
    } else if (!AWSRegions.isBedrockSupported(config.region)) {
      errors.push(`Bedrock not supported in region: ${config.region}`);
    }

    if (config.credentials) {
      if (!config.credentials.accessKeyId) {
        errors.push('Access key ID is required when using credentials');
      }
      if (!config.credentials.secretAccessKey) {
        errors.push('Secret access key is required when using credentials');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Re-export interface
// Interface is already exported above
