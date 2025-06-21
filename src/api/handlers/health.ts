import type { Context } from 'hono';
import { getRouter } from '../../utils/enhanced-router.js';
import log from '../../utils/logging.js';

export async function handleHealthCheck(c: Context) {
  try {
    const router = getRouter();
    const healthStatus = await router.getHealthStatus();

    // Get pool health status and metrics
    const poolsHealth = await router.getAllPoolHealth();
    const poolMetrics = router.getAllPoolMetrics();

    // Check if any pools are healthy (pool-based system)
    const hasHealthyPools = Object.values(poolsHealth).some((poolHealth: any) => 
      poolHealth.status === 'healthy' || poolHealth.status === 'degraded'
    );

    // Get supported models and pool mappings
    const supportedModels = router.getSupportedModels();
    const modelMappings = router.getModelToPoolMapping();

    const response: any = {
      status: hasHealthyPools ? 'up' : 'degraded',
      timestamp: new Date().toISOString(),
      pools: {
        health: poolsHealth,
        metrics: poolMetrics,
        names: router.getPoolNames(),
        count: router.getPoolNames().length,
      },
      models: {
        supported: supportedModels,
        count: supportedModels.length,
        poolMappings: modelMappings,
      },
      providers: healthStatus.pools || {},
      architecture: 'pool-based',
    };

    return c.json(response);
  } catch (error) {
    log.error('Health check failed:', error);
    return c.json(
      {
        status: 'down',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        architecture: 'pool-based',
      },
      503
    );
  }
}
