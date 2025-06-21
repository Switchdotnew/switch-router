// Re-export public metrics types for backward compatibility
export * from '../../types/public/metrics.js';

// Export internal metrics types with different names for internal use
export type {
  IRequestMetrics,
  IProviderAggregatedMetrics,
  IModelMetrics,
  ISystemMetrics,
  IHealthCheckMetrics,
  IAggregatedMetrics,
  IMetricAlert,
  IHealthStatus,
  IMetricsSnapshot,
  IHealthCheck,
  IHealthCheckResult,
  IMetricsExporter,
  IMetricsCollectorConfig,
  IAlertRule,
  IMetricsQuery,
  IMetricsQueryResult,
} from '../../types/domains/metrics.js';

// Import the types to create aliases
import type {
  IRequestMetrics,
  IProviderAggregatedMetrics,
  IModelMetrics,
  ISystemMetrics,
  IAggregatedMetrics,
  IMetricsSnapshot,
  IMetricsCollectorConfig,
} from '../../types/domains/metrics.js';

// Create aliases for compatibility with existing code
export type RequestMetrics = IRequestMetrics;
export type ProviderMetrics = IProviderAggregatedMetrics;
export type ModelMetrics = IModelMetrics;
export type SystemMetrics = ISystemMetrics;
export type AggregatedMetrics = IAggregatedMetrics;
export type MetricsSnapshot = IMetricsSnapshot;
export type MetricsCollectorConfig = IMetricsCollectorConfig;
