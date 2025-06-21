import log, { logError } from '../../utils/logging.js';
import { EventEmitter } from 'events';
import type {
  RequestMetrics,
  ProviderMetrics,
  ModelMetrics,
  SystemMetrics,
  AggregatedMetrics,
  MetricsSnapshot,
  MetricsCollectorConfig,
  IHealthCheckMetrics,
} from '../types/metrics-types.js';
import { RequestContextManager } from '../../utils/request-context.js';

export class MetricsCollector extends EventEmitter {
  private config: MetricsCollectorConfig;
  private requestBuffer: RequestMetrics[] = [];
  private providerMetrics: Map<string, ProviderMetrics> = new Map();
  private modelMetrics: Map<string, ModelMetrics> = new Map();
  private snapshots: MetricsSnapshot[] = [];
  private collectionInterval: NodeJS.Timeout | null = null;
  private startTime: number = Date.now();
  
  // Health check metrics integration
  private healthCheckMetrics: IHealthCheckMetrics | null = null;

  constructor(config: MetricsCollectorConfig) {
    super();
    this.config = config;

    if (this.config.enabled) {
      this.startCollection();
    }
  }

  public recordRequest(metrics: RequestMetrics): void {
    if (!this.config.enabled) return;

    this.requestBuffer.push(metrics);
    this.updateProviderMetrics(metrics);
    this.updateModelMetrics(metrics);

    // Emit real-time events
    this.emit('request', metrics);

    // Clean up old requests if buffer is too large - more aggressive cleanup
    if (this.requestBuffer.length > 5000) {
      this.requestBuffer = this.requestBuffer.slice(-2500);
      log.debug(`Metrics buffer cleanup: reduced from ${this.requestBuffer.length + 2500} to ${this.requestBuffer.length} entries`);
    }
  }

  private updateProviderMetrics(request: RequestMetrics): void {
    if (!request.provider || !request.model) return;

    const key = `${request.model}:${request.provider}`;
    let metrics = this.providerMetrics.get(key);

    if (!metrics) {
      metrics = {
        name: request.provider,
        model: request.model,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
        errorRate: 0,
        rateLimitHits: 0,
        circuitBreakerTrips: 0,
        consecutiveErrors: 0,
        totalTokensProcessed: 0,
        totalCost: 0,
      };
      this.providerMetrics.set(key, metrics);
    }

    // Update metrics
    metrics.totalRequests++;
    metrics.lastRequestTime = request.timestamp;

    if (request.statusCode >= 200 && request.statusCode < 400) {
      metrics.successfulRequests++;
      metrics.consecutiveErrors = 0;
    } else {
      metrics.failedRequests++;
      metrics.consecutiveErrors++;
      metrics.lastErrorTime = request.timestamp;
    }

    // Update latency (exponential moving average)
    if (metrics.averageLatency === 0) {
      metrics.averageLatency = request.duration;
    } else {
      metrics.averageLatency = metrics.averageLatency * 0.9 + request.duration * 0.1;
    }

    // Update error rate
    metrics.errorRate = metrics.failedRequests / metrics.totalRequests;

    // Track rate limiting and circuit breaker events
    if (request.statusCode === 429) {
      metrics.rateLimitHits++;
    }

    if (request.error?.includes('circuit breaker')) {
      metrics.circuitBreakerTrips++;
    }
  }

  private updateModelMetrics(request: RequestMetrics): void {
    if (!request.model) return;

    let metrics = this.modelMetrics.get(request.model);

    if (!metrics) {
      metrics = {
        name: request.model,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageLatency: 0,
        requestsPerSecond: 0,
        errorRate: 0,
        providers: {},
        loadBalancingStats: {
          strategy: 'unknown',
          distribution: {},
        },
        fallbackStats: {
          triggered: 0,
          successful: 0,
          failed: 0,
        },
      };
      this.modelMetrics.set(request.model, metrics);
    }

    // Update basic metrics
    metrics.totalRequests++;

    if (request.statusCode >= 200 && request.statusCode < 400) {
      metrics.successfulRequests++;
    } else {
      metrics.failedRequests++;
    }

    // Update latency
    if (metrics.averageLatency === 0) {
      metrics.averageLatency = request.duration;
    } else {
      metrics.averageLatency = metrics.averageLatency * 0.9 + request.duration * 0.1;
    }

    // Update error rate
    metrics.errorRate = metrics.failedRequests / metrics.totalRequests;

    // Update provider distribution
    if (request.provider) {
      if (!metrics.loadBalancingStats.distribution[request.provider]) {
        metrics.loadBalancingStats.distribution[request.provider] = 0;
      }
      metrics.loadBalancingStats.distribution[request.provider]++;
    }

    // Track fallback events
    if (request.retries > 0) {
      metrics.fallbackStats.triggered++;
      if (request.statusCode >= 200 && request.statusCode < 400) {
        metrics.fallbackStats.successful++;
      } else {
        metrics.fallbackStats.failed++;
      }
    }
  }

  private collectSystemMetrics(): SystemMetrics {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // Collect timeout-related metrics
    const activeRequestContexts = RequestContextManager.getActiveContextCount();
    const recentRequests = this.requestBuffer.slice(-1000); // Last 1000 requests
    const timeoutCount = recentRequests.filter(r => r.statusCode === 408).length;
    const timeoutRate = recentRequests.length > 0 ? timeoutCount / recentRequests.length : 0;

    return {
      uptime: Date.now() - this.startTime,
      memoryUsage: {
        rss: memUsage.rss,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
      },
      cpuUsage: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      activeConnections: activeRequestContexts, // Use active request contexts as proxy for connections
      queueDepth: 0, // Would be populated by queue manager
      cacheStats: {
        hits: 0, // Would be populated by cache
        misses: 0,
        hitRate: 0,
        size: 0,
      },
      timeoutMetrics: {
        activeRequestContexts,
        timeoutCount,
        timeoutRate,
        recentTimeoutEvents: recentRequests
          .filter(r => r.statusCode === 408)
          .slice(-10) // Last 10 timeout events
          .map(r => ({
            timestamp: r.timestamp,
            model: r.model,
            provider: r.provider,
            duration: r.duration,
          })),
      },
      healthCheckMetrics: this.healthCheckMetrics || undefined,
    };
  }

  /**
   * Update health check metrics from the scheduler
   */
  public updateHealthCheckMetrics(metrics: IHealthCheckMetrics): void {
    this.healthCheckMetrics = { ...metrics };
    this.emit('healthCheckMetrics', metrics);
  }

  private calculateLatencyPercentiles(durations: number[]): { p95: number; p99: number } {
    if (durations.length === 0) return { p95: 0, p99: 0 };

    const sorted = durations.sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);

    return {
      p95: sorted[p95Index] || 0,
      p99: sorted[p99Index] || 0,
    };
  }

  private aggregateMetrics(windowSeconds: number): AggregatedMetrics {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;

    // Filter requests within the window
    const windowRequests = this.requestBuffer.filter((r) => r.timestamp >= windowStart);

    // Calculate request metrics
    const totalRequests = windowRequests.length;
    const successfulRequests = windowRequests.filter(
      (r) => r.statusCode >= 200 && r.statusCode < 400
    ).length;
    const failedRequests = totalRequests - successfulRequests;
    const rps = totalRequests / windowSeconds;

    const durations = windowRequests.map((r) => r.duration);
    const averageLatency =
      durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0;

    const { p95, p99 } = this.calculateLatencyPercentiles(durations);

    // Aggregate model metrics
    const modelMetrics: Record<string, ModelMetrics> = {};
    for (const [modelName, metrics] of this.modelMetrics.entries()) {
      const modelRequests = windowRequests.filter((r) => r.model === modelName);

      modelMetrics[modelName] = {
        ...metrics,
        requestsPerSecond: modelRequests.length / windowSeconds,
      };
    }

    // Calculate error statistics
    const errors = windowRequests.filter((r) => r.error);
    const errorsByType: Record<string, number> = {};
    const errorsByProvider: Record<string, number> = {};

    for (const error of errors) {
      const errorType = this.categorizeError(error.error || 'unknown');
      errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;

      if (error.provider) {
        errorsByProvider[error.provider] = (errorsByProvider[error.provider] || 0) + 1;
      }
    }

    return {
      timestamp: now,
      window: windowSeconds,
      requests: {
        total: totalRequests,
        successful: successfulRequests,
        failed: failedRequests,
        rps,
        averageLatency,
        p95Latency: p95,
        p99Latency: p99,
      },
      models: modelMetrics,
      system: this.collectSystemMetrics(),
      errors: {
        total: errors.length,
        byType: errorsByType,
        byProvider: errorsByProvider,
      },
    };
  }

  private categorizeError(error: string): string {
    const errorLower = error.toLowerCase();

    if (errorLower.includes('timeout')) return 'timeout';
    if (errorLower.includes('rate limit')) return 'rate_limit';
    if (errorLower.includes('unauthorized')) return 'authentication';
    if (errorLower.includes('forbidden')) return 'authorization';
    if (errorLower.includes('not found')) return 'not_found';
    if (errorLower.includes('circuit breaker')) return 'circuit_breaker';
    if (errorLower.includes('network')) return 'network';
    if (errorLower.includes('quota')) return 'quota_exceeded';
    if (errorLower.includes('validation')) return 'validation';

    return 'unknown';
  }

  public getSnapshot(): MetricsSnapshot {
    const aggregated = this.aggregateMetrics(300); // 5-minute window

    return {
      timestamp: Date.now(),
      aggregated,
      health: this.getHealthStatus(),
      alerts: [], // Would be populated by alert manager
    };
  }

  private getHealthStatus() {
    const now = Date.now();
    const recentRequests = this.requestBuffer.filter((r) => now - r.timestamp < 60000); // Last minute

    const errorRate =
      recentRequests.length > 0
        ? recentRequests.filter((r) => r.statusCode >= 400).length / recentRequests.length
        : 0;

    const avgLatency =
      recentRequests.length > 0
        ? recentRequests.reduce((sum, r) => sum + r.duration, 0) / recentRequests.length
        : 0;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (errorRate > 0.5 || avgLatency > 30000) {
      status = 'unhealthy';
    } else if (errorRate > 0.1 || avgLatency > 10000) {
      status = 'degraded';
    }

    return {
      status,
      timestamp: now,
      checks: {
        error_rate: {
          status: (errorRate > 0.5 ? 'unhealthy' : errorRate > 0.1 ? 'degraded' : 'healthy') as
            | 'healthy'
            | 'degraded'
            | 'unhealthy',
          message: `Error rate: ${(errorRate * 100).toFixed(2)}%`,
          duration: 0,
          metadata: { value: errorRate, threshold: 0.1 },
        },
        avg_latency: {
          status: (avgLatency > 30000
            ? 'unhealthy'
            : avgLatency > 10000
              ? 'degraded'
              : 'healthy') as 'healthy' | 'degraded' | 'unhealthy',
          message: `Average latency: ${avgLatency.toFixed(2)}ms`,
          duration: 0,
          metadata: { value: avgLatency, threshold: 10000 },
        },
      },
      uptime: now - this.startTime,
      version: '1.0.0',
    };
  }

  private startCollection(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }

    this.collectionInterval = setInterval(() => {
      try {
        const snapshot = this.getSnapshot();
        this.snapshots.push(snapshot);

        // Clean up old snapshots and provider/model metrics to prevent memory leaks
        if (this.snapshots.length > this.config.maxStoredSnapshots) {
          this.snapshots = this.snapshots.slice(-this.config.maxStoredSnapshots);
        }

        // Periodic cleanup of stale provider and model metrics
        this.cleanupStaleMetrics();

        // Emit snapshot event
        this.emit('snapshot', snapshot);

        log.debug('Metrics snapshot collected', {
          totalRequests: snapshot.aggregated.requests.total,
          errorRate: snapshot.aggregated.requests.failed / snapshot.aggregated.requests.total,
          avgLatency: snapshot.aggregated.requests.averageLatency,
        });
      } catch (error) {
        logError(error, 'Error collecting metrics snapshot');
      }
    }, this.config.intervalMs);

    log.info('Metrics collection started', {
      interval: this.config.intervalMs,
      retentionDays: this.config.retentionDays,
    });
  }

  public getMetrics(timeRange?: { start: number; end: number }): AggregatedMetrics[] {
    let filteredSnapshots = this.snapshots;

    if (timeRange) {
      filteredSnapshots = this.snapshots.filter(
        (s) => s.timestamp >= timeRange.start && s.timestamp <= timeRange.end
      );
    }

    return filteredSnapshots.map((s) => s.aggregated);
  }

  public getProviderMetrics(provider?: string): ProviderMetrics[] {
    const metrics = Array.from(this.providerMetrics.values());

    if (provider) {
      return metrics.filter((m) => m.name === provider);
    }

    return metrics;
  }

  public getModelMetrics(model?: string): ModelMetrics[] {
    const metrics = Array.from(this.modelMetrics.values());

    if (model) {
      return metrics.filter((m) => m.name === model);
    }

    return metrics;
  }

  public resetMetrics(): void {
    this.requestBuffer = [];
    this.providerMetrics.clear();
    this.modelMetrics.clear();
    this.snapshots = [];
    this.startTime = Date.now();

    log.info('Metrics reset');
    this.emit('reset');
  }

  public updateSystemMetric(key: string, value: number): void {
    // This would update system metrics like active connections, queue depth, etc.
    this.emit('systemMetric', { key, value, timestamp: Date.now() });
  }

  public stop(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }

    log.info('Metrics collection stopped');
  }

  /**
   * Clean up stale metrics entries to prevent unbounded memory growth
   */
  private cleanupStaleMetrics(): void {
    const now = Date.now();
    const staleThreshold = 24 * 60 * 60 * 1000; // 24 hours
    
    // Clean up provider metrics that haven't been updated recently
    for (const [key, metrics] of this.providerMetrics.entries()) {
      if (metrics.lastRequestTime && (now - metrics.lastRequestTime) > staleThreshold) {
        this.providerMetrics.delete(key);
      }
    }
    
    // Limit total number of provider metrics to prevent unbounded growth
    if (this.providerMetrics.size > 200) {
      const entries = Array.from(this.providerMetrics.entries());
      // Sort by last request time and keep only the most recent 100
      entries.sort((a, b) => {
        const timeA = a[1].lastRequestTime || 0;
        const timeB = b[1].lastRequestTime || 0;
        return timeB - timeA;
      });
      
      this.providerMetrics.clear();
      for (const [key, value] of entries.slice(0, 100)) {
        this.providerMetrics.set(key, value);
      }
      
      log.debug(`Provider metrics cleanup: reduced from ${entries.length} to ${this.providerMetrics.size} entries`);
    }
    
    // Similar cleanup for model metrics but with higher limits since there are fewer models
    if (this.modelMetrics.size > 50) {
      const entries = Array.from(this.modelMetrics.entries());
      this.modelMetrics.clear();
      for (const [key, value] of entries.slice(0, 25)) {
        this.modelMetrics.set(key, value);
      }
      
      log.debug(`Model metrics cleanup: reduced from ${entries.length} to ${this.modelMetrics.size} entries`);
    }
  }

  public destroy(): void {
    this.stop();
    this.removeAllListeners();
    this.requestBuffer = [];
    this.providerMetrics.clear();
    this.modelMetrics.clear();
    this.snapshots = [];
  }
}
