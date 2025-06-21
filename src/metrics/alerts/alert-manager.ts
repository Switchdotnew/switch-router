import log from '../../utils/logging.js';
import { logError, logWarn } from '../../utils/logging.js';
import { EventEmitter } from 'events';
import type {
  MetricsSnapshot,
  MetricAlert,
  AlertRule,
  AggregatedMetrics,
} from '../types/metrics-types.js';

export interface AlertManagerConfig {
  enabled: boolean;
  evaluationIntervalMs: number;
  defaultCooldownSeconds: number;
  webhookTimeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

export interface AlertWebhook {
  url: string;
  events: string[];
  headers?: Record<string, string>;
  timeout?: number;
}

export class AlertManager extends EventEmitter {
  private config: AlertManagerConfig;
  private rules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, MetricAlert> = new Map();
  private lastAlertTimes: Map<string, number> = new Map();
  private webhooks: AlertWebhook[] = [];
  private evaluationInterval: NodeJS.Timeout | null = null;

  constructor(config: AlertManagerConfig) {
    super();
    this.config = {
      enabled: config.enabled,
      evaluationIntervalMs: config.evaluationIntervalMs,
      defaultCooldownSeconds: config.defaultCooldownSeconds || 300, // 5 minutes
      webhookTimeoutMs: config.webhookTimeoutMs || 5000,
      maxRetries: config.maxRetries || 3,
      retryDelayMs: config.retryDelayMs || 1000,
    };

    if (this.config.enabled) {
      this.startEvaluation();
    }
  }

  public addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
    log.debug(`Alert rule added: ${rule.name} (${rule.id})`);
  }

  public removeRule(ruleId: string): void {
    this.rules.delete(ruleId);

    // Remove any active alerts for this rule
    const alertsToRemove = Array.from(this.activeAlerts.values()).filter((alert) =>
      alert.id.startsWith(ruleId)
    );

    for (const alert of alertsToRemove) {
      this.resolveAlert(alert.id);
    }

    log.debug(`Alert rule removed: ${ruleId}`);
  }

  public addWebhook(webhook: AlertWebhook): void {
    this.webhooks.push(webhook);
    log.debug(`Alert webhook added: ${webhook.url}`);
  }

  public async evaluateMetrics(snapshot: MetricsSnapshot): Promise<MetricAlert[]> {
    if (!this.config.enabled) return [];

    const newAlerts: MetricAlert[] = [];
    const currentTime = Date.now();

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      try {
        const alertResult = await this.evaluateRule(rule, snapshot.aggregated, currentTime);
        if (alertResult) {
          newAlerts.push(alertResult);
        }
      } catch (error) {
        logError(error, `Error evaluating alert rule ${rule.name}`);
      }
    }

    // Check for alerts that should be resolved
    await this.checkForResolutions(snapshot.aggregated, currentTime);

    return newAlerts;
  }

  private async evaluateRule(
    rule: AlertRule,
    metrics: AggregatedMetrics,
    currentTime: number
  ): Promise<MetricAlert | null> {
    const value = this.extractMetricValue(rule.metric, metrics);
    if (value === null) return null;

    const isTriggered = this.evaluateCondition(rule, value);
    const alertId = `${rule.id}_${rule.metric}`;
    const existingAlert = this.activeAlerts.get(alertId);
    const lastAlertTime = this.lastAlertTimes.get(alertId) || 0;
    const cooldownMs = rule.cooldownSeconds * 1000;

    if (isTriggered && !existingAlert && currentTime - lastAlertTime > cooldownMs) {
      // Create new alert
      const alert: MetricAlert = {
        id: alertId,
        name: rule.name,
        condition: `${rule.metric} ${rule.operator} ${rule.threshold}`,
        threshold: rule.threshold,
        value,
        status: rule.severity === 'critical' ? 'critical' : 'warning',
        timestamp: currentTime,
        message: this.generateAlertMessage(rule, value),
        tags: { ...rule.tags },
      };

      this.activeAlerts.set(alertId, alert);
      this.lastAlertTimes.set(alertId, currentTime);

      // Emit events
      this.emit('alertTriggered', alert);
      this.emit('alert', alert);

      // Send webhooks
      await this.sendWebhooks('triggered', alert);

      log.warn(`Alert triggered: ${alert.name}`, {
        metric: rule.metric,
        value,
        threshold: rule.threshold,
        condition: alert.condition,
      });

      return alert;
    } else if (!isTriggered && existingAlert) {
      // Resolve existing alert
      await this.resolveAlert(alertId);
    } else if (existingAlert) {
      // Update existing alert value
      existingAlert.value = value;
      existingAlert.timestamp = currentTime;
    }

    return null;
  }

  private async resolveAlert(alertId: string): Promise<void> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return;

    alert.status = 'resolved';
    alert.timestamp = Date.now();

    this.activeAlerts.delete(alertId);

    // Emit events
    this.emit('alertResolved', alert);
    this.emit('alert', alert);

    // Send webhooks
    await this.sendWebhooks('resolved', alert);

    log.info(`Alert resolved: ${alert.name}`, {
      condition: alert.condition,
      value: alert.value,
    });
  }

  private async checkForResolutions(
    metrics: AggregatedMetrics,
    _currentTime: number
  ): Promise<void> {
    for (const [alertId, _alert] of this.activeAlerts.entries()) {
      const rule = Array.from(this.rules.values()).find((r) => alertId.startsWith(r.id));
      if (!rule) {
        // Rule was removed, resolve the alert
        await this.resolveAlert(alertId);
        continue;
      }

      const value = this.extractMetricValue(rule.metric, metrics);
      if (value !== null && !this.evaluateCondition(rule, value)) {
        await this.resolveAlert(alertId);
      }
    }
  }

  private extractMetricValue(metric: string, metrics: AggregatedMetrics): number | null {
    try {
      // Handle different metric paths
      switch (metric) {
        case 'requests.error_rate':
          return metrics.requests.total > 0 ? metrics.requests.failed / metrics.requests.total : 0;

        case 'requests.rps':
          return metrics.requests.rps;

        case 'requests.avg_latency':
          return metrics.requests.averageLatency;

        case 'requests.p95_latency':
          return metrics.requests.p95Latency;

        case 'requests.p99_latency':
          return metrics.requests.p99Latency;

        case 'system.memory_usage_percent':
          return (metrics.system.memoryUsage.heapUsed / metrics.system.memoryUsage.heapTotal) * 100;

        case 'system.queue_depth':
          return metrics.system.queueDepth;

        case 'system.active_connections':
          return metrics.system.activeConnections;

        case 'errors.total':
          return metrics.errors.total;

        default: {
          // Handle model-specific metrics
          const modelMatch = metric.match(/^models\.([^.]+)\.(.+)$/);
          if (modelMatch) {
            const [, modelName, modelMetric] = modelMatch;
            const modelData = metrics.models[modelName];
            if (!modelData) return null;

            switch (modelMetric) {
              case 'error_rate':
                return modelData.errorRate;
              case 'avg_latency':
                return modelData.averageLatency;
              case 'rps':
                return modelData.requestsPerSecond;
              case 'total_requests':
                return modelData.totalRequests;
              default:
                return null;
            }
          }

          // Handle provider-specific metrics
          const providerMatch = metric.match(/^models\.([^.]+)\.providers\.([^.]+)\.(.+)$/);
          if (providerMatch) {
            const [, modelName, providerName, providerMetric] = providerMatch;
            const providerData = metrics.models[modelName]?.providers[providerName];
            if (!providerData) return null;

            switch (providerMetric) {
              case 'error_rate':
                return providerData.errorRate;
              case 'avg_latency':
                return providerData.averageLatency;
              case 'consecutive_errors':
                return providerData.consecutiveErrors;
              case 'circuit_breaker_trips':
                return providerData.circuitBreakerTrips;
              default:
                return null;
            }
          }

          return null;
        }
      }
    } catch (error) {
      logError(error, `Error extracting metric value for ${metric}`);
      return null;
    }
  }

  private evaluateCondition(rule: AlertRule, value: number): boolean {
    switch (rule.operator) {
      case 'gt':
        return value > rule.threshold;
      case 'gte':
        return value >= rule.threshold;
      case 'lt':
        return value < rule.threshold;
      case 'lte':
        return value <= rule.threshold;
      case 'eq':
        return value === rule.threshold;
      case 'ne':
        return value !== rule.threshold;
      default:
        return false;
    }
  }

  private generateAlertMessage(rule: AlertRule, value: number): string {
    const formattedValue = this.formatValue(rule.metric, value);
    const formattedThreshold = this.formatValue(rule.metric, rule.threshold);

    return `${rule.name}: ${rule.metric} is ${formattedValue} (threshold: ${formattedThreshold})`;
  }

  private formatValue(metric: string, value: number): string {
    if (metric.includes('rate') || metric.includes('percent')) {
      return `${(value * 100).toFixed(2)}%`;
    } else if (metric.includes('latency') || metric.includes('duration')) {
      return `${value.toFixed(2)}ms`;
    } else if (metric.includes('memory') && metric.includes('bytes')) {
      return this.formatBytes(value);
    } else {
      return value.toFixed(2);
    }
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

  private async sendWebhooks(event: string, alert: MetricAlert): Promise<void> {
    const relevantWebhooks = this.webhooks.filter(
      (webhook) => webhook.events.includes(event) || webhook.events.includes('all')
    );

    for (const webhook of relevantWebhooks) {
      try {
        await this.sendWebhookWithRetry(webhook, event, alert);
      } catch (error) {
        logError(error, `Failed to send webhook to ${webhook.url}`);
      }
    }
  }

  private async sendWebhookWithRetry(
    webhook: AlertWebhook,
    event: string,
    alert: MetricAlert
  ): Promise<void> {
    const payload = {
      event,
      alert,
      timestamp: Date.now(),
    };

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'LLM-Gateway-AlertManager/1.0',
            ...webhook.headers,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(webhook.timeout || this.config.webhookTimeoutMs),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        log.debug(`Webhook sent successfully to ${webhook.url}`, { event, alert: alert.name });
        return;
      } catch (error) {
        if (attempt === this.config.maxRetries) {
          throw error;
        }

        logWarn(`Webhook attempt ${attempt} failed, retrying: ${String(error)}`);
        await this.sleep(this.config.retryDelayMs * attempt);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private startEvaluation(): void {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
    }

    this.evaluationInterval = setInterval(() => {
      this.emit('evaluationCycle');
    }, this.config.evaluationIntervalMs);

    log.info('Alert manager evaluation started', {
      interval: this.config.evaluationIntervalMs,
      rules: this.rules.size,
    });
  }

  public getActiveAlerts(): MetricAlert[] {
    return Array.from(this.activeAlerts.values());
  }

  public getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  public getAlertHistory(_hours = 24): MetricAlert[] {
    // This would typically be stored in a database
    // For now, return empty array as we don't persist history
    return [];
  }

  public updateRule(ruleId: string, updates: Partial<AlertRule>): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      Object.assign(rule, updates);
      log.debug(`Alert rule updated: ${rule.name} (${ruleId})`);
    }
  }

  public stop(): void {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
      this.evaluationInterval = null;
    }

    log.info('Alert manager evaluation stopped');
  }

  public destroy(): void {
    this.stop();
    this.removeAllListeners();
    this.rules.clear();
    this.activeAlerts.clear();
    this.lastAlertTimes.clear();
    this.webhooks = [];
  }
}
