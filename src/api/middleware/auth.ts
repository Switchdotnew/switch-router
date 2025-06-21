import type { Context, Next } from 'hono';
import log from '../../utils/logging.js';

/**
 * Authentication middleware for API key validation
 * Checks x-api-key header against comma-separated ADMIN_API_KEY environment variable
 */
export function authMiddleware() {
  // Parse comma-separated API keys from environment
  const adminApiKeys =
    process.env.ADMIN_API_KEY?.split(',')
      .map((key) => key.trim())
      .filter(Boolean) || [];

  if (adminApiKeys.length === 0) {
    log.warn('No ADMIN_API_KEY configured - authentication middleware will reject all requests');
  } else {
    log.info(`Authentication middleware configured with ${adminApiKeys.length} API key(s)`);
  }

  return async (c: Context, next: Next) => {
    const apiKey = c.req.header('x-api-key');

    if (!apiKey) {
      log.warn('Authentication failed: Missing x-api-key header');
      return c.json(
        {
          error: {
            message: 'Authentication required',
            type: 'authentication_error',
            code: 'missing_api_key',
          },
        },
        401
      );
    }

    if (!adminApiKeys.includes(apiKey)) {
      log.warn('Authentication failed: Invalid API key');
      return c.json(
        {
          error: {
            message: 'Invalid API key',
            type: 'authentication_error',
            code: 'invalid_api_key',
          },
        },
        401
      );
    }

    // Authentication successful, proceed to next middleware/handler
    await next();
  };
}

/**
 * Optional authentication middleware - only applies auth if ADMIN_API_KEY is configured
 * Useful for development environments where auth might not be set up
 */
export function optionalAuthMiddleware() {
  const adminApiKeys =
    process.env.ADMIN_API_KEY?.split(',')
      .map((key) => key.trim())
      .filter(Boolean) || [];

  if (adminApiKeys.length === 0) {
    log.info('No ADMIN_API_KEY configured - skipping authentication');
    return async (c: Context, next: Next) => {
      await next();
    };
  }

  return authMiddleware();
}
