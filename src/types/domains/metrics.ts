// Internal metrics types for domain logic
export interface IRequestMetrics {
  id: string;
  timestamp: number;
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  requestSize: number;
  responseSize: number;
  model?: string;
  provider?: string;
  userId?: string;
  apiKey?: string;
  cached: boolean;
  error?: string;
  retries: number;
  queueTime: number;
}

export interface IProviderAggregatedMetrics {
  name: string;
  model: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  errorRate: number;
  rateLimitHits: number;
  circuitBreakerTrips: number;
  lastRequestTime?: number;
  lastErrorTime?: number;
  consecutiveErrors: number;
  totalTokensProcessed: number;
  totalCost: number;
}

export interface IModelMetrics {
  name: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  requestsPerSecond: number;
  errorRate: number;
  providers: Record<string, IProviderAggregatedMetrics>;
  loadBalancingStats: {
    strategy: string;
    distribution: Record<string, number>;
  };
  fallbackStats: {
    triggered: number;
    successful: number;
    failed: number;
  };
}

export interface IHealthCheckMetrics {
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  timeoutChecks: number;
  averageResponseTime: number;
  concurrentChecks: number;
  queueLength: number;
  lastCycleTime: number;
  checksPerSecond: number;
}

export interface ISystemMetrics {
  uptime: number;
  memoryUsage: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  cpuUsage: {
    user: number;
    system: number;
  };
  activeConnections: number;
  queueDepth: number;
  cacheStats: {
    hits: number;
    misses: number;
    hitRate: number;
    size: number;
  };
  timeoutMetrics?: {
    activeRequestContexts: number;
    timeoutCount: number;
    timeoutRate: number;
    recentTimeoutEvents: Array<{
      timestamp: number;
      model?: string;
      provider?: string;
      duration: number;
    }>;
  };
  healthCheckMetrics?: IHealthCheckMetrics;
}

export interface IAggregatedMetrics {
  timestamp: number;
  window: number; // Window size in seconds
  requests: {
    total: number;
    successful: number;
    failed: number;
    rps: number;
    averageLatency: number;
    p95Latency: number;
    p99Latency: number;
  };
  models: Record<string, IModelMetrics>;
  system: ISystemMetrics;
  errors: {
    total: number;
    byType: Record<string, number>;
    byProvider: Record<string, number>;
  };
}

export interface IMetricAlert {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  value: number;
  status: 'warning' | 'critical' | 'resolved';
  timestamp: number;
  message: string;
  tags: Record<string, string>;
}

export interface IHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  checks: Record<
    string,
    {
      status: 'healthy' | 'degraded' | 'unhealthy';
      message?: string;
      duration: number;
      metadata?: Record<string, unknown>;
    }
  >;
  uptime: number;
  version: string;
}

export interface IMetricsSnapshot {
  timestamp: number;
  aggregated: IAggregatedMetrics;
  health: IHealthStatus;
  alerts: IMetricAlert[];
}

export interface IHealthCheck {
  name: string;
  check: () => Promise<IHealthCheckResult>;
  intervalMs: number;
  timeoutMs: number;
  retries: number;
  critical: boolean;
  enabled: boolean;
}

export interface IHealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  metadata?: Record<string, unknown>;
  duration: number;
}

export interface IMetricsExporter {
  name: string;
  type: 'prometheus' | 'datadog' | 'console' | 'webhook';
  enabled: boolean;
  export(metrics: IMetricsSnapshot): Promise<void>;
}

export interface IMetricsCollectorConfig {
  enabled: boolean;
  intervalMs: number;
  retentionDays: number;
  aggregationWindows: number[];
  maxStoredSnapshots: number;
  enableDetailedTracing: boolean;
}

export interface IAlertRule {
  id: string;
  name: string;
  condition: 'threshold' | 'rate' | 'percentage';
  metric: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne';
  threshold: number;
  windowSeconds: number;
  enabled: boolean;
  severity: 'warning' | 'critical';
  cooldownSeconds: number;
  tags: Record<string, string>;
}

export interface IMetricsQuery {
  metric: string;
  timeRange: {
    start: number;
    end: number;
  };
  aggregation?: 'avg' | 'sum' | 'min' | 'max' | 'count';
  groupBy?: string[];
  filters?: Record<string, string>;
  resolution?: number; // seconds
}

export interface IMetricsQueryResult {
  metric: string;
  dataPoints: Array<{
    timestamp: number;
    value: number;
    tags?: Record<string, string>;
  }>;
  aggregation?: string;
  resolution: number;
}
