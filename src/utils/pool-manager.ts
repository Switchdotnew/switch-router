import type { 
  PoolDefinition, 
  PoolHealth, 
  PoolMetrics, 
  PoolRoutingContext
} from '../types/domains/pools.js';
import type { ProviderConfig } from '../types/shared/config.js';
import type { IRequestContext } from './request-context.js';
import { ProviderHealthManager } from './provider-health-manager.js';
import { CircuitBreaker } from '../core/circuit-breaker.js';
import log from './logging.js';

/**
 * PoolManager handles all pool-related operations including:
 * - Pool health monitoring and aggregation
 * - Provider selection within pools
 * - Pool fallback chain execution
 * - Load balancing across pool providers
 */
export class PoolManager {
  private pools: Map<string, PoolDefinition> = new Map();
  private modelToPoolMapping: Map<string, string> = new Map();
  private poolHealthCache: Map<string, PoolHealth> = new Map();
  private poolMetrics: Map<string, PoolMetrics> = new Map();
  private poolCircuitBreakers: Map<string, CircuitBreaker> = new Map();
  private loadBalancingState: Map<string, { lastUsedIndex: number; connectionCounts: Map<string, number> }> = new Map();

  constructor(
    pools: PoolDefinition[],
    models: Record<string, { primaryPoolId: string }>,
    private healthManager: ProviderHealthManager
  ) {
    this.initializePools(pools);
    this.createModelMappings(models);
    this.initializeCircuitBreakers();
    this.initializeLoadBalancingState();
  }

  /**
   * Initialize pools from configuration
   */
  private initializePools(pools: PoolDefinition[]): void {
    for (const pool of pools) {
      this.pools.set(pool.id, pool);
      log.info(`Initialized pool: ${pool.id} (${pool.name}) with ${pool.providers.length} providers`);
    }
  }

  /**
   * Create model to pool mappings
   */
  private createModelMappings(models: Record<string, { primaryPoolId: string }>): void {
    for (const [modelName, config] of Object.entries(models)) {
      this.modelToPoolMapping.set(modelName, config.primaryPoolId);
      log.debug(`Mapped model ${modelName} to pool ${config.primaryPoolId}`);
    }
  }

  /**
   * Initialize circuit breakers for each pool
   */
  private initializeCircuitBreakers(): void {
    for (const [poolId, pool] of this.pools) {
      const circuitBreaker = new CircuitBreaker(
        `pool-${poolId}`,
        pool.circuitBreaker
      );
      this.poolCircuitBreakers.set(poolId, circuitBreaker);
    }
  }

  /**
   * Initialize load balancing state for each pool
   */
  private initializeLoadBalancingState(): void {
    for (const [poolId] of this.pools) {
      this.loadBalancingState.set(poolId, {
        lastUsedIndex: 0,
        connectionCounts: new Map()
      });
    }
  }

  /**
   * Get pool by ID
   */
  getPoolById(poolId: string): PoolDefinition | null {
    return this.pools.get(poolId) || null;
  }

  /**
   * Get primary pool for a model
   */
  getPoolForModel(modelName: string): PoolDefinition | null {
    const poolId = this.modelToPoolMapping.get(modelName);
    return poolId ? this.getPoolById(poolId) : null;
  }

  /**
   * Get all pools that could handle a model (primary + fallbacks)
   */
  getPoolChainForModel(modelName: string): string[] {
    const primaryPool = this.getPoolForModel(modelName);
    if (!primaryPool) {
      return [];
    }

    return this.buildFallbackChain(primaryPool.id);
  }

  /**
   * Build complete fallback chain for a pool
   */
  private buildFallbackChain(poolId: string, visited: Set<string> = new Set()): string[] {
    if (visited.has(poolId)) {
      log.warn(`Circular fallback detected for pool ${poolId}`);
      return [];
    }

    visited.add(poolId);
    const pool = this.getPoolById(poolId);
    if (!pool) {
      return [];
    }

    const chain = [poolId];
    
    for (const fallbackPoolId of pool.fallbackPoolIds) {
      const fallbackChain = this.buildFallbackChain(fallbackPoolId, new Set(visited));
      chain.push(...fallbackChain);
    }

    return chain;
  }

  /**
   * Execute request with pool fallback chain
   */
  async executeWithPoolFallback(
    modelName: string,
    context: IRequestContext,
    operation: (provider: ProviderConfig, poolContext: PoolRoutingContext) => Promise<any>
  ): Promise<{ result: any; usedProvider: string; poolId: string; usedFallback: boolean }> {
    const poolChain = this.getPoolChainForModel(modelName);
    if (poolChain.length === 0) {
      throw new Error(`No pools configured for model: ${modelName}`);
    }

    let usedFallback = false;
    const poolsAttempted: string[] = [];

    const startTime = Date.now();

    for (let i = 0; i < poolChain.length; i++) {
      const poolId = poolChain[i];
      poolsAttempted.push(poolId);
      usedFallback = i > 0; // First pool is primary, rest are fallbacks

      try {
        const result = await this.executeWithPool(poolId, context, operation);
        
        log.debug(`Successfully executed request with pool ${poolId}`);
        return {
          result,
          usedProvider: result.usedProvider || 'unknown',
          poolId,
          usedFallback
        };
      } catch (error) {
        log.warn(`Pool ${poolId} failed, trying next in chain`, { error: error instanceof Error ? error.message : String(error) });
        
        // Update pool health based on failure
        await this.updatePoolHealthOnFailure(poolId, error);
        continue;
      }
    }

    throw new Error(`All pools exhausted for model ${modelName}. Attempted: ${poolChain.join(', ')}`);
  }

  /**
   * Execute request with a specific pool
   */
  private async executeWithPool(
    poolId: string,
    context: IRequestContext,
    operation: (provider: ProviderConfig, poolContext: PoolRoutingContext) => Promise<any>
  ): Promise<any> {
    const pool = this.getPoolById(poolId);
    if (!pool) {
      throw new Error(`Pool not found: ${poolId}`);
    }

    // Check pool health
    const poolHealth = await this.getPoolHealth(poolId);
    if (poolHealth.status === 'unhealthy') {
      throw new Error(`Pool ${poolId} is unhealthy`);
    }

    // Get circuit breaker for pool
    const circuitBreaker = this.poolCircuitBreakers.get(poolId);
    if (!circuitBreaker) {
      throw new Error(`Circuit breaker not found for pool: ${poolId}`);
    }

    const cbResult = await circuitBreaker.execute(async () => {
      const startTime = Date.now();
      
      // Select provider from pool
      const provider = await this.selectProviderFromPool(pool);
      
      // Create pool routing context
      const poolContext: PoolRoutingContext = {
        poolId,
        selectedProvider: provider.name,
        fallbacksAttempted: [],
        routingTime: Date.now() - startTime,
        usedFallback: false,
        poolHealthAtRouting: poolHealth.status
      };

      // Execute operation
      const result = await operation(provider, poolContext);
      
      // Update pool metrics on success
      await this.updatePoolMetricsOnSuccess(poolId, provider.name, poolContext);
      
      return result;
    });

    if (cbResult.success && cbResult.data !== undefined) {
      return cbResult.data;
    } else {
      throw new Error(cbResult.error || 'Pool circuit breaker execution failed');
    }
  }

  /**
   * Select provider from pool based on routing strategy
   */
  private async selectProviderFromPool(pool: PoolDefinition): Promise<ProviderConfig> {
    const healthyProviders = await this.getHealthyProvidersInPool(pool);
    
    if (healthyProviders.length === 0) {
      throw new Error(`No healthy providers in pool: ${pool.id}`);
    }

    switch (pool.routingStrategy) {
      case 'weighted':
        return this.selectProviderWeighted(healthyProviders, pool);
      
      case 'cost_optimized':
        return this.selectProviderCostOptimized(healthyProviders, pool);
      
      case 'fastest_response':
        return this.selectProviderFastestResponse(healthyProviders, pool);
      
      case 'round_robin':
        return this.selectProviderRoundRobin(healthyProviders, pool.id);
      
      case 'least_connections':
        return this.selectProviderLeastConnections(healthyProviders, pool.id);
      
      default:
        return healthyProviders[0]; // Fallback to first healthy provider
    }
  }

  /**
   * Get healthy providers in a pool
   */
  private async getHealthyProvidersInPool(pool: PoolDefinition): Promise<ProviderConfig[]> {
    const healthyProviders: ProviderConfig[] = [];
    
    for (const providerConfig of pool.providers) {
      const providerId = `${pool.id}-${providerConfig.name}`;
      const isHealthy = this.healthManager.isProviderAvailable(providerId);
      if (isHealthy) {
        healthyProviders.push(providerConfig);
      }
    }

    return healthyProviders;
  }

  /**
   * Weighted provider selection
   */
  private selectProviderWeighted(providers: ProviderConfig[], pool: PoolDefinition): ProviderConfig {
    const totalWeight = providers.reduce((sum, provider) => {
      const config = pool.providers.find(p => p.name === provider.name);
      return sum + (config?.weight || 1);
    }, 0);

    const random = Math.random() * totalWeight;
    let currentWeight = 0;

    for (const provider of providers) {
      const config = pool.providers.find(p => p.name === provider.name);
      currentWeight += config?.weight || 1;
      if (random <= currentWeight) {
        return provider;
      }
    }

    return providers[0]; // Fallback
  }

  /**
   * Cost-optimized provider selection
   */
  private selectProviderCostOptimized(providers: ProviderConfig[], pool: PoolDefinition): ProviderConfig {
    let cheapestProvider = providers[0];
    let lowestCost = Infinity;

    for (const provider of providers) {
      const config = pool.providers.find(p => p.name === provider.name);
      const cost = config?.costPerToken || 0;
      
      if (cost < lowestCost) {
        lowestCost = cost;
        cheapestProvider = provider;
      }
    }

    return cheapestProvider;
  }

  /**
   * Fastest response provider selection
   */
  private selectProviderFastestResponse(providers: ProviderConfig[], pool: PoolDefinition): ProviderConfig {
    // Sort by average response time from health metrics
    return providers.sort((a, b) => {
      const aProviderId = `${pool.id}-${a.name}`;
      const bProviderId = `${pool.id}-${b.name}`;
      const aResponseTime = this.healthManager.getProviderMetrics(aProviderId)?.averageResponseTime || Infinity;
      const bResponseTime = this.healthManager.getProviderMetrics(bProviderId)?.averageResponseTime || Infinity;
      return aResponseTime - bResponseTime;
    })[0];
  }

  /**
   * Round-robin provider selection
   */
  private selectProviderRoundRobin(providers: ProviderConfig[], poolId: string): ProviderConfig {
    const state = this.loadBalancingState.get(poolId);
    if (!state) {
      return providers[0];
    }

    const index = (state.lastUsedIndex + 1) % providers.length;
    state.lastUsedIndex = index;
    
    return providers[index];
  }

  /**
   * Least connections provider selection
   */
  private selectProviderLeastConnections(providers: ProviderConfig[], poolId: string): ProviderConfig {
    const state = this.loadBalancingState.get(poolId);
    if (!state) {
      return providers[0];
    }

    let leastConnectionsProvider = providers[0];
    let minConnections = state.connectionCounts.get(providers[0].name) || 0;

    for (const provider of providers) {
      const connections = state.connectionCounts.get(provider.name) || 0;
      if (connections < minConnections) {
        minConnections = connections;
        leastConnectionsProvider = provider;
      }
    }

    return leastConnectionsProvider;
  }

  /**
   * Get pool health status
   */
  async getPoolHealth(poolId: string): Promise<PoolHealth> {
    const cached = this.poolHealthCache.get(poolId);
    if (cached && Date.now() - cached.lastHealthCheck.getTime() < 30000) { // 30s cache
      return cached;
    }

    const pool = this.getPoolById(poolId);
    if (!pool) {
      throw new Error(`Pool not found: ${poolId}`);
    }

    const poolHealth = await this.calculatePoolHealth(pool);
    this.poolHealthCache.set(poolId, poolHealth);
    
    return poolHealth;
  }

  /**
   * Calculate pool health based on provider health
   */
  private async calculatePoolHealth(pool: PoolDefinition): Promise<PoolHealth> {
    const providerStatuses = [];
    let healthyCount = 0;
    let totalResponseTime = 0;
    let totalErrorRate = 0;

    for (const providerConfig of pool.providers) {
      const providerId = `${pool.id}-${providerConfig.name}`;
      const isHealthy = this.healthManager.isProviderAvailable(providerId);
      const metrics = this.healthManager.getProviderMetrics(providerId);
      
      const providerStatus = {
        providerName: providerConfig.name,
        isHealthy,
        responseTime: metrics?.averageResponseTime || 0,
        errorRate: metrics?.errorRate || 0,
        lastCheck: new Date()
      };

      providerStatuses.push(providerStatus);
      
      if (isHealthy) {
        healthyCount++;
        totalResponseTime += providerStatus.responseTime;
        totalErrorRate += providerStatus.errorRate;
      }
    }

    const averageResponseTime = healthyCount > 0 ? totalResponseTime / healthyCount : 0;
    const averageErrorRate = healthyCount > 0 ? totalErrorRate / healthyCount : 100;

    // Calculate health score (0-100)
    let healthScore = 100;
    if (averageResponseTime > pool.healthThresholds.responseTime) {
      healthScore -= 30;
    }
    if (averageErrorRate > pool.healthThresholds.errorRate) {
      healthScore -= 40;
    }
    if (healthyCount < pool.healthThresholds.minHealthyProviders) {
      healthScore -= 50;
    }

    healthScore = Math.max(0, healthScore);

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (healthyCount < pool.healthThresholds.minHealthyProviders) {
      status = 'unhealthy';
    } else if (healthScore < 70) {
      status = 'degraded';
    }

    return {
      poolId: pool.id,
      status,
      healthScore,
      healthyProviders: healthyCount,
      totalProviders: pool.providers.length,
      averageResponseTime,
      errorRate: averageErrorRate,
      lastHealthCheck: new Date(),
      providerStatuses
    };
  }

  /**
   * Update pool health on failure
   */
  private async updatePoolHealthOnFailure(poolId: string, error: any): Promise<void> {
    // Invalidate health cache to force recalculation
    this.poolHealthCache.delete(poolId);
    
    // Log failure for metrics
    log.warn(`Pool ${poolId} failed`, { error: error.message });
  }

  /**
   * Update pool metrics on successful request
   */
  private async updatePoolMetricsOnSuccess(
    poolId: string, 
    providerName: string, 
    context: PoolRoutingContext
  ): Promise<void> {
    const metrics = this.poolMetrics.get(poolId) || this.initializePoolMetrics(poolId);
    
    metrics.totalRequests++;
    metrics.successfulRequests++;
    metrics.timestamp = new Date();
    
    // Update provider utilization
    if (!metrics.providerUtilization[providerName]) {
      metrics.providerUtilization[providerName] = {
        requests: 0,
        successRate: 0,
        averageResponseTime: 0,
        cost: 0
      };
    }
    
    metrics.providerUtilization[providerName].requests++;
    
    this.poolMetrics.set(poolId, metrics);
  }

  /**
   * Initialize pool metrics
   */
  private initializePoolMetrics(poolId: string): PoolMetrics {
    return {
      poolId,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      totalCost: 0,
      costPerRequest: 0,
      providerUtilization: {},
      timestamp: new Date()
    };
  }


  /**
   * Get pool metrics
   */
  getPoolMetrics(poolId: string): PoolMetrics | null {
    return this.poolMetrics.get(poolId) || null;
  }

  /**
   * Get all pool health statuses
   */
  async getAllPoolHealth(): Promise<Record<string, PoolHealth>> {
    const result: Record<string, PoolHealth> = {};
    
    for (const [poolId] of this.pools) {
      result[poolId] = await this.getPoolHealth(poolId);
    }
    
    return result;
  }
}