import type { PoolDefinition, PoolHealth } from '../types/domains/pools.js';
import type { ProviderHealthManager } from './provider-health-manager.js';
import log from './logging.js';

/**
 * PoolHealthAggregator handles pool-level health calculations
 * by aggregating individual provider health statuses
 */
export class PoolHealthAggregator {
  private healthCache: Map<string, { health: PoolHealth; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 30000; // 30 seconds

  constructor(private healthManager: ProviderHealthManager) {}

  /**
   * Get pool health with caching
   */
  async getPoolHealth(pool: PoolDefinition): Promise<PoolHealth> {
    const cached = this.healthCache.get(pool.id);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.CACHE_TTL) {
      return cached.health;
    }

    const health = await this.calculatePoolHealth(pool);
    this.healthCache.set(pool.id, { health, timestamp: now });

    return health;
  }

  /**
   * Calculate pool health by aggregating provider health
   */
  async calculatePoolHealth(pool: PoolDefinition): Promise<PoolHealth> {
    const providerStatuses = [];
    let healthyCount = 0;
    let totalResponseTime = 0;
    let totalErrorRate = 0;
    let totalSuccessRate = 0;

    log.debug(`Calculating health for pool ${pool.id} with ${pool.providers.length} providers`);

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
        totalSuccessRate += metrics ? (metrics.totalRequests > 0 ? (metrics.successfulRequests / metrics.totalRequests) * 100 : 0) : 0;
      }

      log.debug(`Provider ${providerConfig.name} health status`, {
        isHealthy,
        responseTime: providerStatus.responseTime,
        errorRate: providerStatus.errorRate
      });
    }

    const averageResponseTime = healthyCount > 0 ? totalResponseTime / healthyCount : 0;
    const averageErrorRate = healthyCount > 0 ? totalErrorRate / healthyCount : 100;
    const averageSuccessRate = healthyCount > 0 ? totalSuccessRate / healthyCount : 0;

    // Calculate composite health score (0-100)
    const healthScore = this.calculateHealthScore(
      pool,
      healthyCount,
      averageResponseTime,
      averageErrorRate,
      averageSuccessRate
    );

    // Determine overall pool status
    const status = this.determinePoolStatus(pool, healthyCount, healthScore);

    const poolHealth: PoolHealth = {
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

    log.info(`Pool ${pool.id} health calculated`, {
      status,
      healthScore,
      healthyProviders: healthyCount,
      totalProviders: pool.providers.length,
      averageResponseTime: Math.round(averageResponseTime),
      errorRate: Math.round(averageErrorRate * 100) / 100
    });

    return poolHealth;
  }

  /**
   * Calculate weighted health score based on multiple factors
   */
  private calculateHealthScore(
    pool: PoolDefinition,
    healthyCount: number,
    averageResponseTime: number,
    averageErrorRate: number,
    averageSuccessRate: number
  ): number {
    let score = 100;

    // Provider availability factor (40% weight)
    const providerAvailabilityRatio = healthyCount / pool.providers.length;
    const requiredProviderRatio = pool.healthThresholds.minHealthyProviders / pool.providers.length;
    
    if (providerAvailabilityRatio < requiredProviderRatio) {
      score -= 40;
    } else if (providerAvailabilityRatio < 0.8) {
      score -= 20 * (1 - providerAvailabilityRatio / 0.8);
    }

    // Response time factor (30% weight)
    if (averageResponseTime > pool.healthThresholds.responseTime) {
      const responseTimePenalty = Math.min(30, 
        30 * (averageResponseTime - pool.healthThresholds.responseTime) / pool.healthThresholds.responseTime
      );
      score -= responseTimePenalty;
    }

    // Error rate factor (30% weight)
    if (averageErrorRate > pool.healthThresholds.errorRate) {
      const errorRatePenalty = Math.min(30,
        30 * (averageErrorRate - pool.healthThresholds.errorRate) / pool.healthThresholds.errorRate
      );
      score -= errorRatePenalty;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Determine pool status based on health metrics
   */
  private determinePoolStatus(
    pool: PoolDefinition,
    healthyCount: number,
    healthScore: number
  ): 'healthy' | 'degraded' | 'unhealthy' {
    // Pool is unhealthy if it doesn't meet minimum provider requirements
    if (healthyCount < pool.healthThresholds.minHealthyProviders) {
      return 'unhealthy';
    }

    // Pool is degraded if health score is below threshold
    if (healthScore < 70) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Invalidate health cache for a specific pool
   */
  invalidatePoolHealth(poolId: string): void {
    this.healthCache.delete(poolId);
    log.debug(`Invalidated health cache for pool ${poolId}`);
  }

  /**
   * Clear all health cache
   */
  clearHealthCache(): void {
    this.healthCache.clear();
    log.debug('Cleared all pool health cache');
  }

  /**
   * Get health status for multiple pools
   */
  async getMultiplePoolHealth(pools: PoolDefinition[]): Promise<Record<string, PoolHealth>> {
    const healthPromises = pools.map(async pool => ({
      poolId: pool.id,
      health: await this.getPoolHealth(pool)
    }));

    const results = await Promise.all(healthPromises);
    
    return results.reduce((acc, { poolId, health }) => {
      acc[poolId] = health;
      return acc;
    }, {} as Record<string, PoolHealth>);
  }

  /**
   * Check if pool meets health requirements for routing
   */
  async isPoolRoutable(pool: PoolDefinition): Promise<boolean> {
    const health = await this.getPoolHealth(pool);
    
    // Pool is routable if it's healthy or degraded (but not unhealthy)
    return health.status !== 'unhealthy';
  }

  /**
   * Get the healthiest pool from a list of pools
   */
  async getHealthiestPool(pools: PoolDefinition[]): Promise<PoolDefinition | null> {
    if (pools.length === 0) {
      return null;
    }

    const healthResults = await Promise.all(
      pools.map(async pool => ({
        pool,
        health: await this.getPoolHealth(pool)
      }))
    );

    // Filter out unhealthy pools
    const routablePools = healthResults.filter(({ health }) => health.status !== 'unhealthy');
    
    if (routablePools.length === 0) {
      return null;
    }

    // Sort by health score descending
    routablePools.sort((a, b) => b.health.healthScore - a.health.healthScore);
    
    return routablePools[0].pool;
  }

  /**
   * Monitor pool health changes and trigger alerts
   */
  async monitorPoolHealthChanges(pool: PoolDefinition, previousHealth?: PoolHealth): Promise<void> {
    const currentHealth = await this.getPoolHealth(pool);
    
    if (!previousHealth) {
      return;
    }

    // Check for status changes
    if (previousHealth.status !== currentHealth.status) {
      log.warn(`Pool ${pool.id} status changed from ${previousHealth.status} to ${currentHealth.status}`, {
        poolId: pool.id,
        previousHealth: {
          status: previousHealth.status,
          healthScore: previousHealth.healthScore,
          healthyProviders: previousHealth.healthyProviders
        },
        currentHealth: {
          status: currentHealth.status,
          healthScore: currentHealth.healthScore,
          healthyProviders: currentHealth.healthyProviders
        }
      });
    }

    // Check for significant health score changes (>20 points)
    const scoreDifference = Math.abs(currentHealth.healthScore - previousHealth.healthScore);
    if (scoreDifference > 20) {
      log.info(`Pool ${pool.id} health score changed significantly`, {
        poolId: pool.id,
        previousScore: previousHealth.healthScore,
        currentScore: currentHealth.healthScore,
        difference: currentHealth.healthScore - previousHealth.healthScore
      });
    }

    // Check for provider count changes
    if (previousHealth.healthyProviders !== currentHealth.healthyProviders) {
      log.info(`Pool ${pool.id} healthy provider count changed`, {
        poolId: pool.id,
        previousCount: previousHealth.healthyProviders,
        currentCount: currentHealth.healthyProviders,
        totalProviders: currentHealth.totalProviders
      });
    }
  }
}