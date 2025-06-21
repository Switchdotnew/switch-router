import log from './logging.js';
import { getConfig } from '../config.js';
import type { PoolDefinition, PoolRoutingContext } from '../types/domains/pools.js';
import type { ProviderConfig } from '../types/shared/config.js';
import { OpenAICompatibleClient } from './openai-client.js';
import { ProviderHealthManager } from './provider-health-manager.js';
import { HealthCheckScheduler } from './health-check-scheduler.js';
import { PoolManager } from './pool-manager.js';
import { PoolHealthAggregator } from './pool-health-aggregator.js';
import type { CredentialManager } from '../credentials/managers/credential-manager.js';
import { mergeModelDefaults } from '../providers/model-registry/index.js';
import type { IRequestContext } from './request-context.js';
import { TimeoutUtils } from './request-context.js';

/**
 * EnhancedModelRouter - Pool-Based Routing System
 * 
 * This router uses pools as the primary routing mechanism, completely replacing
 * the old model-based provider selection. All routing decisions go through pools.
 */
export class EnhancedModelRouter {
  private pools: Map<string, PoolDefinition> = new Map();
  private modelToPoolMapping: Map<string, string> = new Map();
  private clients: Map<string, OpenAICompatibleClient> = new Map();
  private healthManager: ProviderHealthManager = new ProviderHealthManager();
  private healthCheckScheduler: HealthCheckScheduler;
  private poolManager: PoolManager;
  private poolHealthAggregator: PoolHealthAggregator;
  private credentialManager?: CredentialManager;
  private requestQueue: Map<string, number> = new Map(); // Track concurrent requests per provider
  private readonly maxConcurrentRequests = 50; // Max concurrent requests per provider

  // Performance optimization: cache with memory management
  private poolHealthCache: Map<string, { health: any; timestamp: number }> = new Map();
  private readonly cacheExpiryMs = 10000; // 10 seconds default
  private readonly maxCacheEntries = 50; // Limit cache size to prevent memory leaks

  constructor(credentialManager?: CredentialManager) {
    this.credentialManager = credentialManager;
    this.healthCheckScheduler = new HealthCheckScheduler(this.healthManager, this.clients);
    this.poolHealthAggregator = new PoolHealthAggregator(this.healthManager);
    this.poolManager = new PoolManager([], {}, this.healthManager);
  }

  /**
   * Initialize the router with pool-based configuration
   */
  public async initialize(): Promise<void> {
    const config = await getConfig();
    
    if (!config.pools || config.pools.length === 0) {
      throw new Error('No pool configuration found. Pool-based routing requires at least one pool.');
    }

    await this.initializePools(config.pools, config.models);
    this.startHealthChecks();
    
    log.info(`Initialized pool-based router with ${this.pools.size} pools and ${this.clients.size} provider endpoints`);
  }

  /**
   * Initialize pools and their providers
   */
  private async initializePools(pools: PoolDefinition[], models: Record<string, any>): Promise<void> {
    const initPromises: Promise<void>[] = [];

    // Initialize pools
    for (const pool of pools) {
      this.pools.set(pool.id, pool);

      // Initialize all providers in this pool
      for (const provider of pool.providers) {
        const providerId = `${pool.id}-${provider.name}`;
        
        // Register provider with health manager
        this.healthManager.registerProvider(
          providerId,
          pool.circuitBreaker || {
            enabled: true,
            failureThreshold: 3,
            resetTimeout: 60000,
            monitoringWindow: 300000,
            minRequestsThreshold: 5,
            errorThresholdPercentage: 50,
          }
        );

        // Create client for each provider endpoint (async)
        const initPromise = this.createClientModel(provider)
          .then((clientModel) => {
            const client = new OpenAICompatibleClient(clientModel);
            this.clients.set(providerId, client);
            
            // Register provider with health check scheduler
            this.healthCheckScheduler.registerProvider(pool.id, providerId, client, provider.priority);
          })
          .catch((error) => {
            log.error(`Failed to initialize client for provider ${providerId} in pool ${pool.id}: ${error}`);
            throw error;
          });

        initPromises.push(initPromise);
      }
    }

    // Create model to pool mappings
    for (const [modelName, modelConfig] of Object.entries(models)) {
      this.modelToPoolMapping.set(modelName, modelConfig.primaryPoolId);
      log.debug(`Mapped model ${modelName} to pool ${modelConfig.primaryPoolId}`);
    }

    // Wait for all clients to be initialized
    await Promise.all(initPromises);

    // Initialize PoolManager with the pools
    this.poolManager = new PoolManager(pools, models, this.healthManager);
  }

  /**
   * Start health check monitoring for all providers
   */
  private startHealthChecks(): void {
    log.info('Starting health check scheduler for pool providers');
    this.healthCheckScheduler.start();
  }

  /**
   * Stop health check monitoring
   */
  public async stop(): Promise<void> {
    await this.healthCheckScheduler.stop();
    log.info('Stopped health check scheduler');
  }

  /**
   * Primary routing method - Route request through pools
   */
  public async executeWithPools<T>(
    modelName: string,
    operation: (client: OpenAICompatibleClient, providerId: string, poolContext: PoolRoutingContext) => Promise<T>,
    requestContext?: IRequestContext
  ): Promise<{ result: T; usedProvider: string; usedPool: string; usedFallback: boolean; routingTime: number }> {
    const startTime = Date.now();

    // Get pool for model
    const primaryPoolId = this.modelToPoolMapping.get(modelName);
    if (!primaryPoolId) {
      throw new Error(`No pool configured for model: ${modelName}`);
    }

    // Execute with pool fallback chain
    const result = await this.poolManager.executeWithPoolFallback(
      modelName,
      requestContext || this.createDefaultRequestContext(),
      async (provider, poolContext) => {
        const client = this.clients.get(`${poolContext.poolId}-${provider.name}`);
        if (!client) {
          throw new Error(`Client not found for provider ${provider.name} in pool ${poolContext.poolId}`);
        }

        // Execute the operation with proper client
        return await this.executeWithProvider(
          `${poolContext.poolId}-${provider.name}`,
          client,
          operation,
          poolContext,
          requestContext
        );
      }
    );

    return {
      result: result.result,
      usedProvider: result.usedProvider,
      usedPool: result.poolId,
      usedFallback: result.usedFallback,
      routingTime: Date.now() - startTime
    };
  }


  /**
   * Execute operation with a specific provider (with concurrency control)
   */
  private async executeWithProvider<T>(
    providerId: string,
    client: OpenAICompatibleClient,
    operation: (client: OpenAICompatibleClient, providerId: string, poolContext: PoolRoutingContext) => Promise<T>,
    poolContext: PoolRoutingContext,
    requestContext?: IRequestContext
  ): Promise<T> {
    // Check request context deadline before attempting provider
    if (requestContext) {
      try {
        TimeoutUtils.validateTimeRemaining(requestContext, 1000); // Require at least 1s remaining
      } catch (error) {
        throw error instanceof Error ? error : new Error(String(error));
      }
    }

    // Check if provider is available
    if (!this.healthManager.isProviderAvailable(providerId)) {
      throw new Error(`Provider ${providerId} is not available`);
    }

    // Check concurrent request limit
    const currentRequests = this.getRequestCount(providerId);
    if (currentRequests >= this.maxConcurrentRequests) {
      throw new Error(`Provider ${providerId} at maximum concurrent requests (${currentRequests})`);
    }

    // Validate counter state
    this.validateAndRecoverRequestCounter(providerId);

    try {
      log.debug(`Executing request with provider ${providerId} in pool ${poolContext.poolId}`);

      // Atomically increment request counter
      this.incrementRequestCounter(providerId);

      let result;
      try {
        // Calculate provider timeout based on request context
        const providerTimeoutMs = this.calculateProviderTimeout(requestContext);
        
        result = await this.healthManager.executeWithProvider(
          providerId,
          () => operation(client, providerId, poolContext),
          requestContext,
          providerTimeoutMs
        );
      } finally {
        // Always decrement request counter in finally block to ensure cleanup
        this.decrementRequestCounter(providerId);
      }

      return result;
    } catch (error) {
      // Atomically decrement request counter on failure
      this.decrementRequestCounter(providerId);
      throw error;
    }
  }

  /**
   * Get pool health status
   */
  public async getPoolHealth(poolId: string): Promise<any> {
    const pool = this.pools.get(poolId);
    if (!pool) {
      throw new Error(`Pool not found: ${poolId}`);
    }

    return await this.poolHealthAggregator.getPoolHealth(pool);
  }

  /**
   * Get all pool health statuses
   */
  public async getAllPoolHealth(): Promise<Record<string, any>> {
    const healthPromises = Array.from(this.pools.values()).map(async (pool) => ({
      poolId: pool.id,
      health: await this.getPoolHealth(pool.id)
    }));

    const results = await Promise.all(healthPromises);
    
    return results.reduce((acc, { poolId, health }) => {
      acc[poolId] = health;
      return acc;
    }, {} as Record<string, any>);
  }

  /**
   * Get pool metrics
   */
  public getPoolMetrics(poolId: string): any {
    return this.poolManager.getPoolMetrics(poolId);
  }

  /**
   * Get all pool metrics
   */
  public getAllPoolMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {};
    
    for (const poolId of this.pools.keys()) {
      const poolMetrics = this.getPoolMetrics(poolId);
      if (poolMetrics) {
        metrics[poolId] = poolMetrics;
      }
    }
    
    return metrics;
  }

  /**
   * Get model to pool mapping
   */
  public getModelToPoolMapping(): Record<string, string> {
    return Object.fromEntries(this.modelToPoolMapping);
  }

  /**
   * Check if a model is supported
   */
  public isModelSupported(modelName: string): boolean {
    return this.modelToPoolMapping.has(modelName);
  }

  /**
   * Get list of supported models
   */
  public getSupportedModels(): string[] {
    return Array.from(this.modelToPoolMapping.keys());
  }

  /**
   * Get pool names
   */
  public getPoolNames(): string[] {
    return Array.from(this.pools.keys());
  }

  /**
   * Get health status (pools-based)
   */
  public async getHealthStatus(): Promise<Record<string, unknown>> {
    const poolsHealth = await this.getAllPoolHealth();
    const poolsMetrics = this.getAllPoolMetrics();
    
    return {
      pools: poolsHealth,
      poolMetrics: poolsMetrics,
      modelMappings: this.getModelToPoolMapping(),
      healthCheckMetrics: this.healthCheckScheduler.getMetrics(),
    };
  }


  /**
   * Reset provider (pools-based implementation)
   */
  public resetProvider(poolId: string, providerName: string): void {
    const providerId = `${poolId}-${providerName}`;
    this.healthManager.resetProvider(providerId);
  }

  /**
   * Resolve API key for provider using credential manager
   */
  private async resolveApiKey(provider: ProviderConfig): Promise<string> {
    // All providers must use credentialsRef with the credential manager
    if (provider.credentialsRef && this.credentialManager) {
      try {
        const credRef = provider.credentialsRef;
        if (typeof credRef !== 'string' && typeof credRef !== 'number') {
          throw new Error(`Invalid credentialsRef type: expected string or number, got ${typeof credRef}`);
        }
        const credentials = await this.credentialManager.resolveCredentials(credRef);

        // Handle different credential types
        if (credentials.type === 'simple') {
          return (credentials as { apiKey: string }).apiKey;
        } else {
          // For other credential types, use the auth headers to extract the API key
          const authHeaders = credentials.getAuthHeaders();
          const authHeader = authHeaders['Authorization'];
          if (authHeader?.startsWith('Bearer ')) {
            return authHeader.substring(7); // Remove 'Bearer ' prefix
          }
          // Try to find API key in other header formats
          const apiKeyHeader =
            authHeaders['X-API-Key'] || authHeaders['x-api-key'] || authHeaders['api-key'];
          if (apiKeyHeader) {
            return apiKeyHeader;
          }
          throw new Error(
            `Unsupported credential type '${credentials.type}' or unable to extract API key from credentials`
          );
        }
      } catch (error) {
        log.error(
          `Failed to resolve credentials for ${provider.name} using credentialsRef '${provider.credentialsRef}': ${error}`
        );
        throw error;
      }
    }

    throw new Error(
      `Provider ${provider.name} has no credentialsRef, or credential manager not available`
    );
  }

  /**
   * Create client model from provider config
   */
  private async createClientModel(provider: ProviderConfig) {
    const apiKey = await this.resolveApiKey(provider);

    // Merge user configuration with smart model defaults
    const mergedParams = mergeModelDefaults(provider.provider, provider.modelName, {
      providerParams: provider.providerParams,
      streamingParams: provider.streamingParams,
      healthCheckParams: provider.healthCheckParams,
      useModelDefaults: provider.useModelDefaults,
    });

    // Log applied defaults and warnings
    if (mergedParams.appliedDefaults.length > 0) {
      log.info(`Model defaults applied for ${provider.name}:`, mergedParams.appliedDefaults);
    }

    if (mergedParams.warnings.length > 0) {
      log.warn(`Parameter warnings for ${provider.name}:`, mergedParams.warnings);
    }

    if (mergedParams.transformations.length > 0) {
      log.debug(`Parameter transformations for ${provider.name}:`, mergedParams.transformations);
    }

    // Create a legacy-compatible model object for the OpenAI client
    return {
      name: provider.name,
      apiKey,
      apiBase: provider.apiBase,
      modelName: provider.modelName,
      provider: provider.provider,
      temperature: 0.7, // Will be overridden by request
      maxTokens: 4096, // Will be overridden by request
      isHealthy: true,
      lastHealthCheck: new Date(),
      responseTime: 0,
      providerParams: mergedParams.providerParams,
      streamingParams: mergedParams.streamingParams,
      healthCheckParams: mergedParams.healthCheckParams,
    };
  }

  /**
   * Create default request context
   */
  private createDefaultRequestContext(): IRequestContext {
    const config = getConfig();
    const timeout = config.timeout?.defaultTimeoutMs || 60000;
    
    return {
      id: `req-${Date.now()}-${Math.random().toString(36).substring(2)}`,
      startTime: Date.now(),
      timeoutMs: timeout,
      get remainingTime() {
        return Math.max(0, this.timeoutMs - (Date.now() - this.startTime));
      }
    } as IRequestContext;
  }

  /**
   * Calculate provider timeout based on request context
   */
  private calculateProviderTimeout(requestContext?: IRequestContext): number {
    const config = getConfig();
    const timeoutConfig = config.timeout;
    
    if (!timeoutConfig || !requestContext) {
      return timeoutConfig?.defaultTimeoutMs || 60000;
    }

    // Calculate timeout as percentage of remaining request time
    const remainingTime = requestContext.remainingTime;
    const providerTimeout = Math.floor(remainingTime * timeoutConfig.providerTimeoutMultiplier);
    
    // Ensure we have a minimum viable timeout
    const minTimeout = Math.min(5000, remainingTime);
    return Math.max(minTimeout, Math.min(providerTimeout, timeoutConfig.maxTimeoutMs));
  }

  // Request counter management methods (from original router)
  private incrementRequestCounter(providerId: string): number {
    const currentCount = this.requestQueue.get(providerId) || 0;
    const newCount = currentCount + 1;
    this.requestQueue.set(providerId, newCount);
    return newCount;
  }

  private decrementRequestCounter(providerId: string): number {
    const currentCount = this.requestQueue.get(providerId) || 1;
    const newCount = Math.max(0, currentCount - 1);
    
    if (newCount === 0) {
      this.requestQueue.delete(providerId);
    } else {
      this.requestQueue.set(providerId, newCount);
    }
    
    return newCount;
  }

  private getRequestCount(providerId: string): number {
    return this.requestQueue.get(providerId) || 0;
  }

  private validateAndRecoverRequestCounter(providerId: string): void {
    const count = this.requestQueue.get(providerId) || 0;
    
    if (count < 0) {
      log.warn(`Negative request count detected for provider ${providerId}: ${count}, resetting to 0`);
      this.requestQueue.delete(providerId);
    } else if (count > this.maxConcurrentRequests * 2) {
      log.warn(`Abnormally high request count for provider ${providerId}: ${count}, capping at ${this.maxConcurrentRequests}`);
      this.requestQueue.set(providerId, this.maxConcurrentRequests);
    }
  }
}

// Global router instance - will be initialized in main application
let globalRouterInstance: EnhancedModelRouter | null = null;

export function initializeRouter(
  credentialManager?: CredentialManager
): Promise<EnhancedModelRouter> {
  if (globalRouterInstance) {
    return Promise.resolve(globalRouterInstance);
  }

  globalRouterInstance = new EnhancedModelRouter(credentialManager);
  return globalRouterInstance.initialize().then(() => globalRouterInstance as EnhancedModelRouter);
}

export function getRouter(): EnhancedModelRouter {
  if (!globalRouterInstance) {
    throw new Error('Router not initialized. Call initializeRouter() first.');
  }
  return globalRouterInstance;
}

