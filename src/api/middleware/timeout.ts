import type { Context, Next } from 'hono';
import log from '../../utils/logging.js';
import { RequestContext, TimeoutUtils } from '../../utils/request-context.js';

/**
 * Timeout configuration for middleware
 */
export interface TimeoutConfig {
  /** Default request timeout in milliseconds */
  defaultTimeoutMs: number;
  /** Maximum allowed request timeout in milliseconds */
  maxTimeoutMs: number;
  /** Minimum allowed request timeout in milliseconds */
  minTimeoutMs: number;
  /** Per-endpoint timeout overrides */
  endpointTimeouts?: Record<string, number>;
  /** Whether to include timeout headers in response */
  includeTimeoutHeaders: boolean;
}

/**
 * Default timeout configuration
 */
const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  defaultTimeoutMs: 60000, // 60 seconds
  maxTimeoutMs: 300000,    // 5 minutes
  minTimeoutMs: 1000,      // 1 second
  includeTimeoutHeaders: true,
};

/**
 * Request timeout middleware for Hono
 * Provides global request timeout enforcement with deadline propagation
 */
export function timeoutMiddleware(config: Partial<TimeoutConfig> = {}) {
  const timeoutConfig: TimeoutConfig = { ...DEFAULT_TIMEOUT_CONFIG, ...config };

  return async (c: Context, next: Next) => {
    const startTime = Date.now();
    const requestPath = c.req.path;
    const requestMethod = c.req.method;
    
    // Determine timeout for this request
    const timeoutMs = determineRequestTimeout(requestPath, requestMethod, timeoutConfig);
    
    // Create request context with deadline tracking
    const requestContext = new RequestContext(timeoutMs);
    
    // Store context in Hono context for use by handlers
    c.set('requestContext', requestContext);
    c.set('requestId', requestContext.requestId);
    
    // Add timeout headers if enabled
    if (timeoutConfig.includeTimeoutHeaders) {
      c.header('X-Request-Timeout-Ms', timeoutMs.toString());
      c.header('X-Request-Id', requestContext.requestId);
    }

    // Create timeout promise that rejects when deadline is exceeded
    const timeoutPromise = new Promise<never>((_, reject) => {
      requestContext.signal.addEventListener('abort', () => {
        const elapsed = Date.now() - startTime;
        const reason = requestContext.signal.reason || 'Request timeout';
        
        log.warn(
          `Request timeout: ${requestMethod} ${requestPath} - ${reason} after ${elapsed}ms (timeout: ${timeoutMs}ms, request ID: ${requestContext.requestId})`
        );
        
        reject(TimeoutUtils.createTimeoutError(requestContext, 'Request'));
      });
    });

    try {
      // Race between the actual request processing and timeout
      await Promise.race([
        next(),
        timeoutPromise,
      ]);

      // Add response headers with timing information
      if (timeoutConfig.includeTimeoutHeaders && !requestContext.isAborted) {
        const elapsed = Date.now() - startTime;
        const remaining = requestContext.remainingTime;
        
        c.header('X-Request-Elapsed-Ms', elapsed.toString());
        c.header('X-Request-Remaining-Ms', remaining.toString());
      }

    } catch (error) {
      // Handle timeout errors specially
      if (error instanceof Error && error.message.includes('timed out')) {
        const elapsed = Date.now() - startTime;
        
        return c.json(
          {
            error: {
              message: `Request timeout after ${elapsed}ms`,
              type: 'timeout_error',
              code: 'request_timeout',
              details: {
                timeoutMs,
                elapsedMs: elapsed,
                requestId: requestContext.requestId,
              },
            },
          },
          408 // Request Timeout
        );
      }
      
      // Re-throw other errors
      throw error;
    }
  };
}

/**
 * Determine appropriate timeout for a request based on path and method
 */
function determineRequestTimeout(
  path: string,
  method: string,
  config: TimeoutConfig
): number {
  // Check for endpoint-specific timeouts
  if (config.endpointTimeouts) {
    const endpointKey = `${method.toUpperCase()} ${path}`;
    const pathOnlyKey = path;
    
    // Try exact match first (METHOD /path)
    if (config.endpointTimeouts[endpointKey]) {
      return validateTimeout(config.endpointTimeouts[endpointKey], config);
    }
    
    // Try path-only match
    if (config.endpointTimeouts[pathOnlyKey]) {
      return validateTimeout(config.endpointTimeouts[pathOnlyKey], config);
    }
    
    // Try pattern matching for common endpoints
    for (const [pattern, timeout] of Object.entries(config.endpointTimeouts)) {
      if (path.match(new RegExp(pattern.replace('*', '.*')))) {
        return validateTimeout(timeout, config);
      }
    }
  }

  // Determine timeout based on endpoint type
  if (path.includes('/chat/completions') || path.includes('/completions')) {
    // Longer timeout for LLM completions (they can take time)
    return validateTimeout(config.defaultTimeoutMs * 2, config);
  }

  if (path.includes('/admin/')) {
    // Shorter timeout for admin endpoints
    return validateTimeout(config.defaultTimeoutMs / 2, config);
  }

  if (path === '/health') {
    // Very short timeout for health checks
    return validateTimeout(5000, config); // 5 seconds
  }

  // Use default timeout
  return validateTimeout(config.defaultTimeoutMs, config);
}

/**
 * Validate and clamp timeout value to configured limits
 */
function validateTimeout(timeoutMs: number, config: TimeoutConfig): number {
  return Math.max(
    config.minTimeoutMs,
    Math.min(config.maxTimeoutMs, timeoutMs)
  );
}

/**
 * Helper function to get request context from Hono context
 */
export function getRequestContext(c: Context): RequestContext | undefined {
  return c.get('requestContext') as RequestContext | undefined;
}

/**
 * Helper function to get request ID from Hono context
 */
export function getRequestId(c: Context): string | undefined {
  return c.get('requestId') as string | undefined;
}

/**
 * Timeout middleware factory with common configurations
 */
export const timeoutMiddlewareFactory = {
  /**
   * Development configuration with longer timeouts
   */
  development: (overrides: Partial<TimeoutConfig> = {}) =>
    timeoutMiddleware({
      defaultTimeoutMs: 120000, // 2 minutes
      maxTimeoutMs: 600000,     // 10 minutes
      includeTimeoutHeaders: true,
      ...overrides,
    }),

  /**
   * Production configuration with optimised timeouts
   */
  production: (overrides: Partial<TimeoutConfig> = {}) =>
    timeoutMiddleware({
      defaultTimeoutMs: 60000,  // 1 minute
      maxTimeoutMs: 300000,     // 5 minutes
      includeTimeoutHeaders: false,
      endpointTimeouts: {
        '/health': 5000,
        '/v1/models': 10000,
        '/v1/chat/completions': 120000,
        '/v1/completions': 120000,
        '/admin/*': 30000,
      },
      ...overrides,
    }),

  /**
   * High-throughput configuration with aggressive timeouts
   */
  highThroughput: (overrides: Partial<TimeoutConfig> = {}) =>
    timeoutMiddleware({
      defaultTimeoutMs: 30000,  // 30 seconds
      maxTimeoutMs: 120000,     // 2 minutes
      includeTimeoutHeaders: false,
      endpointTimeouts: {
        '/health': 2000,
        '/v1/models': 5000,
        '/v1/chat/completions': 60000,
        '/v1/completions': 60000,
        '/admin/*': 15000,
      },
      ...overrides,
    }),
};