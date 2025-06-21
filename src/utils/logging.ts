/**
 * Logging utilities with pino integration
 */

import pino from 'pino';

// Performance-aware logging configuration
function createLoggerConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  const disablePretty = process.env.DISABLE_PRETTY_LOGGING === 'true' || isProduction;
  const level = process.env.LOG_LEVEL || 'info';

  // High-performance production config (no pretty printing)
  if (disablePretty) {
    return {
      level,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label: string) => ({ level: label }),
      },
    };
  }

  // Development config with pretty printing
  return {
    level,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  };
}

// Create logger instance with performance-optimised configuration
const log = pino(createLoggerConfig());

// Default export for compatibility
export default log;

/**
 * LogContext type for structured logging
 */
export type LogContext = Record<string, string | number | boolean | undefined | null>;

/**
 * Safely converts unknown values to LogContext
 */
export function toLogContext(value: unknown): LogContext | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    return { message: value };
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return { value: value };
  }

  if (typeof value === 'object') {
    const context: LogContext = {};

    for (const [key, val] of Object.entries(value)) {
      if (
        typeof val === 'string' ||
        typeof val === 'number' ||
        typeof val === 'boolean' ||
        val === null ||
        val === undefined
      ) {
        context[key] = val;
      } else {
        // Convert complex objects to string
        context[key] = JSON.stringify(val);
      }
    }

    return context;
  }

  return { value: String(value) };
}

/**
 * Safely logs an error with proper context
 */
export function logError(error: unknown, message: string, context?: unknown): void {
  const logContext = context ? toLogContext(context) : undefined;

  if (error instanceof Error) {
    log.error({ err: error, ...logContext }, message);
  } else {
    log.error({ error: String(error), ...logContext }, message);
  }
}

/**
 * Safely logs a warning with proper context
 */
export function logWarn(message: string, context?: unknown): void {
  const logContext = context ? toLogContext(context) : undefined;
  log.warn(logContext, message);
}

/**
 * Safely logs info with proper context
 */
export function logInfo(message: string, context?: unknown): void {
  const logContext = context ? toLogContext(context) : undefined;
  log.info(logContext, message);
}

/**
 * Safely logs debug with proper context
 */
export function logDebug(message: string, context?: unknown): void {
  const logContext = context ? toLogContext(context) : undefined;
  log.debug(logContext, message);
}

/**
 * Converts an Error object to a safe log context
 */
export function errorToLogContext(error: unknown): LogContext {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack || 'No stack trace available',
    };
  }

  return {
    error: String(error),
  };
}

/**
 * Safely handles metrics snapshots for logging
 */
export function metricsToLogContext(metrics: object): LogContext {
  const context: LogContext = {};

  for (const [key, value] of Object.entries(metrics)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      context[key] = value;
    } else if (value === null || value === undefined) {
      context[key] = value;
    } else {
      // Convert complex values to JSON strings
      context[key] = JSON.stringify(value);
    }
  }

  return context;
}
