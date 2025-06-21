// Credential store interface definitions

import type {
  ICredentialStoreConfig,
  ICredentialResolutionResult,
  ICredentialValidationResult,
} from '../types/credential-types.js';

// Re-export these types for use in credential stores
export type {
  ICredentialResolutionResult,
  ICredentialValidationResult,
} from '../types/credential-types.js';

/**
 * Base interface for all credential stores
 */
export interface ICredentialStore {
  readonly type: string;
  readonly storeId: string;

  /**
   * Initialize the credential store
   */
  initialize(): Promise<void>;

  /**
   * Resolve credentials from the store
   */
  resolve(): Promise<ICredentialResolutionResult>;

  /**
   * Validate the store configuration
   */
  validate(): Promise<ICredentialValidationResult>;

  /**
   * Check if credentials need rotation
   */
  needsRotation(): boolean;

  /**
   * Rotate credentials if supported
   */
  rotate?(): Promise<void>;

  /**
   * Clean up resources
   */
  dispose(): Promise<void>;
}

/**
 * Store entry with metadata
 */
export interface ICredentialStoreEntry {
  id: string;
  config: ICredentialStoreConfig;
  status: 'active' | 'expired' | 'error' | 'rotating';
  lastAccessed?: Date;
}

/**
 * Registry interface for managing credential stores
 */
export interface ICredentialStoreRegistry {
  /**
   * Register a credential store
   */
  register(storeId: string, config: ICredentialStoreConfig): Promise<void>;

  /**
   * Get a credential store by ID (supports both string names and numeric IDs)
   */
  getStore(storeId: string | number): Promise<ICredentialStore>;

  /**
   * Check if a store exists (supports both string names and numeric IDs)
   */
  hasStore(storeId: string | number): boolean;

  /**
   * Remove a credential store
   */
  unregister(storeId: string): Promise<void>;

  /**
   * List all registered store IDs
   */
  listStores(): string[];

  /**
   * Get all store entries with metadata
   */
  getStoreEntries(): ICredentialStoreEntry[];

  /**
   * Get specific store entry
   */
  getStoreEntry(storeId: string): ICredentialStoreEntry | undefined;

  /**
   * Validate all registered stores
   */
  validateAll(): Promise<Map<string, ICredentialValidationResult>>;

  /**
   * Dispose of all stores
   */
  dispose(): Promise<void>;
}

/**
 * Factory interface for creating credential stores
 */
export interface ICredentialStoreFactory {
  /**
   * Create a credential store of the specified type
   */
  createStore(storeId: string, config: ICredentialStoreConfig): Promise<ICredentialStore>;

  /**
   * Get supported store types
   */
  getSupportedTypes(): string[];

  /**
   * Validate store configuration before creation
   */
  validateConfig(config: ICredentialStoreConfig): ICredentialValidationResult;
}
