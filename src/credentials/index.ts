// Credential system exports

// Types
export type {
  ICredential,
  ICredentialStoreConfig,
  ISimpleCredential,
  ISimpleCredentialConfig,
  IAWSCredential,
  IAWSCredentialConfig,
  IGoogleCredential,
  IGoogleCredentialConfig,
  IAzureCredential,
  IAzureCredentialConfig,
  IOAuthCredential,
  IOAuthCredentialConfig,
  Credential,
  CredentialConfig,
  ICredentialStoreEntry,
  ICredentialResolutionResult,
  ICredentialValidationError,
  ICredentialValidationResult,
} from './types/credential-types.js';

// Interfaces
export type {
  ICredentialStore,
  ICredentialStoreRegistry,
  ICredentialStoreFactory,
} from './interfaces/credential-store-interface.js';

// Stores
export { BaseCredentialStore } from './stores/base-credential-store.js';
export { SimpleCredentialStore } from './stores/simple-credential-store.js';
export { AWSCredentialStore } from './stores/aws-credential-store.js';
export {
  CredentialStoreRegistry,
  CredentialStoreFactory,
} from './stores/credential-store-registry.js';

// Resolvers
export { CredentialResolver } from './resolvers/credential-resolver.js';

// Managers
export { CredentialManager, type ICredentialStoresConfig } from './managers/credential-manager.js';
