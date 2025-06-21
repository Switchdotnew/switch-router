// This file is deprecated. Use src/core/circuit-breaker.ts instead.
// Re-export the new circuit breaker for backward compatibility

export { CircuitBreaker } from '../core/circuit-breaker.js';
export type {
  CircuitBreakerState,
  CircuitBreakerConfig,
  CircuitBreakerMetrics,
  CircuitBreakerResult,
} from '../core/circuit-breaker.js';
