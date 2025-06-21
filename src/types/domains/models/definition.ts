import type { Provider } from '../../shared/enums.js';
import type { ICircuitBreakerConfig, ICircuitBreakerState } from '../core/circuit-breaker.js';

export interface IProviderEndpoint {
  name: string;
  provider: string;
  apiKey?: string; // Optional for new credential system
  credentialsRef?: string | number; // New credential system - supports both string names and numeric IDs
  apiBase: string;
  modelName: string;
  priority: number;
  weight?: number;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
  rateLimits?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
  };
  providerParams?: Record<string, unknown>;
  healthCheck?: {
    enabled?: boolean;
    intervalMs?: number;
    timeoutMs?: number;
    retries?: number;
  };
  healthCheckParams?: Record<string, unknown>;
  streamingParams?: Record<string, unknown>;
  useModelDefaults?: boolean;
  isHealthy?: boolean;
  lastHealthCheck?: Date;
  responseTime?: number;
  circuitBreakerState?: ICircuitBreakerState;
  failureCount?: number;
  lastFailureTime?: Date;
}

export interface IModelDefinition {
  name: string;
  providers: IProviderEndpoint[];
  temperature: number;
  maxTokens: number;
  circuitBreaker: ICircuitBreakerConfig;
  fallbackModel?: string;
}

// Note: Core types moved to domains/core/ and providers/ folders

export interface IModelProviderTemplate {
  name: Provider;
  defaultApiBase?: string;
  authHeader: string;
  authPrefix: string;
  supportsJsonMode: boolean;
  supportsStreaming: boolean;
  timeout: number;
  maxRetries: number;
}

export interface IModelCapabilities {
  chat: boolean;
  completion: boolean;
  streaming: boolean;
  jsonMode: boolean;
}

export interface IProviderHealthMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  lastRequestTime?: Date;
  lastFailureTime?: Date;
  consecutiveFailures: number;
  errorRate: number;
}

// ICircuitBreakerMetrics moved to domains/core/circuit-breaker.ts
