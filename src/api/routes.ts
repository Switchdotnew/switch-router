import { Hono } from 'hono';
import { handleChatCompletion } from './handlers/chat.js';
import { handleCompletion } from './handlers/completions.js';
import { handleGetModels } from './handlers/models.js';
import { handleHealthCheck } from './handlers/health.js';
import { handleProviderStatus, handleResetProvider } from './handlers/admin.js';
import { authMiddleware } from './middleware/auth.js';

export function createRoutes() {
  const app = new Hono();

  // Public endpoints (no auth required)
  app.get('/health', handleHealthCheck);
  app.get('/health/', handleHealthCheck);

  // Protected endpoints (require API key authentication)
  app.get('/v1/models', authMiddleware(), handleGetModels);
  app.get('/v1/models/', authMiddleware(), handleGetModels);
  app.post('/v1/chat/completions', authMiddleware(), handleChatCompletion);
  app.post('/v1/chat/completions/', authMiddleware(), handleChatCompletion);
  app.post('/v1/completions', authMiddleware(), handleCompletion);
  app.post('/v1/completions/', authMiddleware(), handleCompletion);

  // Admin endpoints (require API key authentication)
  app.get('/admin/providers/status', authMiddleware(), handleProviderStatus);
  app.get('/admin/providers/status/', authMiddleware(), handleProviderStatus);
  app.post(
    '/admin/providers/:modelName/:providerName/reset',
    authMiddleware(),
    handleResetProvider
  );
  app.post(
    '/admin/providers/:modelName/:providerName/reset/',
    authMiddleware(),
    handleResetProvider
  );

  return app;
}
