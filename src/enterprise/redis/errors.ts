/**
 * Redis-specific error classes for enterprise functionality
 */

export class RedisError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'RedisError';
    
    if (cause instanceof Error) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

export class RedisConnectionError extends RedisError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'RedisConnectionError';
  }
}

export class RedisOperationError extends RedisError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'RedisOperationError';
  }
}

export class ConfigValidationError extends RedisError {
  constructor(message: string, public validationErrors?: string[]) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

export class ConfigSyncError extends RedisError {
  constructor(message: string, public configVersion?: string, cause?: unknown) {
    super(message, cause);
    this.name = 'ConfigSyncError';
  }
}

export function isRedisConnectionError(error: unknown): error is RedisConnectionError {
  return error instanceof RedisConnectionError;
}

export function isConfigValidationError(error: unknown): error is ConfigValidationError {
  return error instanceof ConfigValidationError;
}

export function formatRedisError(error: unknown): string {
  if (error instanceof RedisError) {
    return `${error.name}: ${error.message}`;
  }
  
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  
  return `Unknown error: ${String(error)}`;
}