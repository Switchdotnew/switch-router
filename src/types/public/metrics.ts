// Public metrics types for external API consumers

export interface RequestMetrics {
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
  cached: boolean;
  error?: string;
  retries: number;
  queueTime: number;
}

export interface ProviderMetrics {
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

export interface ModelMetrics {
  name: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  requestsPerSecond: number;
  errorRate: number;
  providers: Record<string, ProviderMetrics>;
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

export interface SystemMetrics {
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
}

export interface AggregatedMetrics {
  timestamp: number;
  window: number;
  requests: {
    total: number;
    successful: number;
    failed: number;
    rps: number;
    averageLatency: number;
    p95Latency: number;
    p99Latency: number;
  };
  models: Record<string, ModelMetrics>;
  system: SystemMetrics;
  errors: {
    total: number;
    byType: Record<string, number>;
    byProvider: Record<string, number>;
  };
}

export interface MetricAlert {
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

export interface HealthStatus {
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

export interface MetricsSnapshot {
  timestamp: number;
  aggregated: AggregatedMetrics;
  health: HealthStatus;
  alerts: MetricAlert[];
}

export interface HealthCheck {
  name: string;
  intervalMs: number;
  timeoutMs: number;
  retries: number;
  critical: boolean;
  enabled: boolean;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  metadata?: Record<string, unknown>;
  duration: number;
}

export interface MetricsExporter {
  name: string;
  type: 'prometheus' | 'datadog' | 'console' | 'webhook';
  enabled: boolean;
}

export interface AlertRule {
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

export interface MetricsQuery {
  metric: string;
  timeRange: {
    start: number;
    end: number;
  };
  aggregation?: 'avg' | 'sum' | 'min' | 'max' | 'count';
  groupBy?: string[];
  filters?: Record<string, string>;
  resolution?: number;
}

export interface MetricsQueryResult {
  metric: string;
  dataPoints: Array<{
    timestamp: number;
    value: number;
    tags?: Record<string, string>;
  }>;
  aggregation?: string;
  resolution: number;
}

export interface MetricsCollectorConfig {
  enabled: boolean;
  intervalMs: number;
  retentionDays: number;
  aggregationWindows: number[];
  maxStoredSnapshots: number;
  enableDetailedTracing: boolean;
}
