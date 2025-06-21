// Credential type definitions for all supported providers

/**
 * Base credential interface that all credential types must implement
 */
export interface ICredential {
  readonly type: string;
  readonly storeId: string;
  readonly metadata?: Record<string, unknown>;

  /**
   * Validate that the credential is complete and functional
   */
  validate(): Promise<boolean>;

  /**
   * Check if the credential has expired
   */
  isExpired(): boolean;

  /**
   * Get authentication headers for HTTP requests
   */
  getAuthHeaders(): Record<string, string>;

  /**
   * Get any additional configuration needed for the provider
   */
  getProviderConfig?(): Record<string, unknown>;
}

/**
 * Configuration for a credential store
 */
export interface ICredentialStoreConfig {
  type: 'simple' | 'aws' | 'google' | 'azure' | 'oauth';
  source: 'env' | 'file' | 'vault' | 'aws-secrets' | 'inline';
  config: Record<string, unknown>;
  cacheTtl?: number;
  rotation?: {
    enabled: boolean;
    intervalHours: number;
    beforeExpiryHours: number;
  };
}

/**
 * Simple API key credential (OpenAI, Anthropic, etc.)
 */
export interface ISimpleCredential extends ICredential {
  readonly type: 'simple';
  readonly apiKey: string;
}

export interface ISimpleCredentialConfig {
  apiKeyVar?: string;
  apiKey?: string; // Direct value (not recommended for production)
}

/**
 * AWS credentials (Bedrock, SageMaker, etc.)
 */
export interface IAWSCredential extends ICredential {
  readonly type: 'aws';
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
  readonly region: string;
  readonly profile?: string;
}

export interface IAWSCredentialConfig {
  region?: string;
  regionVar?: string;
  accessKeyId?: string;
  accessKeyIdVar?: string;
  secretAccessKey?: string;
  secretAccessKeyVar?: string;
  sessionToken?: string;
  sessionTokenVar?: string;
  profile?: string;
  profileVar?: string;
  useInstanceProfile?: boolean;
  useWebIdentity?: boolean;
}

/**
 * Google Cloud credentials (Vertex AI, AI Platform, etc.)
 */
export interface IGoogleCredential extends ICredential {
  readonly type: 'google';
  readonly projectId: string;
  readonly region?: string;
  readonly serviceAccountKey?: string;
  readonly useADC: boolean; // Application Default Credentials
}

export interface IGoogleCredentialConfig {
  projectId?: string;
  projectIdVar?: string;
  region?: string;
  regionVar?: string;
  serviceAccountKey?: string;
  serviceAccountKeyVar?: string;
  serviceAccountKeyFile?: string;
  useADC?: boolean; // Use Application Default Credentials
}

/**
 * Azure credentials (Azure OpenAI, etc.)
 */
export interface IAzureCredential extends ICredential {
  readonly type: 'azure';
  readonly subscriptionId: string;
  readonly resourceGroup: string;
  readonly tenantId?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly endpoint: string;
}

export interface IAzureCredentialConfig {
  subscriptionId?: string;
  subscriptionIdVar?: string;
  resourceGroup?: string;
  resourceGroupVar?: string;
  tenantId?: string;
  tenantIdVar?: string;
  clientId?: string;
  clientIdVar?: string;
  clientSecret?: string;
  clientSecretVar?: string;
  endpoint?: string;
  endpointVar?: string;
  useManagedIdentity?: boolean;
}

/**
 * OAuth credentials (for OAuth-based providers)
 */
export interface IOAuthCredential extends ICredential {
  readonly type: 'oauth';
  readonly clientId: string;
  readonly clientSecret: string;
  readonly accessToken?: string;
  readonly refreshToken?: string;
  readonly tokenEndpoint: string;
  readonly expiresAt?: Date;
}

export interface IOAuthCredentialConfig {
  clientId?: string;
  clientIdVar?: string;
  clientSecret?: string;
  clientSecretVar?: string;
  tokenEndpoint: string;
  refreshToken?: string;
  refreshTokenVar?: string;
  scope?: string[];
}

/**
 * Union type for all credential configurations
 */
export type CredentialConfig =
  | ISimpleCredentialConfig
  | IAWSCredentialConfig
  | IGoogleCredentialConfig
  | IAzureCredentialConfig
  | IOAuthCredentialConfig;

/**
 * Union type for all credential types
 */
export type Credential =
  | ISimpleCredential
  | IAWSCredential
  | IGoogleCredential
  | IAzureCredential
  | IOAuthCredential;

/**
 * Credential store registry entry
 */
export interface ICredentialStoreEntry {
  id: string;
  config: ICredentialStoreConfig;
  lastAccessed?: Date;
  lastRotated?: Date;
  status: 'active' | 'expired' | 'error' | 'rotating';
  errorMessage?: string;
}

/**
 * Credential resolution result
 */
export interface ICredentialResolutionResult {
  credential: Credential;
  fromCache: boolean;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Credential validation error
 */
export interface ICredentialValidationError {
  field: string;
  message: string;
  code: string;
}

/**
 * Credential validation result
 */
export interface ICredentialValidationResult {
  valid: boolean;
  errors: ICredentialValidationError[];
  warnings: ICredentialValidationError[];
}
