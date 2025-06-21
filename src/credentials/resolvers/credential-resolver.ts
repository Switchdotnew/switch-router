// Credential resolution engine

import log from '../../utils/logging.js';
import type { ICredentialStoreRegistry } from '../interfaces/credential-store-interface.js';
import type { Credential, ICredentialResolutionResult } from '../types/credential-types.js';
import { config } from '../../config.js';
import type { IRequestContext } from '../../utils/request-context.js';
import { TimeoutUtils } from '../../utils/request-context.js';

/**
 * Resolves credentials from credential stores by reference
 */
export class CredentialResolver {
  private registry: ICredentialStoreRegistry;
  private resolutionCache = new Map<
    string,
    {
      result: ICredentialResolutionResult;
      expiresAt: Date;
    }
  >();

  constructor(registry: ICredentialStoreRegistry) {
    this.registry = registry;
  }

  /**
   * Resolve credentials by store reference with optional timeout context
   * Supports both string names and numeric IDs for credential references
   */
  public async resolve(credentialsRef: string | number, requestContext?: IRequestContext): Promise<Credential> {
    const refKey = String(credentialsRef);
    
    // Check cache first
    const cached = this.resolutionCache.get(refKey);
    if (cached && new Date() < cached.expiresAt) {
      log.debug(`Using cached credential resolution for: ${credentialsRef} (${typeof credentialsRef})`);
      return cached.result.credential;
    }

    log.debug(`Resolving credentials for reference: ${credentialsRef} (${typeof credentialsRef})`);

    // Calculate timeout for credential resolution
    const timeoutConfig = config.timeout;
    const credentialTimeoutMs = timeoutConfig?.credentialResolutionTimeoutMs || 10000; // 10 seconds default
    
    try {
      // Create timeout-aware resolution operation
      const resolutionPromise = this.performResolution(credentialsRef);
      
      if (requestContext) {
        // Use request context for timeout coordination
        const effectiveTimeout = TimeoutUtils.calculateEffectiveTimeout(credentialTimeoutMs, requestContext);
        
        if (effectiveTimeout <= 0) {
          throw TimeoutUtils.createTimeoutError(requestContext, `Credential resolution for ${credentialsRef}`);
        }

        // Create deadline-aware signal
        const { signal } = TimeoutUtils.createDeadlineSignal(effectiveTimeout, requestContext);
        
        // Race resolution against timeout
        const result = await Promise.race([
          resolutionPromise,
          new Promise<never>((_, reject) => {
            signal.addEventListener('abort', () => {
              reject(TimeoutUtils.createTimeoutError(requestContext, `Credential resolution for ${credentialsRef}`));
            });
          })
        ]);
        
        // Cache the result if it's not already from cache and we have TTL configured
        if (!result.fromCache) {
          this.cacheResult(refKey, result);
        }

        return result.credential;
      } else {
        // Fallback to regular timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Credential resolution timeout after ${credentialTimeoutMs}ms for reference: ${credentialsRef}`));
          }, credentialTimeoutMs);
        });

        const result = await Promise.race([resolutionPromise, timeoutPromise]);
        
        // Cache the result if it's not already from cache and we have TTL configured
        if (!result.fromCache) {
          this.cacheResult(refKey, result);
        }

        return result.credential;
      }
    } catch (error) {
      log.error(
        error instanceof Error ? error : new Error(String(error)),
        `Failed to resolve credentials for reference: ${credentialsRef}`
      );
      throw error;
    }
  }

  /**
   * Perform the actual credential resolution operation
   * Supports both string names and numeric IDs for credential references
   */
  private async performResolution(credentialsRef: string | number): Promise<ICredentialResolutionResult> {
    // Get the credential store (registry handles both string and numeric lookups)
    const store = await this.registry.getStore(credentialsRef);

    // Resolve credentials from the store
    return await store.resolve();
  }

  /**
   * Cache credential resolution result
   */
  private cacheResult(credentialsRef: string, result: ICredentialResolutionResult): void {
    // If the store provided an expiration, use it; otherwise use a default cache duration
    const expiresAt = result.expiresAt || new Date(Date.now() + 300000); // 5 minutes default
    this.resolutionCache.set(credentialsRef, {
      result,
      expiresAt,
    });
    log.debug(`Cached credential resolution for: ${credentialsRef}, expires at: ${expiresAt.toISOString()}`);
  }

  /**
   * Legacy resolve method without timeout handling (for backward compatibility)
   * Supports both string names and numeric IDs for credential references
   */
  public async resolveLegacy(credentialsRef: string | number): Promise<Credential> {
    const refKey = String(credentialsRef);
    
    // Check cache first
    const cached = this.resolutionCache.get(refKey);
    if (cached && new Date() < cached.expiresAt) {
      log.debug(`Using cached credential resolution for: ${credentialsRef} (${typeof credentialsRef})`);
      return cached.result.credential;
    }

    log.debug(`Resolving credentials for reference: ${credentialsRef} (${typeof credentialsRef})`);

    try {
      const result = await this.performResolution(credentialsRef);

      // Cache the result if it's not already from cache and we have TTL configured
      if (!result.fromCache) {
        this.cacheResult(refKey, result);
      }

      return result.credential;
    } catch (error) {
      log.error(
        error instanceof Error ? error : new Error(String(error)),
        `Failed to resolve credentials for reference: ${credentialsRef}`
      );
      throw error;
    }
  }

  /**
   * Resolve credentials with full result metadata
   * Supports both string names and numeric IDs for credential references
   */
  public async resolveWithMetadata(credentialsRef: string | number): Promise<ICredentialResolutionResult> {
    const refKey = String(credentialsRef);
    
    // Check cache first
    const cached = this.resolutionCache.get(refKey);
    if (cached && new Date() < cached.expiresAt) {
      log.debug(`Using cached credential resolution for: ${credentialsRef} (${typeof credentialsRef})`);
      return {
        ...cached.result,
        fromCache: true,
      };
    }

    log.debug(`Resolving credentials with metadata for reference: ${credentialsRef} (${typeof credentialsRef})`);

    try {
      const store = await this.registry.getStore(credentialsRef);
      const result = await store.resolve();

      // Cache the result
      if (!result.fromCache) {
        const expiresAt = result.expiresAt || new Date(Date.now() + 300000); // 5 minutes default
        this.resolutionCache.set(refKey, {
          result,
          expiresAt,
        });
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error(`Failed to resolve credentials with metadata for ${credentialsRef}: ${message}`);
      throw new Error(`Credential resolution failed for ${credentialsRef}: ${message}`);
    }
  }

  /**
   * Check if credentials can be resolved (without actually resolving them)
   * Supports both string names and numeric IDs for credential references
   */
  public canResolve(credentialsRef: string | number): boolean {
    return this.registry.hasStore(credentialsRef);
  }

  /**
   * Validate that a credential reference can be resolved
   * Supports both string names and numeric IDs for credential references
   */
  public async validateReference(credentialsRef: string | number): Promise<{
    valid: boolean;
    error?: string;
  }> {
    try {
      if (!this.registry.hasStore(credentialsRef)) {
        return {
          valid: false,
          error: `Credential store not found: ${credentialsRef} (${typeof credentialsRef})`,
        };
      }

      const store = await this.registry.getStore(credentialsRef);
      const validation = await store.validate();

      return {
        valid: validation.valid,
        error: validation.valid ? undefined : validation.errors.map((e) => e.message).join(', '),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        valid: false,
        error: message,
      };
    }
  }

  /**
   * Pre-warm cache by resolving credentials
   * Supports both string names and numeric IDs for credential references
   */
  public async preWarm(credentialsRefs: (string | number)[]): Promise<void> {
    log.info(`Pre-warming credential cache for ${credentialsRefs.length} references`);

    const warmupPromises = credentialsRefs.map(async (ref) => {
      try {
        await this.resolve(ref);
        log.debug(`Pre-warmed credentials for: ${ref} (${typeof ref})`);
      } catch (error) {
        log.warn(`Failed to pre-warm credentials for ${ref}:`, error);
      }
    });

    await Promise.all(warmupPromises);
  }

  /**
   * Clear the resolution cache
   */
  public clearCache(): void {
    log.debug('Clearing credential resolution cache');
    this.resolutionCache.clear();
  }

  /**
   * Clear cache for specific credential reference
   * Supports both string names and numeric IDs for credential references
   */
  public clearCacheFor(credentialsRef: string | number): void {
    const refKey = String(credentialsRef);
    log.debug(`Clearing credential cache for: ${credentialsRef} (${typeof credentialsRef})`);
    this.resolutionCache.delete(refKey);
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): {
    totalEntries: number;
    hitRate?: number;
    entries: Array<{
      ref: string;
      expiresAt: Date;
      type: string;
    }>;
  } {
    const entries = Array.from(this.resolutionCache.entries()).map(([ref, cached]) => ({
      ref,
      expiresAt: cached.expiresAt,
      type: cached.result.credential.type,
    }));

    return {
      totalEntries: this.resolutionCache.size,
      entries,
    };
  }

  /**
   * Clean up expired cache entries
   */
  public cleanupCache(): void {
    const now = new Date();
    const expired: string[] = [];

    for (const [ref, cached] of this.resolutionCache.entries()) {
      if (now > cached.expiresAt) {
        expired.push(ref);
      }
    }

    for (const ref of expired) {
      this.resolutionCache.delete(ref);
    }

    if (expired.length > 0) {
      log.debug(`Cleaned up ${expired.length} expired credential cache entries`);
    }
  }

  /**
   * Start automatic cache cleanup
   */
  public startCacheCleanup(intervalMs = 300000): NodeJS.Timeout {
    // 5 minutes
    return setInterval(() => {
      this.cleanupCache();
      this.enforceMaxCacheSize(); // Add size-based cleanup
    }, intervalMs);
  }

  /**
   * Enforce maximum cache size to prevent unbounded growth
   */
  private enforceMaxCacheSize(): void {
    const maxEntries = 200; // Reasonable limit for credential cache
    
    if (this.resolutionCache.size > maxEntries) {
      const entries = Array.from(this.resolutionCache.entries());
      // Sort by expiration time (oldest first) and remove oldest entries
      entries.sort((a, b) => a[1].expiresAt.getTime() - b[1].expiresAt.getTime());
      
      const entriesToRemove = entries.slice(0, entries.length - maxEntries);
      for (const [ref] of entriesToRemove) {
        this.resolutionCache.delete(ref);
      }

      if (entriesToRemove.length > 0) {
        log.debug(`Credential cache size cleanup: removed ${entriesToRemove.length} oldest entries`);
      }
    }
  }
}
