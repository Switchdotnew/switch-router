import log from './logging.js';

/**
 * Request context for tracking deadlines and request lifecycle
 * Provides AbortController integration and deadline management
 */
export interface IRequestContext {
  requestId: string;
  startTime: number;
  deadline: number;
  timeoutMs: number;
  abortController: AbortController;
  signal: AbortSignal;
  isAborted: boolean;
  remainingTime: number;
}

/**
 * Request context implementation with deadline tracking
 */
export class RequestContext implements IRequestContext {
  public readonly requestId: string;
  public readonly startTime: number;
  public readonly deadline: number;
  public readonly timeoutMs: number;
  public readonly abortController: AbortController;
  public readonly signal: AbortSignal;

  constructor(timeoutMs: number, requestId?: string) {
    this.requestId = requestId || this.generateRequestId();
    this.startTime = Date.now();
    this.timeoutMs = timeoutMs;
    this.deadline = this.startTime + timeoutMs;
    this.abortController = new AbortController();
    this.signal = this.abortController.signal;

    // Set up automatic timeout
    setTimeout(() => {
      if (!this.isAborted) {
        this.abort(`Request timeout after ${timeoutMs}ms`);
      }
    }, timeoutMs);
  }

  public get isAborted(): boolean {
    return this.signal.aborted;
  }

  public get remainingTime(): number {
    if (this.isAborted) {
      return 0;
    }
    return Math.max(0, this.deadline - Date.now());
  }

  public abort(reason?: string): void {
    if (!this.isAborted) {
      this.abortController.abort(reason || 'Request aborted');
      log.debug(`Request ${this.requestId} aborted: ${reason || 'No reason provided'}`);
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Timeout utility functions for deadline calculation and validation
 */
export class TimeoutUtils {
  /**
   * Calculate effective timeout considering existing deadline
   */
  public static calculateEffectiveTimeout(
    requestedTimeoutMs: number,
    context?: IRequestContext
  ): number {
    if (!context) {
      return requestedTimeoutMs;
    }

    const remainingTime = context.remainingTime;
    if (remainingTime <= 0) {
      return 0;
    }

    return Math.min(requestedTimeoutMs, remainingTime);
  }

  /**
   * Create a deadline-aware AbortSignal for operations
   */
  public static createDeadlineSignal(
    operationTimeoutMs: number,
    context?: IRequestContext
  ): { signal: AbortSignal; effectiveTimeout: number } {
    const effectiveTimeout = this.calculateEffectiveTimeout(operationTimeoutMs, context);
    
    if (effectiveTimeout <= 0) {
      // Create immediately aborted signal
      const abortController = new AbortController();
      abortController.abort('Deadline exceeded');
      return { signal: abortController.signal, effectiveTimeout: 0 };
    }

    if (context) {
      // Use context signal if available (will abort when request deadline is reached)
      return { signal: context.signal, effectiveTimeout };
    }

    // Create new timeout signal
    const abortController = new AbortController();
    setTimeout(() => {
      abortController.abort(`Operation timeout after ${effectiveTimeout}ms`);
    }, effectiveTimeout);

    return { signal: abortController.signal, effectiveTimeout };
  }

  /**
   * Check if deadline has been exceeded
   */
  public static isDeadlineExceeded(context: IRequestContext): boolean {
    return context.remainingTime <= 0;
  }

  /**
   * Validate that sufficient time remains for operation
   */
  public static validateTimeRemaining(
    context: IRequestContext,
    minimumRequiredMs: number = 100
  ): void {
    if (context.isAborted) {
      throw new Error(`Request ${context.requestId} has been aborted`);
    }

    if (context.remainingTime < minimumRequiredMs) {
      throw new Error(
        `Insufficient time remaining (${context.remainingTime}ms) for operation requiring ${minimumRequiredMs}ms`
      );
    }
  }

  /**
   * Create timeout error with context information
   */
  public static createTimeoutError(context: IRequestContext, operation: string): Error {
    const elapsed = Date.now() - context.startTime;
    return new Error(
      `${operation} timed out after ${elapsed}ms (request timeout: ${context.timeoutMs}ms, request ID: ${context.requestId})`
    );
  }
}

/**
 * Request context manager for creating and tracking contexts
 */
export class RequestContextManager {
  private static activeContexts = new Map<string, RequestContext>();

  /**
   * Create new request context with timeout
   */
  public static createContext(timeoutMs: number, requestId?: string): RequestContext {
    const context = new RequestContext(timeoutMs, requestId);
    
    this.activeContexts.set(context.requestId, context);
    
    // Clean up when aborted
    context.signal.addEventListener('abort', () => {
      this.activeContexts.delete(context.requestId);
    });

    return context;
  }

  /**
   * Get active context by request ID
   */
  public static getContext(requestId: string): RequestContext | undefined {
    return this.activeContexts.get(requestId);
  }

  /**
   * Get count of active contexts (for monitoring)
   */
  public static getActiveContextCount(): number {
    return this.activeContexts.size;
  }

  /**
   * Clean up expired contexts (for memory management)
   */
  public static cleanupExpiredContexts(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [requestId, context] of this.activeContexts.entries()) {
      if (context.isAborted || now > context.deadline) {
        expired.push(requestId);
      }
    }

    for (const requestId of expired) {
      this.activeContexts.delete(requestId);
    }

    if (expired.length > 0) {
      log.debug(`Cleaned up ${expired.length} expired request contexts`);
    }
  }
}

// Periodic cleanup of expired contexts to prevent memory leaks
setInterval(() => {
  RequestContextManager.cleanupExpiredContexts();
}, 60000); // Every minute