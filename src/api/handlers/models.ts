import log from '../../utils/logging.js';
import type { Context } from 'hono';
import { getRouter } from '../../utils/enhanced-router.js';
import type { ModelsResponse } from '../../types/public/responses/models.js';

export async function handleGetModels(c: Context) {
  try {
    const router = getRouter();
    const availableModels = router.getSupportedModels();

    const response: ModelsResponse = {
      object: 'list',
      data: availableModels.map((modelName) => ({
        id: modelName,
        object: 'model' as const,
        created: Math.floor(Date.now() / 1000),
        owned_by: 'pool-based',
        root: modelName,
        permission: [],
      })),
    };

    return c.json(response);
  } catch (error) {
    log.error(error instanceof Error ? error : new Error(String(error)), 'Get models error');

    return c.json(
      {
        error: {
          message: 'Failed to retrieve models',
          type: 'api_error',
          code: 'models_fetch_failed',
        },
      },
      500
    );
  }
}
