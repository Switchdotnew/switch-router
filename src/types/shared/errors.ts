// Error classification for circuit breaker decisions
export enum ErrorClassification {
  TEMPORARY = 'temporary', // Retryable errors (5xx, timeouts, network issues)
  PERMANENT = 'permanent', // Non-retryable errors (404, 401, 403)
  RATE_LIMIT = 'rate_limit', // Rate limiting (429)
  AUTHENTICATION = 'authentication', // Auth failures (401, 403)
  NOT_FOUND = 'not_found', // Resource not found (404)
  SERVER_ERROR = 'server_error', // Server errors (5xx)
  CLIENT_ERROR = 'client_error', // Client errors (4xx except auth/rate limit)
  NETWORK_ERROR = 'network_error', // Network/connection issues
  TIMEOUT = 'timeout', // Request timeouts
  UNKNOWN = 'unknown', // Unknown/unclassified errors
}

// HTTP status code to error classification mapping
export const STATUS_CODE_CLASSIFICATION: Record<number, ErrorClassification> = {
  // 4xx Client Errors
  400: ErrorClassification.CLIENT_ERROR, // Bad Request
  401: ErrorClassification.AUTHENTICATION, // Unauthorized - immediate failure
  403: ErrorClassification.AUTHENTICATION, // Forbidden - immediate failure
  404: ErrorClassification.NOT_FOUND, // Not Found - immediate failure
  408: ErrorClassification.TIMEOUT, // Request Timeout
  429: ErrorClassification.RATE_LIMIT, // Too Many Requests

  // 5xx Server Errors (temporary, retryable)
  500: ErrorClassification.SERVER_ERROR, // Internal Server Error
  502: ErrorClassification.SERVER_ERROR, // Bad Gateway
  503: ErrorClassification.SERVER_ERROR, // Service Unavailable
  504: ErrorClassification.TIMEOUT, // Gateway Timeout
  505: ErrorClassification.SERVER_ERROR, // HTTP Version Not Supported
};

// Determine if an error classification should trigger immediate circuit breaker trip
export function shouldTripImmediately(classification: ErrorClassification): boolean {
  return [ErrorClassification.NOT_FOUND, ErrorClassification.AUTHENTICATION].includes(
    classification
  );
}

// Determine if an error is retryable
export function isRetryableError(classification: ErrorClassification): boolean {
  return [
    ErrorClassification.TEMPORARY,
    ErrorClassification.SERVER_ERROR,
    ErrorClassification.TIMEOUT,
    ErrorClassification.NETWORK_ERROR,
    ErrorClassification.RATE_LIMIT, // Rate limits are retryable after delay
    ErrorClassification.CLIENT_ERROR, // Client errors like 403 should allow failover
  ].includes(classification);
}

// Classify an HTTP status code
export function classifyHttpError(statusCode: number): ErrorClassification {
  return STATUS_CODE_CLASSIFICATION[statusCode] ?? ErrorClassification.UNKNOWN;
}

// Classify an error object
export function classifyError(error: unknown): ErrorClassification {
  if (error instanceof BaseError) {
    return classifyHttpError(error.statusCode);
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Check for network/timeout errors
    if (message.includes('timeout') || message.includes('aborted')) {
      return ErrorClassification.TIMEOUT;
    }

    if (
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('fetch')
    ) {
      return ErrorClassification.NETWORK_ERROR;
    }

    // Check for specific HTTP status codes in error messages
    const statusMatch = message.match(/(\d{3})/);
    if (statusMatch) {
      const statusCode = parseInt(statusMatch[1]);
      if (statusCode >= 400 && statusCode < 600) {
        return classifyHttpError(statusCode);
      }
    }
  }

  return ErrorClassification.UNKNOWN;
}

export class BaseError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly type: string,
    public readonly statusCode: number = 500,
    public readonly retryable: boolean = false,
    public readonly metadata?: Record<string, unknown>,
    public readonly classification?: ErrorClassification
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends BaseError {
  constructor(message: string) {
    super(message, 'validation_failed', 'invalid_request_error', 400);
  }
}

export class ModelNotFoundError extends BaseError {
  constructor(modelName: string) {
    super(`Model '${modelName}' not found`, 'model_not_found', 'invalid_request_error', 404);
  }
}

export class CapabilityNotSupportedError extends BaseError {
  constructor(modelName: string, capability: string) {
    super(
      `Model '${modelName}' does not support ${capability}`,
      'capability_not_supported',
      'invalid_request_error',
      400
    );
  }
}

export class CompletionFailedError extends BaseError {
  constructor(message: string = 'Failed to process completion') {
    super(message, 'completion_failed', 'api_error', 500);
  }
}

export class ProviderError extends BaseError {
  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    retryable: boolean = false,
    public readonly providerSpecific?: Record<string, unknown>,
    public readonly rateLimited: boolean = false
  ) {
    const classification = classifyHttpError(statusCode);
    super(
      message,
      code,
      'provider_error',
      statusCode,
      retryable || isRetryableError(classification),
      providerSpecific,
      classification
    );
  }
}

export class ProviderTimeoutError extends ProviderError {
  constructor(providerName: string, timeout: number) {
    super(`Provider '${providerName}' timed out after ${timeout}ms`, 'provider_timeout', 408, true);
  }
}

export class ProviderRateLimitError extends ProviderError {
  constructor(providerName: string, retryAfter?: number) {
    super(
      `Provider '${providerName}' rate limit exceeded`,
      'provider_rate_limit',
      429,
      true,
      { retryAfter },
      true
    );
  }
}

export class ProviderAuthenticationError extends ProviderError {
  constructor(providerName: string) {
    super(
      `Authentication failed for provider '${providerName}'`,
      'provider_authentication_failed',
      401,
      false
    );
  }
}

export class ProviderConnectionError extends ProviderError {
  constructor(providerName: string, originalError?: Error) {
    super(
      `Failed to connect to provider '${providerName}'`,
      'provider_connection_failed',
      503,
      true,
      { originalError: originalError?.message }
    );
  }
}

export class ProviderNotFoundError extends ProviderError {
  constructor(providerName: string, endpoint?: string) {
    super(
      `Provider endpoint not found: '${providerName}'${endpoint ? ` at ${endpoint}` : ''}`,
      'provider_not_found',
      404,
      false, // Not retryable - endpoint doesn't exist
      { endpoint }
    );
  }
}

export interface ErrorResponse {
  error: {
    message: string;
    type: string;
    code: string;
    retryable?: boolean;
    metadata?: Record<string, unknown>;
  };
}

/**
 * Converts any error to a standardized ErrorResponse
 */
export function toErrorResponse(error: unknown): { response: ErrorResponse; statusCode: number } {
  if (error instanceof BaseError) {
    return {
      response: {
        error: {
          message: error.message,
          type: error.type,
          code: error.code,
          retryable: error.retryable,
          metadata: error.metadata,
        },
      },
      statusCode: error.statusCode,
    };
  }

  // Handle standard errors
  if (error instanceof Error) {
    return {
      response: {
        error: {
          message: error.message,
          type: 'api_error',
          code: 'internal_error',
          retryable: false,
        },
      },
      statusCode: 500,
    };
  }

  // Handle unknown errors
  return {
    response: {
      error: {
        message: 'An unknown error occurred',
        type: 'api_error',
        code: 'unknown_error',
        retryable: false,
      },
    },
    statusCode: 500,
  };
}
