// Internal circuit breaker types for domain logic

export interface IPermanentFailureConfig {
  enabled: boolean;
  timeoutMultiplier: number;
  baseTimeoutMs: number;
  maxBackoffMultiplier: number;
  errorPatterns?: string[];
}

export interface ICircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number;
  resetTimeout: number;
  monitoringWindow: number;
  minRequestsThreshold: number;
  errorThresholdPercentage: number;
  permanentFailureHandling?: IPermanentFailureConfig;
}

export interface ICircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailureTime: number;
  nextAttemptTime: number;
  requestCount: number;
  successCount: number;
  recentErrors: Array<{
    timestamp: number;
    error: string;
    classification?: string; // ErrorClassification enum value
  }>;
}

export interface ICircuitBreakerMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  circuitBreakerTrips: number;
  stateTransitions: Array<{
    from: ICircuitBreakerState['state'];
    to: ICircuitBreakerState['state'];
    timestamp: number;
    reason: string;
  }>;
  averageFailureRate: number;
  lastStateChange: number;
}

export interface ICircuitBreakerResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  state: ICircuitBreakerState['state'];
  executionTime: number;
  retryAfter?: number;
}

// Circuit breaker state enum for explicit state management
export const ICircuitBreakerStateValues = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half-open',
} as const;

export type ICircuitBreakerStateType =
  (typeof ICircuitBreakerStateValues)[keyof typeof ICircuitBreakerStateValues];
