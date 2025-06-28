import type { ProviderConfig, CircuitBreakerConfig } from '../shared/config.js';

/**
 * Pool routing strategies for provider selection within a pool
 */
export type PoolRoutingStrategy = 
  | 'weighted'
  | 'cost_optimized'
  | 'fastest_response'
  | 'round_robin'
  | 'least_connections';

/**
 * Pool health status levels
 */
export type PoolHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Pool configuration definition
 */
export interface PoolDefinition {
  /** Unique pool identifier */
  id: string;
  
  /** Human-readable pool name */
  name: string;
  
  /** Optional pool description */
  description?: string;
  
  /** Array of providers in this pool */
  providers: ProviderConfig[];
  
  /** Array of pool IDs to fallback to when this pool is unhealthy */
  fallbackPoolIds: string[];
  
  /** Routing strategy for selecting providers within this pool */
  routingStrategy: PoolRoutingStrategy;
  
  /** Circuit breaker configuration for this pool */
  circuitBreaker: CircuitBreakerConfig;
  
  /** Weighted routing configuration (used when routingStrategy is 'weighted') */
  weightedRouting?: {
    /** Enable automatic weight adjustment based on performance */
    autoAdjust: boolean;
    /** Minimum weight threshold for any provider */
    minWeight: number;
    /** Maximum weight threshold for any provider */
    maxWeight: number;
  };
  
  /** Cost optimization configuration (used when routingStrategy is 'cost_optimized') */
  costOptimization?: {
    /** Maximum cost per token threshold */
    maxCostPerToken?: number;
    /** Prefer cost over performance when true */
    prioritizeCost: boolean;
  };
  
  /** Performance thresholds for health determination */
  healthThresholds: {
    /** Maximum acceptable error rate percentage (0-100) */
    errorRate: number;
    /** Maximum acceptable response time in milliseconds */
    responseTime: number;
    /** Maximum consecutive failures before marking unhealthy */
    consecutiveFailures: number;
    /** Minimum number of healthy providers required for pool to be healthy */
    minHealthyProviders: number;
  };
}

/**
 * Pool health information
 */
export interface PoolHealth {
  /** Pool ID */
  poolId: string;
  
  /** Overall pool health status */
  status: PoolHealthStatus;
  
  /** Pool health score (0-100) */
  healthScore: number;
  
  /** Number of healthy providers in pool */
  healthyProviders: number;
  
  /** Total number of providers in pool */
  totalProviders: number;
  
  /** Average response time across healthy providers */
  averageResponseTime: number;
  
  /** Current error rate percentage */
  errorRate: number;
  
  /** Last health check timestamp */
  lastHealthCheck: Date;
  
  /** Individual provider health statuses */
  providerStatuses: Array<{
    providerName: string;
    isHealthy: boolean;
    responseTime: number;
    errorRate: number;
    lastCheck: Date;
  }>;
}

/**
 * Pool metrics for monitoring and optimization
 */
export interface PoolMetrics {
  /** Pool ID */
  poolId: string;
  
  /** Total requests processed by this pool */
  totalRequests: number;
  
  /** Successful requests */
  successfulRequests: number;
  
  /** Failed requests */
  failedRequests: number;
  
  /** Average response time */
  averageResponseTime: number;
  
  /** Total cost incurred by this pool */
  totalCost: number;
  
  /** Cost per successful request */
  costPerRequest: number;
  
  /** Provider utilization distribution */
  providerUtilization: Record<string, {
    requests: number;
    successRate: number;
    averageResponseTime: number;
    cost: number;
  }>;
  
  /** Timestamp of metrics collection */
  timestamp: Date;
}

/**
 * Pool routing context for request processing
 */
export interface PoolRoutingContext {
  /** Pool being used for routing */
  poolId: string;
  
  /** Selected provider within the pool */
  selectedProvider: string;
  
  /** Fallback pools attempted (if any) */
  fallbacksAttempted: string[];
  
  /** Total routing time in milliseconds */
  routingTime: number;
  
  /** Whether this request used fallback */
  usedFallback: boolean;
  
  /** Pool health at time of routing */
  poolHealthAtRouting: PoolHealthStatus;
}

/**
 * Pool failover result
 */
export interface PoolFailoverResult {
  /** Whether failover was successful */
  success: boolean;
  
  /** Final pool used (may be different from requested) */
  finalPoolId: string;
  
  /** Pools attempted during failover */
  poolsAttempted: string[];
  
  /** Error that triggered failover (if any) */
  failoverReason?: string;
  
  /** Time taken for failover process */
  failoverTime: number;
}

/**
 * Pool configuration validation result
 */
export interface PoolValidationResult {
  /** Whether the pool configuration is valid */
  isValid: boolean;
  
  /** Validation errors (if any) */
  errors: string[];
  
  /** Validation warnings */
  warnings: string[];
  
  /** Validated pool (with defaults applied) */
  validatedPool?: PoolDefinition;
}

/**
 * Pool selection criteria for router
 */
export interface PoolSelectionCriteria {
  /** Model name being requested */
  modelName: string;
  
  /** Request priority (if applicable) */
  priority?: 'low' | 'normal' | 'high';
  
  /** Maximum acceptable cost per token */
  maxCostPerToken?: number;
  
  /** Maximum acceptable response time */
  maxResponseTime?: number;
  
  /** Whether to prefer cost over performance */
  preferCost?: boolean;
}