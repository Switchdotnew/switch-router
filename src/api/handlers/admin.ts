import log from '../../utils/logging.js';
import type { Context } from 'hono';
import { enhancedModelRouter } from '../../utils/enhanced-router.js';

export async function handleProviderStatus(c: Context) {
  try {
    const healthStatus = enhancedModelRouter.getHealthStatus();
    const providerSummary = enhancedModelRouter.getProviderHealthSummary();

    return c.json({
      models: healthStatus,
      providers: providerSummary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error(
      error instanceof Error ? error : new Error(String(error)),
      'Failed to get provider status'
    );

    return c.json(
      {
        error: {
          message: 'Failed to retrieve provider status',
          type: 'api_error',
          code: 'status_retrieval_failed',
        },
      },
      500
    );
  }
}

export async function handleResetProvider(c: Context) {
  try {
    const { modelName, providerName } = c.req.param();

    if (!modelName || !providerName) {
      return c.json(
        {
          error: {
            message: 'Model name and provider name are required',
            type: 'invalid_request_error',
            code: 'missing_parameters',
          },
        },
        400
      );
    }

    enhancedModelRouter.resetProvider(modelName, providerName);

    log.info(`Reset provider ${providerName} for model ${modelName}`);

    return c.json({
      message: `Successfully reset provider ${providerName} for model ${modelName}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error(
      error instanceof Error ? error : new Error(String(error)),
      'Failed to reset provider'
    );

    return c.json(
      {
        error: {
          message: 'Failed to reset provider',
          type: 'api_error',
          code: 'reset_failed',
        },
      },
      500
    );
  }
}
