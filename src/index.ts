import { Hono } from 'hono';
import { showRoutes } from 'hono/dev';
import log from './utils/logging.js';
import { getConfig } from './config.js';
import { createRoutes } from './api/routes.js';
import { loggingMiddleware } from './api/middleware/logging.js';
import { corsMiddleware } from './api/middleware/cors.js';
import { timeoutMiddlewareFactory } from './api/middleware/timeout.js';
import { CredentialManager } from './credentials/managers/credential-manager.js';
import { initializeRouter } from './utils/enhanced-router.js';
import { toErrorResponse } from './types/shared/errors.js';
import type { ICredentialStoreEntry } from './credentials/types/credential-types.js';

async function startServer() {
  // Load configuration (async to support enterprise mode)
  log.info('Starting LLM Router...');
  const config = await getConfig();
  
  log.info(`Configuration:
    - Server: ${config.server.hostname}:${config.server.port}
    - Models: ${Object.keys(config.models.definitions).length} configured
    - Default Model: ${config.models.defaultModel}
    - Log Level: ${config.log.level}`);

  if (Object.keys(config.models.definitions).length === 0) {
    log.warn(
      'Warning: No model definitions found! Server will start but no models will be available.'
    );
  }

  // Initialize credential manager if credential stores are configured
  let credentialManager: CredentialManager | undefined;

  log.debug('Checking for credential store configuration...', {
    hasCredentialStores: !!config.credentialStores,
    credentialStoreCount: config.credentialStores ? Object.keys(config.credentialStores).length : 0,
    credentialStoreKeys: config.credentialStores ? Object.keys(config.credentialStores) : [],
  });

  if (config.credentialStores && Object.keys(config.credentialStores).length > 0) {
    log.info(
      `Initializing credential manager with ${Object.keys(config.credentialStores).length} stores...`
    );

    credentialManager = new CredentialManager();

    try {
      await credentialManager.initialize(config.credentialStores);
      log.info('Credential manager initialized successfully');

      // Log credential store status
      const storeEntries: ICredentialStoreEntry[] = credentialManager.getCredentialStoreEntries();
      for (const entry of storeEntries) {
        const logData: Record<string, unknown> = {};
        if (entry.errorMessage) {
          logData.errorMessage = entry.errorMessage;
        }
        log.info(
          `- ${entry.id}: ${entry.config.type} (${entry.config.source}) - Status: ${entry.status}`,
          logData
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error(`Failed to initialize credential manager: ${message}`);
      log.warn('Continuing without credential manager - will use legacy direct API key mode');
      credentialManager = undefined;
    }
  } else {
    log.info('No credential stores configured - using legacy direct API key mode');
    log.debug('To use credential stores, provide credential store configuration via:');
    log.debug('1. definitions.json file with credentialStores section, OR');
    log.debug('2. MODEL_DEFINITIONS environment variable with credentialStores, OR');
    log.debug('3. Test environment variables (TEST_OPENAI_API_KEY, TEST_ANTHROPIC_API_KEY, etc.)');
  }

  // Initialize the enhanced model router with credential manager
  log.info('Initializing enhanced model router...');
  await initializeRouter(credentialManager);
  log.info('Enhanced model router initialized successfully');

  const app = new Hono();

  // Apply timeout middleware first (before other middleware that might need request context)
  if (config.timeout?.enabled !== false) {
    const timeoutMiddleware = process.env.NODE_ENV === 'production' 
      ? timeoutMiddlewareFactory.production() 
      : timeoutMiddlewareFactory.development();
    app.use('*', timeoutMiddleware);
  }

  app.use('*', corsMiddleware);
  app.use('*', loggingMiddleware);

  // Basic health check endpoint
  app.get('/health', (c) => {
    return c.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      models: Object.keys(config.models.definitions),
      server: {
        hostname: config.server.hostname,
        port: config.server.port,
      },
    });
  });

  const routes = createRoutes();
  app.route('/', routes);

  app.notFound((c) => {
    return c.json(
      {
        error: {
          message: 'Endpoint not found',
          type: 'invalid_request_error',
          code: 'not_found',
        },
      },
      404
    );
  });

  app.onError((err, c) => {
    log.error(err instanceof Error ? err : new Error(String(err)), 'Unhandled error');
    const { response, statusCode } = toErrorResponse(err);
    return c.json(response, statusCode as 200 | 400 | 401 | 403 | 404 | 429 | 500 | 502 | 503);
  });

  let server: { stop(): void } | undefined;

  try {
    server = Bun.serve({
      port: config.server.port,
      hostname: config.server.hostname,
      fetch: app.fetch,
    });

    // Show all registered routes on startup
    log.info('Registered Routes:');
    showRoutes(app, { verbose: true });

    const serverUrl = `http://${config.server.hostname}:${config.server.port}`;
    log.info(`✅ LLM Router server running on ${serverUrl}`);
    log.info(`🔗 Health check available at: ${serverUrl}/health`);
    log.info(
      `📦 Available models: ${Object.keys(config.models.definitions).join(', ') || 'none configured'}`
    );
    log.info('Server is ready to handle requests!');
  } catch (error) {
    log.error(error instanceof Error ? error : new Error(String(error)), 'Failed to start server');
    process.exit(1);
  }

  return server;
}

// Start the server
let serverInstance: { stop(): void } | undefined;
try {
  serverInstance = await startServer();
} catch (error) {
  log.error(
    error instanceof Error ? error : new Error(String(error)),
    '❌ Failed to start application'
  );
  process.exit(1);
}

process.on('SIGINT', () => {
  log.info('Shutting down gracefully...');
  if (serverInstance) {
    serverInstance.stop();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  log.info('Shutting down gracefully...');
  if (serverInstance) {
    serverInstance.stop();
  }
  process.exit(0);
});
