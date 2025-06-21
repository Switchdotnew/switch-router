import log from '../../utils/logging.js';
import { logError } from '../../utils/logging.js';
import type { IMetricsExporter, MetricsSnapshot } from '../types/metrics-types.js';

export interface PrometheusExporterConfig {
  enabled: boolean;
  port?: number;
  path?: string;
  labels?: Record<string, string>;
  prefix?: string;
}

export class PrometheusExporter implements IMetricsExporter {
  public readonly name = 'prometheus';
  public readonly type = 'prometheus' as const;
  public enabled: boolean;
  private config: PrometheusExporterConfig;
  private metrics: Map<string, string> = new Map();
  private server: any = null;

  constructor(config: PrometheusExporterConfig) {
    this.enabled = config.enabled;
    this.config = {
      port: 9090,
      path: '/metrics',
      labels: {},
      prefix: 'gateway_',
      ...config,
    };

    if (this.enabled) {
      this.startServer();
    }
  }

  public async export(snapshot: MetricsSnapshot): Promise<void> {
    if (!this.enabled) return;

    try {
      const prometheusMetrics = this.convertToPrometheusFormat(snapshot);
      this.metrics.set('current', prometheusMetrics);

      log.debug('Metrics exported to Prometheus format');
    } catch (error) {
      logError(error, 'Failed to export metrics to Prometheus');
      throw error;
    }
  }

  private convertToPrometheusFormat(snapshot: MetricsSnapshot): string {
    const lines: string[] = [];
    const timestamp = snapshot.timestamp;
    const labels = this.formatLabels(this.config.labels || {});
    const prefix = this.config.prefix || 'gateway_';

    // Request metrics
    const requests = snapshot.aggregated.requests;
    lines.push(
      this.createMetric(
        `${prefix}requests_total`,
        requests.total,
        labels,
        timestamp,
        'Total number of requests'
      )
    );
    lines.push(
      this.createMetric(
        `${prefix}requests_successful_total`,
        requests.successful,
        labels,
        timestamp,
        'Total number of successful requests'
      )
    );
    lines.push(
      this.createMetric(
        `${prefix}requests_failed_total`,
        requests.failed,
        labels,
        timestamp,
        'Total number of failed requests'
      )
    );
    lines.push(
      this.createMetric(
        `${prefix}requests_per_second`,
        requests.rps,
        labels,
        timestamp,
        'Requests per second'
      )
    );
    lines.push(
      this.createMetric(
        `${prefix}request_duration_ms`,
        requests.averageLatency,
        labels,
        timestamp,
        'Average request duration in milliseconds'
      )
    );
    lines.push(
      this.createMetric(
        `${prefix}request_duration_p95_ms`,
        requests.p95Latency,
        labels,
        timestamp,
        '95th percentile request duration in milliseconds'
      )
    );
    lines.push(
      this.createMetric(
        `${prefix}request_duration_p99_ms`,
        requests.p99Latency,
        labels,
        timestamp,
        '99th percentile request duration in milliseconds'
      )
    );

    // Model metrics
    for (const [modelName, modelMetrics] of Object.entries(snapshot.aggregated.models)) {
      const modelLabels = this.formatLabels({ ...this.config.labels, model: modelName });

      lines.push(
        this.createMetric(
          `${prefix}model_requests_total`,
          modelMetrics.totalRequests,
          modelLabels,
          timestamp,
          'Total requests per model'
        )
      );
      lines.push(
        this.createMetric(
          `${prefix}model_requests_successful_total`,
          modelMetrics.successfulRequests,
          modelLabels,
          timestamp,
          'Successful requests per model'
        )
      );
      lines.push(
        this.createMetric(
          `${prefix}model_requests_failed_total`,
          modelMetrics.failedRequests,
          modelLabels,
          timestamp,
          'Failed requests per model'
        )
      );
      lines.push(
        this.createMetric(
          `${prefix}model_request_duration_ms`,
          modelMetrics.averageLatency,
          modelLabels,
          timestamp,
          'Average request duration per model'
        )
      );
      lines.push(
        this.createMetric(
          `${prefix}model_requests_per_second`,
          modelMetrics.requestsPerSecond,
          modelLabels,
          timestamp,
          'Requests per second per model'
        )
      );
      lines.push(
        this.createMetric(
          `${prefix}model_error_rate`,
          modelMetrics.errorRate,
          modelLabels,
          timestamp,
          'Error rate per model'
        )
      );

      // Provider metrics for this model
      for (const [providerName, providerMetrics] of Object.entries(modelMetrics.providers)) {
        const providerLabels = this.formatLabels({
          ...this.config.labels,
          model: modelName,
          provider: providerName,
        });

        lines.push(
          this.createMetric(
            `${prefix}provider_requests_total`,
            providerMetrics.totalRequests,
            providerLabels,
            timestamp,
            'Total requests per provider'
          )
        );
        lines.push(
          this.createMetric(
            `${prefix}provider_requests_successful_total`,
            providerMetrics.successfulRequests,
            providerLabels,
            timestamp,
            'Successful requests per provider'
          )
        );
        lines.push(
          this.createMetric(
            `${prefix}provider_requests_failed_total`,
            providerMetrics.failedRequests,
            providerLabels,
            timestamp,
            'Failed requests per provider'
          )
        );
        lines.push(
          this.createMetric(
            `${prefix}provider_request_duration_ms`,
            providerMetrics.averageLatency,
            providerLabels,
            timestamp,
            'Average request duration per provider'
          )
        );
        lines.push(
          this.createMetric(
            `${prefix}provider_error_rate`,
            providerMetrics.errorRate,
            providerLabels,
            timestamp,
            'Error rate per provider'
          )
        );
        lines.push(
          this.createMetric(
            `${prefix}provider_rate_limit_hits_total`,
            providerMetrics.rateLimitHits,
            providerLabels,
            timestamp,
            'Rate limit hits per provider'
          )
        );
        lines.push(
          this.createMetric(
            `${prefix}provider_circuit_breaker_trips_total`,
            providerMetrics.circuitBreakerTrips,
            providerLabels,
            timestamp,
            'Circuit breaker trips per provider'
          )
        );
        lines.push(
          this.createMetric(
            `${prefix}provider_consecutive_errors`,
            providerMetrics.consecutiveErrors,
            providerLabels,
            timestamp,
            'Consecutive errors per provider'
          )
        );
      }

      // Load balancing metrics
      for (const [provider, count] of Object.entries(
        modelMetrics.loadBalancingStats.distribution
      )) {
        const lbLabels = this.formatLabels({
          ...this.config.labels,
          model: modelName,
          provider,
        });
        lines.push(
          this.createMetric(
            `${prefix}load_balancing_distribution`,
            count,
            lbLabels,
            timestamp,
            'Load balancing distribution'
          )
        );
      }

      // Fallback metrics
      const fallbackLabels = this.formatLabels({ ...this.config.labels, model: modelName });
      lines.push(
        this.createMetric(
          `${prefix}fallback_triggered_total`,
          modelMetrics.fallbackStats.triggered,
          fallbackLabels,
          timestamp,
          'Fallback attempts triggered'
        )
      );
      lines.push(
        this.createMetric(
          `${prefix}fallback_successful_total`,
          modelMetrics.fallbackStats.successful,
          fallbackLabels,
          timestamp,
          'Successful fallback attempts'
        )
      );
      lines.push(
        this.createMetric(
          `${prefix}fallback_failed_total`,
          modelMetrics.fallbackStats.failed,
          fallbackLabels,
          timestamp,
          'Failed fallback attempts'
        )
      );
    }

    // System metrics
    const system = snapshot.aggregated.system;
    lines.push(
      this.createMetric(
        `${prefix}uptime_seconds`,
        system.uptime / 1000,
        labels,
        timestamp,
        'System uptime in seconds'
      )
    );
    lines.push(
      this.createMetric(
        `${prefix}memory_rss_bytes`,
        system.memoryUsage.rss,
        labels,
        timestamp,
        'Resident set size memory'
      )
    );
    lines.push(
      this.createMetric(
        `${prefix}memory_heap_used_bytes`,
        system.memoryUsage.heapUsed,
        labels,
        timestamp,
        'Heap memory used'
      )
    );
    lines.push(
      this.createMetric(
        `${prefix}memory_heap_total_bytes`,
        system.memoryUsage.heapTotal,
        labels,
        timestamp,
        'Total heap memory'
      )
    );
    lines.push(
      this.createMetric(
        `${prefix}memory_external_bytes`,
        system.memoryUsage.external,
        labels,
        timestamp,
        'External memory'
      )
    );
    lines.push(
      this.createMetric(
        `${prefix}cpu_user_microseconds`,
        system.cpuUsage.user,
        labels,
        timestamp,
        'CPU user time'
      )
    );
    lines.push(
      this.createMetric(
        `${prefix}cpu_system_microseconds`,
        system.cpuUsage.system,
        labels,
        timestamp,
        'CPU system time'
      )
    );
    lines.push(
      this.createMetric(
        `${prefix}active_connections`,
        system.activeConnections,
        labels,
        timestamp,
        'Active connections'
      )
    );
    lines.push(
      this.createMetric(`${prefix}queue_depth`, system.queueDepth, labels, timestamp, 'Queue depth')
    );

    // Cache metrics
    lines.push(
      this.createMetric(
        `${prefix}cache_hits_total`,
        system.cacheStats.hits,
        labels,
        timestamp,
        'Cache hits'
      )
    );
    lines.push(
      this.createMetric(
        `${prefix}cache_misses_total`,
        system.cacheStats.misses,
        labels,
        timestamp,
        'Cache misses'
      )
    );
    lines.push(
      this.createMetric(
        `${prefix}cache_hit_rate`,
        system.cacheStats.hitRate,
        labels,
        timestamp,
        'Cache hit rate'
      )
    );
    lines.push(
      this.createMetric(
        `${prefix}cache_size`,
        system.cacheStats.size,
        labels,
        timestamp,
        'Cache size'
      )
    );

    // Error metrics
    const errors = snapshot.aggregated.errors;
    lines.push(
      this.createMetric(`${prefix}errors_total`, errors.total, labels, timestamp, 'Total errors')
    );

    for (const [errorType, count] of Object.entries(errors.byType)) {
      const errorLabels = this.formatLabels({ ...this.config.labels, error_type: errorType });
      lines.push(
        this.createMetric(
          `${prefix}errors_by_type_total`,
          count,
          errorLabels,
          timestamp,
          'Errors by type'
        )
      );
    }

    for (const [provider, count] of Object.entries(errors.byProvider)) {
      const errorLabels = this.formatLabels({ ...this.config.labels, provider });
      lines.push(
        this.createMetric(
          `${prefix}errors_by_provider_total`,
          count,
          errorLabels,
          timestamp,
          'Errors by provider'
        )
      );
    }

    // Health metrics
    const healthStatusValue =
      snapshot.health.status === 'healthy' ? 1 : snapshot.health.status === 'degraded' ? 0.5 : 0;
    lines.push(
      this.createMetric(
        `${prefix}health_status`,
        healthStatusValue,
        labels,
        timestamp,
        'Health status (1=healthy, 0.5=degraded, 0=unhealthy)'
      )
    );

    for (const [checkName, check] of Object.entries(snapshot.health.checks)) {
      const checkLabels = this.formatLabels({ ...this.config.labels, check: checkName });
      const checkValue = check.status === 'healthy' ? 1 : check.status === 'degraded' ? 0.5 : 0;
      lines.push(
        this.createMetric(
          `${prefix}health_check_status`,
          checkValue,
          checkLabels,
          timestamp,
          'Health check status'
        )
      );
    }

    // Alerts
    lines.push(
      this.createMetric(
        `${prefix}active_alerts`,
        snapshot.alerts.length,
        labels,
        timestamp,
        'Active alerts'
      )
    );

    for (const alert of snapshot.alerts) {
      const alertLabels = this.formatLabels({
        ...this.config.labels,
        alert_id: alert.id,
        alert_name: alert.name,
        status: alert.status,
      });
      lines.push(
        this.createMetric(
          `${prefix}alert_value`,
          alert.value,
          alertLabels,
          timestamp,
          'Alert value'
        )
      );
    }

    return lines.join('\n');
  }

  private createMetric(
    name: string,
    value: number,
    labels: string,
    timestamp: number,
    help: string
  ): string {
    const helpLine = `# HELP ${name} ${help}`;
    const typeLine = `# TYPE ${name} gauge`;
    const metricLine = `${name}${labels} ${value} ${timestamp}`;

    return `${helpLine}\n${typeLine}\n${metricLine}`;
  }

  private formatLabels(labels: Record<string, string>): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) return '';

    const labelPairs = entries.map(([key, value]) => `${key}="${this.escapeLabel(value)}"`);
    return `{${labelPairs.join(',')}}`;
  }

  private escapeLabel(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t');
  }

  private async startServer(): Promise<void> {
    try {
      // Dynamically import http to avoid issues in environments without Node.js
      const http = await import('http');

      this.server = http.createServer((req, res) => {
        if (req.url === this.config.path && req.method === 'GET') {
          const metricsData = this.metrics.get('current') || '';

          res.writeHead(200, {
            'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
            'Content-Length': Buffer.byteLength(metricsData),
          });
          res.end(metricsData);
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }
      });

      this.server.listen(this.config.port, () => {
        log.info(
          `Prometheus metrics server started on port ${this.config.port}${this.config.path}`
        );
      });

      this.server.on('error', (error: Error) => {
        logError(error, 'Prometheus metrics server error');
      });
    } catch (error) {
      logError(error, 'Failed to start Prometheus metrics server');
      this.enabled = false;
    }
  }

  public getMetricsEndpoint(): string {
    return `http://localhost:${this.config.port}${this.config.path}`;
  }

  public async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          log.info('Prometheus metrics server stopped');
          resolve();
        });
      });
    }
  }

  public isHealthy(): boolean {
    return this.enabled && this.server !== null;
  }
}
