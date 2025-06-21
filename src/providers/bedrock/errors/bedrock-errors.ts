// Comprehensive Bedrock error handling and mapping
// Provides production-ready error classification and recovery strategies

import type { Domains } from '../../../types/index.js';
import { ProviderError } from '../../../types/shared/errors.js';

/**
 * Bedrock-specific error codes
 */
export enum BedrockErrorCode {
  // Authentication & Authorization
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',

  // Rate Limiting & Quotas
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  THROTTLED = 'THROTTLED',

  // Model & Service
  MODEL_NOT_READY = 'MODEL_NOT_READY',
  MODEL_NOT_SUPPORTED = 'MODEL_NOT_SUPPORTED',
  MODEL_TIMEOUT = 'MODEL_TIMEOUT',
  MODEL_OVERLOADED = 'MODEL_OVERLOADED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // Request & Validation
  INVALID_REQUEST = 'INVALID_REQUEST',
  INVALID_MODEL_INPUT = 'INVALID_MODEL_INPUT',
  CONTENT_POLICY_VIOLATION = 'CONTENT_POLICY_VIOLATION',
  REQUEST_TOO_LARGE = 'REQUEST_TOO_LARGE',
  INVALID_PARAMETER = 'INVALID_PARAMETER',

  // Streaming & Connection
  STREAM_ERROR = 'STREAM_ERROR',
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',

  // Resource & Configuration
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  REGION_NOT_SUPPORTED = 'REGION_NOT_SUPPORTED',
  ENDPOINT_NOT_FOUND = 'ENDPOINT_NOT_FOUND',

  // Internal & Unknown
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Error recovery strategy
 */
export interface IErrorRecoveryStrategy {
  retryable: boolean;
  retryDelay?: number;
  maxRetries?: number;
  backoffMultiplier?: number;
  requiresCircuitBreaker?: boolean;
  shouldFallback?: boolean;
  recoverAfter?: number; // milliseconds
}

/**
 * Bedrock error mapping entry
 */
export interface IBedrockErrorMapping {
  code: BedrockErrorCode;
  httpStatus: number;
  userMessage: string;
  recovery: IErrorRecoveryStrategy;
  isClientError: boolean;
  isServerError: boolean;
  isRateLimit: boolean;
  isTemporary: boolean;
}

/**
 * Comprehensive Bedrock error mappings
 */
export class BedrockErrorMapper {
  private static readonly ERROR_MAPPINGS: Record<string, IBedrockErrorMapping> = {
    // AWS Authentication Errors
    UnauthorizedOperation: {
      code: BedrockErrorCode.AUTHENTICATION_ERROR,
      httpStatus: 401,
      userMessage: 'AWS credentials are invalid or insufficient permissions',
      recovery: { retryable: false, shouldFallback: true },
      isClientError: true,
      isServerError: false,
      isRateLimit: false,
      isTemporary: false,
    },

    InvalidSignatureException: {
      code: BedrockErrorCode.AUTHENTICATION_ERROR,
      httpStatus: 403,
      userMessage: 'AWS request signature is invalid',
      recovery: { retryable: false, shouldFallback: true },
      isClientError: true,
      isServerError: false,
      isRateLimit: false,
      isTemporary: false,
    },

    TokenRefreshRequired: {
      code: BedrockErrorCode.TOKEN_EXPIRED,
      httpStatus: 401,
      userMessage: 'AWS token has expired and needs refresh',
      recovery: { retryable: true, retryDelay: 1000, maxRetries: 1 },
      isClientError: true,
      isServerError: false,
      isRateLimit: false,
      isTemporary: true,
    },

    ExpiredTokenException: {
      code: BedrockErrorCode.TOKEN_EXPIRED,
      httpStatus: 401,
      userMessage: 'AWS token has expired',
      recovery: { retryable: true, retryDelay: 1000, maxRetries: 1 },
      isClientError: true,
      isServerError: false,
      isRateLimit: false,
      isTemporary: true,
    },

    AccessDeniedException: {
      code: BedrockErrorCode.PERMISSION_DENIED,
      httpStatus: 403,
      userMessage: 'Access denied for the requested Bedrock operation',
      recovery: { retryable: false, shouldFallback: true },
      isClientError: true,
      isServerError: false,
      isRateLimit: false,
      isTemporary: false,
    },

    // Rate Limiting Errors
    ThrottlingException: {
      code: BedrockErrorCode.THROTTLED,
      httpStatus: 429,
      userMessage: 'Request was throttled by AWS Bedrock',
      recovery: {
        retryable: true,
        retryDelay: 2000,
        maxRetries: 5,
        backoffMultiplier: 2,
        requiresCircuitBreaker: true,
      },
      isClientError: true,
      isServerError: false,
      isRateLimit: true,
      isTemporary: true,
    },

    TooManyRequestsException: {
      code: BedrockErrorCode.RATE_LIMIT_EXCEEDED,
      httpStatus: 429,
      userMessage: 'Too many requests sent to AWS Bedrock',
      recovery: {
        retryable: true,
        retryDelay: 5000,
        maxRetries: 3,
        backoffMultiplier: 2,
        requiresCircuitBreaker: true,
      },
      isClientError: true,
      isServerError: false,
      isRateLimit: true,
      isTemporary: true,
    },

    ServiceQuotaExceededException: {
      code: BedrockErrorCode.QUOTA_EXCEEDED,
      httpStatus: 429,
      userMessage: 'AWS service quota exceeded',
      recovery: { retryable: false, requiresCircuitBreaker: true, shouldFallback: true },
      isClientError: true,
      isServerError: false,
      isRateLimit: true,
      isTemporary: false,
    },

    // Model Errors
    ModelNotReadyException: {
      code: BedrockErrorCode.MODEL_NOT_READY,
      httpStatus: 503,
      userMessage: 'Bedrock model is not ready or still loading',
      recovery: {
        retryable: true,
        retryDelay: 10000,
        maxRetries: 3,
        recoverAfter: 30000,
      },
      isClientError: false,
      isServerError: true,
      isRateLimit: false,
      isTemporary: true,
    },

    ModelStreamErrorException: {
      code: BedrockErrorCode.STREAM_ERROR,
      httpStatus: 500,
      userMessage: 'Error occurred during model streaming',
      recovery: { retryable: true, retryDelay: 1000, maxRetries: 2 },
      isClientError: false,
      isServerError: true,
      isRateLimit: false,
      isTemporary: true,
    },

    ModelTimeoutException: {
      code: BedrockErrorCode.MODEL_TIMEOUT,
      httpStatus: 504,
      userMessage: 'Model request timed out',
      recovery: {
        retryable: true,
        retryDelay: 2000,
        maxRetries: 2,
        shouldFallback: true,
      },
      isClientError: false,
      isServerError: true,
      isRateLimit: false,
      isTemporary: true,
    },

    // Validation Errors
    ValidationException: {
      code: BedrockErrorCode.INVALID_REQUEST,
      httpStatus: 400,
      userMessage: 'Request validation failed',
      recovery: { retryable: false },
      isClientError: true,
      isServerError: false,
      isRateLimit: false,
      isTemporary: false,
    },

    ModelNotSupportedException: {
      code: BedrockErrorCode.MODEL_NOT_SUPPORTED,
      httpStatus: 400,
      userMessage: 'The specified model is not supported',
      recovery: { retryable: false, shouldFallback: true },
      isClientError: true,
      isServerError: false,
      isRateLimit: false,
      isTemporary: false,
    },

    ResourceNotFoundException: {
      code: BedrockErrorCode.RESOURCE_NOT_FOUND,
      httpStatus: 404,
      userMessage: 'The requested resource was not found',
      recovery: { retryable: false, shouldFallback: true },
      isClientError: true,
      isServerError: false,
      isRateLimit: false,
      isTemporary: false,
    },

    // Content Policy Violations
    ContentPolicyViolationException: {
      code: BedrockErrorCode.CONTENT_POLICY_VIOLATION,
      httpStatus: 400,
      userMessage: 'Content violates AWS Bedrock usage policies',
      recovery: { retryable: false },
      isClientError: true,
      isServerError: false,
      isRateLimit: false,
      isTemporary: false,
    },

    // Service Errors
    InternalServerException: {
      code: BedrockErrorCode.INTERNAL_ERROR,
      httpStatus: 500,
      userMessage: 'Internal server error occurred',
      recovery: {
        retryable: true,
        retryDelay: 5000,
        maxRetries: 3,
        backoffMultiplier: 2,
        shouldFallback: true,
      },
      isClientError: false,
      isServerError: true,
      isRateLimit: false,
      isTemporary: true,
    },

    ServiceUnavailableException: {
      code: BedrockErrorCode.SERVICE_UNAVAILABLE,
      httpStatus: 503,
      userMessage: 'AWS Bedrock service is temporarily unavailable',
      recovery: {
        retryable: true,
        retryDelay: 10000,
        maxRetries: 3,
        requiresCircuitBreaker: true,
        shouldFallback: true,
      },
      isClientError: false,
      isServerError: true,
      isRateLimit: false,
      isTemporary: true,
    },
  };

  /**
   * Map AWS error to Bedrock error information
   */
  public static mapError(awsErrorCode: string, httpStatus?: number): IBedrockErrorMapping {
    const mapping = this.ERROR_MAPPINGS[awsErrorCode];

    if (mapping) {
      return mapping;
    }

    // Fallback mapping based on HTTP status
    if (httpStatus) {
      return this.mapByHttpStatus(httpStatus, awsErrorCode);
    }

    // Default unknown error
    return {
      code: BedrockErrorCode.UNKNOWN_ERROR,
      httpStatus: 500,
      userMessage: `Unknown AWS error: ${awsErrorCode}`,
      recovery: { retryable: false, shouldFallback: true },
      isClientError: false,
      isServerError: true,
      isRateLimit: false,
      isTemporary: false,
    };
  }

  /**
   * Map error by HTTP status code
   */
  private static mapByHttpStatus(httpStatus: number, errorCode: string): IBedrockErrorMapping {
    if (httpStatus >= 400 && httpStatus < 500) {
      return {
        code: BedrockErrorCode.INVALID_REQUEST,
        httpStatus,
        userMessage: `Client error: ${errorCode}`,
        recovery: { retryable: httpStatus === 429, shouldFallback: true },
        isClientError: true,
        isServerError: false,
        isRateLimit: httpStatus === 429,
        isTemporary: httpStatus === 429,
      };
    }

    if (httpStatus >= 500) {
      return {
        code: BedrockErrorCode.INTERNAL_ERROR,
        httpStatus,
        userMessage: `Server error: ${errorCode}`,
        recovery: {
          retryable: true,
          retryDelay: 5000,
          maxRetries: 3,
          shouldFallback: true,
        },
        isClientError: false,
        isServerError: true,
        isRateLimit: false,
        isTemporary: true,
      };
    }

    return {
      code: BedrockErrorCode.UNKNOWN_ERROR,
      httpStatus,
      userMessage: `Unknown error: ${errorCode}`,
      recovery: { retryable: false, shouldFallback: true },
      isClientError: false,
      isServerError: false,
      isRateLimit: false,
      isTemporary: false,
    };
  }

  /**
   * Check if error is retryable
   */
  public static isRetryable(awsErrorCode: string): boolean {
    const mapping = this.mapError(awsErrorCode);
    return mapping.recovery.retryable;
  }

  /**
   * Check if error is a rate limit
   */
  public static isRateLimit(awsErrorCode: string): boolean {
    const mapping = this.mapError(awsErrorCode);
    return mapping.isRateLimit;
  }

  /**
   * Check if error should trigger circuit breaker
   */
  public static shouldTriggerCircuitBreaker(awsErrorCode: string): boolean {
    const mapping = this.mapError(awsErrorCode);
    return mapping.recovery.requiresCircuitBreaker || false;
  }

  /**
   * Check if error should trigger fallback
   */
  public static shouldFallback(awsErrorCode: string): boolean {
    const mapping = this.mapError(awsErrorCode);
    return mapping.recovery.shouldFallback || false;
  }

  /**
   * Get retry delay for error
   */
  public static getRetryDelay(awsErrorCode: string, attempt: number): number {
    const mapping = this.mapError(awsErrorCode);
    const baseDelay = mapping.recovery.retryDelay || 1000;
    const multiplier = mapping.recovery.backoffMultiplier || 1;

    return Math.min(baseDelay * Math.pow(multiplier, attempt), 30000); // Max 30 seconds
  }

  /**
   * Get maximum retry attempts for error
   */
  public static getMaxRetries(awsErrorCode: string): number {
    const mapping = this.mapError(awsErrorCode);
    return mapping.recovery.maxRetries || 0;
  }
}

/**
 * Bedrock error class
 */
export class BedrockError extends ProviderError {
  public readonly isRetryable: boolean;
  public readonly isRateLimit: boolean;
  public readonly shouldFallback: boolean;
  public readonly provider = 'bedrock';
  public readonly shouldOpenCircuitBreaker: boolean;

  constructor(
    awsErrorCode: string,
    message?: string,
    httpStatus?: number,
    metadata: Record<string, unknown> = {}
  ) {
    const mapping = BedrockErrorMapper.mapError(awsErrorCode, httpStatus);

    super(
      message || mapping.userMessage,
      mapping.code,
      mapping.httpStatus,
      mapping.recovery.retryable,
      {
        ...metadata,
        awsErrorCode,
        originalMessage: message,
        mapping,
      },
      mapping.isRateLimit
    );

    this.isRetryable = mapping.recovery.retryable;
    this.isRateLimit = mapping.isRateLimit;
    this.shouldFallback = mapping.recovery.shouldFallback || false;
    this.shouldOpenCircuitBreaker = mapping.recovery.requiresCircuitBreaker || false;

    // Maintain proper stack trace
    Object.setPrototypeOf(this, BedrockError.prototype);
    this.name = 'BedrockError';
  }

  /**
   * Create BedrockError from AWS response
   */
  public static fromAWSResponse(response: Response, errorData?: any): BedrockError {
    let awsErrorCode = 'UnknownError';
    let message = 'Unknown AWS error occurred';

    if (errorData) {
      awsErrorCode = errorData.__type || errorData.code || errorData.errorType || awsErrorCode;
      message = errorData.message || message;
    }

    return new BedrockError(awsErrorCode, message, response.status, {
      url: response.url,
      headers: Object.fromEntries(response.headers.entries()),
      errorData,
    });
  }

  /**
   * Create BedrockError from network error
   */
  public static fromNetworkError(error: Error): BedrockError {
    return new BedrockError('NetworkError', `Network error: ${error.message}`, 0, {
      originalError: error.message,
      stack: error.stack,
    });
  }

  /**
   * Create BedrockError from timeout
   */
  public static fromTimeout(timeoutMs: number): BedrockError {
    return new BedrockError('TimeoutError', `Request timed out after ${timeoutMs}ms`, 408, {
      timeoutMs,
    });
  }

  /**
   * Get retry information for this error
   */
  public getRetryInfo(attempt: number): {
    canRetry: boolean;
    delay: number;
    maxRetries: number;
  } {
    const awsErrorCode = this.metadata?.awsErrorCode as string;

    return {
      canRetry: this.isRetryable,
      delay: BedrockErrorMapper.getRetryDelay(awsErrorCode, attempt),
      maxRetries: BedrockErrorMapper.getMaxRetries(awsErrorCode),
    };
  }

  /**
   * Convert to standard provider error format
   */
  public toProviderError(): Domains.ProviderError {
    return new ProviderError(
      this.message,
      this.code,
      this.statusCode,
      this.isRetryable,
      this.metadata,
      this.isRateLimit
    );
  }
}

/**
 * Error recovery utilities
 */
export class BedrockErrorRecovery {
  /**
   * Calculate next retry delay with jitter
   */
  public static calculateRetryDelay(
    baseDelay: number,
    attempt: number,
    multiplier: number = 2,
    jitter: boolean = true
  ): number {
    const delay = baseDelay * Math.pow(multiplier, attempt);
    const maxDelay = 30000; // 30 seconds max

    let finalDelay = Math.min(delay, maxDelay);

    if (jitter) {
      // Add ±25% jitter to prevent thundering herd
      const jitterAmount = finalDelay * 0.25;
      finalDelay += (Math.random() - 0.5) * 2 * jitterAmount;
    }

    return Math.max(finalDelay, 100); // Minimum 100ms delay
  }

  /**
   * Determine if request should be retried
   */
  public static shouldRetry(error: BedrockError, attempt: number, maxAttempts: number): boolean {
    if (attempt >= maxAttempts) {
      return false;
    }

    if (!error.isRetryable) {
      return false;
    }

    const retryInfo = error.getRetryInfo(attempt);
    if (retryInfo.maxRetries > 0 && attempt >= retryInfo.maxRetries) {
      return false;
    }

    return true;
  }

  /**
   * Create recovery strategy for error
   */
  public static createRecoveryStrategy(error: BedrockError): {
    retry: boolean;
    fallback: boolean;
    circuitBreaker: boolean;
    delay: number;
  } {
    const awsErrorCode = error.metadata?.awsErrorCode as string;
    const mapping = BedrockErrorMapper.mapError(awsErrorCode);

    return {
      retry: mapping.recovery.retryable,
      fallback: mapping.recovery.shouldFallback || false,
      circuitBreaker: mapping.recovery.requiresCircuitBreaker || false,
      delay: mapping.recovery.retryDelay || 1000,
    };
  }
}

// Types are already exported above
