// Credential configuration types for public API

/**
 * Configuration for a credential store
 */
export interface ICredentialStoreConfig {
  id?: number; // Optional numeric ID for array-based configuration
  name?: string; // Optional name for identification
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
