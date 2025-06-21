import log from '../../utils/logging.js';
import { logError, logInfo, logDebug, metricsToLogContext } from '../../utils/logging.js';
import type { IMetricsExporter, MetricsSnapshot } from '../types/metrics-types.js';

export interface ConsoleExporterConfig {
  enabled: boolean;
  format: 'table' | 'json' | 'summary';
  includeSystemMetrics: boolean;
  includeProviderMetrics: boolean;
  includeErrorDetails: boolean;
  logLevel: 'info' | 'debug';
}

export class ConsoleExporter implements IMetricsExporter {
  public readonly name = 'console';
  public readonly type = 'console' as const;
  public enabled: boolean;
  private config: ConsoleExporterConfig;

  constructor(config: ConsoleExporterConfig) {
    this.enabled = config.enabled;
    this.config = {
      enabled: config.enabled,
      format: config.format || 'summary',
      includeSystemMetrics: config.includeSystemMetrics ?? true,
      includeProviderMetrics: config.includeProviderMetrics ?? true,
      includeErrorDetails: config.includeErrorDetails ?? true,
      logLevel: config.logLevel || 'info',
    };
  }

  public async export(snapshot: MetricsSnapshot): Promise<void> {
    if (!this.enabled) return;

    try {
      switch (this.config.format) {
        case 'json':
          this.exportAsJson(snapshot);
          break;
        case 'table':
          this.exportAsTable(snapshot);
          break;
        case 'summary':
        default:
          this.exportAsSummary(snapshot);
          break;
      }
    } catch (error) {
      logError(error, 'Failed to export metrics to console');
      throw error;
    }
  }

  private exportAsJson(snapshot: MetricsSnapshot): void {
    if (this.config.logLevel === 'debug') {
      logDebug('Metrics Snapshot (JSON)', metricsToLogContext(snapshot));
    } else {
      logInfo('Metrics Snapshot (JSON)', metricsToLogContext(snapshot));
    }
  }

  private exportAsTable(snapshot: MetricsSnapshot): void {
    const { aggregated } = snapshot;

    // Request metrics table
    console.log('\n📊 REQUEST METRICS');
    console.log('═'.repeat(80));
    console.table({
      'Total Requests': aggregated.requests.total,
      Successful: aggregated.requests.successful,
      Failed: aggregated.requests.failed,
      RPS: aggregated.requests.rps.toFixed(2),
      'Avg Latency (ms)': aggregated.requests.averageLatency.toFixed(2),
      'P95 Latency (ms)': aggregated.requests.p95Latency.toFixed(2),
      'P99 Latency (ms)': aggregated.requests.p99Latency.toFixed(2),
    });

    // Model metrics table
    if (Object.keys(aggregated.models).length > 0) {
      console.log('\n🤖 MODEL METRICS');
      console.log('═'.repeat(80));

      const modelData: Record<string, unknown> = {};
      for (const [modelName, metrics] of Object.entries(aggregated.models)) {
        modelData[modelName] = {
          Requests: metrics.totalRequests,
          'Success Rate': `${((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(1)}%`,
          RPS: metrics.requestsPerSecond.toFixed(2),
          'Avg Latency': `${metrics.averageLatency.toFixed(2)}ms`,
          'Error Rate': `${(metrics.errorRate * 100).toFixed(1)}%`,
        };
      }
      console.table(modelData);
    }

    // Provider metrics table
    if (this.config.includeProviderMetrics) {
      console.log('\n🔌 PROVIDER METRICS');
      console.log('═'.repeat(80));

      const providerData: Record<string, unknown> = {};
      for (const [modelName, modelMetrics] of Object.entries(aggregated.models)) {
        for (const [providerName, providerMetrics] of Object.entries(modelMetrics.providers)) {
          const key = `${modelName}:${providerName}`;
          providerData[key] = {
            Requests: providerMetrics.totalRequests,
            'Success Rate': `${((providerMetrics.successfulRequests / providerMetrics.totalRequests) * 100).toFixed(1)}%`,
            'Avg Latency': `${providerMetrics.averageLatency.toFixed(2)}ms`,
            'Rate Limits': providerMetrics.rateLimitHits,
            'CB Trips': providerMetrics.circuitBreakerTrips,
            'Consecutive Errors': providerMetrics.consecutiveErrors,
          };
        }
      }
      if (Object.keys(providerData).length > 0) {
        console.table(providerData);
      }
    }

    // System metrics table
    if (this.config.includeSystemMetrics) {
      console.log('\n⚙️  SYSTEM METRICS');
      console.log('═'.repeat(80));

      const systemData = {
        Uptime: this.formatDuration(aggregated.system.uptime),
        'Memory RSS': this.formatBytes(aggregated.system.memoryUsage.rss),
        'Memory Heap Used': this.formatBytes(aggregated.system.memoryUsage.heapUsed),
        'Memory Heap Total': this.formatBytes(aggregated.system.memoryUsage.heapTotal),
        'Active Connections': aggregated.system.activeConnections,
        'Queue Depth': aggregated.system.queueDepth,
        'Cache Hit Rate': `${(aggregated.system.cacheStats.hitRate * 100).toFixed(1)}%`,
        'Cache Size': aggregated.system.cacheStats.size,
      };
      console.table(systemData);
    }

    // Health status
    console.log('\n💊 HEALTH STATUS');
    console.log('═'.repeat(80));
    const healthEmoji =
      snapshot.health.status === 'healthy'
        ? '✅'
        : snapshot.health.status === 'degraded'
          ? '⚠️'
          : '❌';
    console.log(`${healthEmoji} Overall Status: ${snapshot.health.status.toUpperCase()}`);

    for (const [checkName, check] of Object.entries(snapshot.health.checks)) {
      const checkEmoji =
        check.status === 'healthy' ? '✅' : check.status === 'degraded' ? '⚠️' : '❌';
      console.log(`  ${checkEmoji} ${checkName}: ${check.message || check.status}`);
    }
  }

  private exportAsSummary(snapshot: MetricsSnapshot): void {
    const { aggregated } = snapshot;
    const timestamp = new Date(snapshot.timestamp).toISOString();

    const summary: Record<string, unknown> = {
      timestamp,
      health: snapshot.health.status,
      requests: {
        total: aggregated.requests.total,
        rps: parseFloat(aggregated.requests.rps.toFixed(2)),
        errorRate: parseFloat(
          ((aggregated.requests.failed / aggregated.requests.total) * 100).toFixed(2)
        ),
        avgLatency: parseFloat(aggregated.requests.averageLatency.toFixed(2)),
      },
      models: Object.keys(aggregated.models).length,
      errors: aggregated.errors.total,
      uptime: this.formatDuration(aggregated.system.uptime),
    };

    // Add model breakdown if there are models
    if (Object.keys(aggregated.models).length > 0) {
      summary['modelBreakdown'] = Object.fromEntries(
        Object.entries(aggregated.models).map(([name, metrics]) => [
          name,
          {
            requests: metrics.totalRequests,
            errorRate: parseFloat((metrics.errorRate * 100).toFixed(2)),
            avgLatency: parseFloat(metrics.averageLatency.toFixed(2)),
          },
        ])
      );
    }

    // Add provider issues if any
    const providerIssues: string[] = [];
    for (const [modelName, modelMetrics] of Object.entries(aggregated.models)) {
      for (const [providerName, providerMetrics] of Object.entries(modelMetrics.providers)) {
        if (providerMetrics.consecutiveErrors > 3) {
          providerIssues.push(
            `${modelName}:${providerName} (${providerMetrics.consecutiveErrors} consecutive errors)`
          );
        }
        if (providerMetrics.circuitBreakerTrips > 0) {
          providerIssues.push(`${modelName}:${providerName} (circuit breaker tripped)`);
        }
      }
    }

    if (providerIssues.length > 0) {
      summary['providerIssues'] = providerIssues;
    }

    // Add error breakdown if enabled
    if (this.config.includeErrorDetails && aggregated.errors.total > 0) {
      summary['errorBreakdown'] = {
        byType: aggregated.errors.byType,
        byProvider: aggregated.errors.byProvider,
      };
    }

    // Add alerts if any
    if (snapshot.alerts.length > 0) {
      summary['activeAlerts'] = snapshot.alerts.map((alert) => ({
        name: alert.name,
        status: alert.status,
        value: alert.value,
        threshold: alert.threshold,
      }));
    }

    const logMethod = this.config.logLevel === 'debug' ? log.debug : log.info;
    logMethod('📈 Metrics Summary', summary);
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  public updateConfig(config: Partial<ConsoleExporterConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
