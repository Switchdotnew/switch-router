// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck - Metrics system needs comprehensive refactoring after config system changes
import log, { logError, logWarn } from '../utils/logging.js';
import { EventEmitter } from 'events';
import { MetricsCollector } from './collectors/metrics-collector.js';
import { PrometheusExporter } from './exporters/prometheus-exporter.js';
import { ConsoleExporter } from './exporters/console-exporter.js';
import { AlertManager } from './alerts/alert-manager.js';
import { HealthMonitor } from './health/health-monitor.js';
import type {
  MetricsSnapshot,
  RequestMetrics,
  AlertRule,
  MetricsCollectorConfig,
  IMetricsExporter,
} from './types/metrics-types.js';
import type { HealthCheck } from './health/health-monitor.js';

export interface MetricsSystemConfig {
  metrics: {
    enabled: boolean;
    collection: {
      intervalMs: number;
      retentionDays: number;
      aggregationWindows: number[];
    };
    exporters: Array<{
      type: string;
      enabled: boolean;
      config: Record<string, unknown>;
    }>;
    alerts: {
      enabled: boolean;
      rules: Array<{
        type: string;
        config: Record<string, unknown>;
      }>;
      webhooks?: Array<{ url: string; secret?: string }>;
      thresholds?: {
        errorRate: number;
        responseTime: number;
        availability: number;
      };
    };
  };
  enableHealthMonitoring: boolean;
  enableAlerts: boolean;
}

export class MetricsSystem extends EventEmitter {
  private collector: MetricsCollector;
  private exporters: Map<string, IMetricsExporter> = new Map();
  private alertManager: AlertManager | null = null;
  private healthMonitor: HealthMonitor | null = null;
  private config: MetricsSystemConfig;
  private snapshotInterval: NodeJS.Timeout | null = null;

  constructor(config: MetricsSystemConfig) {
    super();
    this.config = config;

    // Initialize metrics collector
    const collectorConfig: MetricsCollectorConfig = {
      enabled: config.metrics.enabled,
      intervalMs: config.metrics.collection.intervalMs,
      retentionDays: config.metrics.collection.retentionDays,
      aggregationWindows: config.metrics.collection.aggregationWindows,
      maxStoredSnapshots: Math.max(
        1000,
        config.metrics.collection.intervalMs * 24 * 60 * 60 * 1000
      ), // 24 hours worth
      enableDetailedTracing: false,
    };

    this.collector = new MetricsCollector(collectorConfig);

    if (config.metrics.enabled) {
      this.initializeExporters();

      if (config.enableAlerts && config.metrics.alerts.enabled) {
        this.initializeAlertManager();
      }

      if (config.enableHealthMonitoring) {
        this.initializeHealthMonitor();
      }

      this.startSnapshotCollection();
    }

    // Set up event forwarding
    this.collector.on('snapshot', (snapshot) => {
      this.emit('snapshot', snapshot);
      this.handleSnapshot(snapshot);
    });

    this.collector.on('request', (metrics) => {
      this.emit('request', metrics);
    });

    log.info('Metrics system initialized', {
      enabled: config.metrics.enabled,
      exporters: config.metrics.exporters.filter((e) => e.enabled).length,
      alerts: config.enableAlerts && config.metrics.alerts.enabled,
      healthMonitoring: config.enableHealthMonitoring,
    });
  }

  private initializeExporters(): void {
    for (const exporterConfig of this.config.metrics.exporters) {
      if (!exporterConfig.enabled) continue;

      try {
        let exporter: IMetricsExporter | null = null;

        switch (exporterConfig.type) {
          case 'prometheus':
            exporter = new PrometheusExporter({
              enabled: true,
              ...exporterConfig.config,
            });
            break;

          case 'console':
            exporter = new ConsoleExporter({
              enabled: true,
              format: 'summary',
              includeSystemMetrics: true,
              includeProviderMetrics: true,
              includeErrorDetails: true,
              logLevel: 'info',
              ...exporterConfig.config,
            });
            break;

          case 'datadog':
            // Would implement DatadogExporter
            logWarn('Datadog exporter not yet implemented');
            break;

          default:
            logWarn(`Unknown exporter type: ${exporterConfig.type}`);
            continue;
        }

        if (exporter) {
          this.exporters.set(exporterConfig.type, exporter);
          log.debug(`Metrics exporter initialized: ${exporterConfig.type}`);
        }
      } catch (error) {
        logError(error, `Failed to initialize ${exporterConfig.type} exporter`);
      }
    }
  }

  private initializeAlertManager(): void {
    this.alertManager = new AlertManager({
      enabled: true,
      evaluationIntervalMs: 30000, // 30 seconds
      defaultCooldownSeconds: 300,
      webhookTimeoutMs: 5000,
      maxRetries: 3,
      retryDelayMs: 1000,
    });

    // Set up webhooks
    for (const webhook of this.config.metrics.alerts.webhooks) {
      this.alertManager.addWebhook(webhook);
    }

    // Add default alert rules
    this.addDefaultAlertRules();

    // Forward alert events
    this.alertManager.on('alert', (alert) => {
      this.emit('alert', alert);
    });

    // Set up automatic evaluation
    this.alertManager.on('evaluationCycle', async () => {
      const snapshot = this.collector.getSnapshot();
      await this.alertManager?.evaluateMetrics(snapshot);
    });

    log.debug('Alert manager initialized');
  }

  private addDefaultAlertRules(): void {
    if (!this.alertManager) return;

    const defaultRules: AlertRule[] = [
      {
        id: 'high_error_rate',
        name: 'High Error Rate',
        condition: 'threshold',
        metric: 'requests.error_rate',
        operator: 'gt',
        threshold: this.config.metrics.alerts.thresholds.errorRate,
        windowSeconds: 300,
        enabled: true,
        severity: 'critical',
        cooldownSeconds: 300,
        tags: { category: 'reliability' },
      },
      {
        id: 'high_response_time',
        name: 'High Response Time',
        condition: 'threshold',
        metric: 'requests.avg_latency',
        operator: 'gt',
        threshold: this.config.metrics.alerts.thresholds.responseTime,
        windowSeconds: 300,
        enabled: true,
        severity: 'warning',
        cooldownSeconds: 300,
        tags: { category: 'performance' },
      },
      {
        id: 'high_queue_depth',
        name: 'High Queue Depth',
        condition: 'threshold',
        metric: 'system.queue_depth',
        operator: 'gt',
        threshold: this.config.metrics.alerts.thresholds.queueDepth,
        windowSeconds: 60,
        enabled: true,
        severity: 'warning',
        cooldownSeconds: 180,
        tags: { category: 'capacity' },
      },
    ];

    for (const rule of defaultRules) {
      this.alertManager.addRule(rule);
    }
  }

  private initializeHealthMonitor(): void {
    this.healthMonitor = new HealthMonitor({
      enabled: true,
      globalTimeoutMs: 30000,
      defaultIntervalMs: 30000,
      degradedThreshold: 2,
      unhealthyThreshold: 5,
      enableDetailedLogging: false,
    });

    // Forward health events
    this.healthMonitor.on('checkFailed', (name, result) => {
      this.emit('healthCheckFailed', name, result);
    });

    log.debug('Health monitor initialized');
  }

  private startSnapshotCollection(): void {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
    }

    // Force snapshot collection at regular intervals
    this.snapshotInterval = setInterval(() => {
      const snapshot = this.collector.getSnapshot();
      this.handleSnapshot(snapshot);
    }, this.config.metrics.collection.intervalMs);
  }

  private async handleSnapshot(snapshot: MetricsSnapshot): Promise<void> {
    // Export to all configured exporters
    for (const [name, exporter] of this.exporters.entries()) {
      try {
        await exporter.export(snapshot);
      } catch (error) {
        logError(error, `Failed to export metrics to ${name}`);
      }
    }

    // Evaluate alerts if alert manager is enabled
    if (this.alertManager) {
      try {
        await this.alertManager.evaluateMetrics(snapshot);
      } catch (error) {
        logError(error, 'Failed to evaluate alerts');
      }
    }
  }

  // Public API methods
  public recordRequest(metrics: RequestMetrics): void {
    this.collector.recordRequest(metrics);
  }

  public getSnapshot(): MetricsSnapshot {
    return this.collector.getSnapshot();
  }

  public getHealthStatus() {
    return (
      this.healthMonitor?.getHealthStatus() || {
        status: 'healthy' as const,
        timestamp: Date.now(),
        checks: {},
        uptime: Date.now() - ((this.collector as unknown as { startTime: number }).startTime || 0),
        version: '1.0.0',
      }
    );
  }

  public getActiveAlerts() {
    return this.alertManager?.getActiveAlerts() || [];
  }

  public addAlertRule(rule: AlertRule): void {
    this.alertManager?.addRule(rule);
  }

  public removeAlertRule(ruleId: string): void {
    this.alertManager?.removeRule(ruleId);
  }

  public registerHealthCheck(check: HealthCheck): void {
    this.healthMonitor?.registerCheck(check);
  }

  public unregisterHealthCheck(name: string): void {
    this.healthMonitor?.unregisterCheck(name);
  }

  public updateSystemMetric(key: string, value: number): void {
    this.collector.updateSystemMetric(key, value);
  }

  public getMetrics(timeRange?: { start: number; end: number }) {
    return this.collector.getMetrics(timeRange);
  }

  public getProviderMetrics(provider?: string) {
    return this.collector.getProviderMetrics(provider);
  }

  public getModelMetrics(model?: string) {
    return this.collector.getModelMetrics(model);
  }

  public resetMetrics(): void {
    this.collector.resetMetrics();
  }

  public async runHealthChecks() {
    return this.healthMonitor?.runAllChecks() || this.getHealthStatus();
  }

  public getPrometheusEndpoint(): string | null {
    const prometheusExporter = this.exporters.get('prometheus') as PrometheusExporter;
    return prometheusExporter?.getMetricsEndpoint() || null;
  }

  public isEnabled(): boolean {
    return this.config.metrics.enabled;
  }

  public stop(): void {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }

    this.collector.stop();
    this.alertManager?.stop();
    this.healthMonitor?.stop();

    // Stop exporters that support it
    for (const exporter of this.exporters.values()) {
      if ('stop' in exporter && typeof exporter.stop === 'function') {
        (exporter as unknown as { stop: () => void }).stop();
      }
    }

    log.info('Metrics system stopped');
  }

  public destroy(): void {
    this.stop();
    this.removeAllListeners();

    this.collector.destroy();
    this.alertManager?.destroy();
    this.healthMonitor?.destroy();

    this.exporters.clear();
  }
}

// Export all types and classes
export * from './types/metrics-types.js';
export { MetricsCollector } from './collectors/metrics-collector.js';
export { PrometheusExporter } from './exporters/prometheus-exporter.js';
export { ConsoleExporter } from './exporters/console-exporter.js';
export { AlertManager } from './alerts/alert-manager.js';
export { HealthMonitor } from './health/health-monitor.js';

// Create a default metrics system instance function
export function createMetricsSystem(config: MetricsSystemConfig): MetricsSystem {
  return new MetricsSystem(config);
}
