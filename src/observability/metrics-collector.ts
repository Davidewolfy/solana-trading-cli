import { EventEmitter } from 'events';

/**
 * Metrics Collector for performance monitoring
 */

export interface MetricValue {
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface PercentileStats {
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  mean: number;
  count: number;
}

export interface MetricSummary {
  name: string;
  stats: PercentileStats;
  recent: MetricValue[];
  tags: Record<string, string>;
}

export class MetricsCollector extends EventEmitter {
  private metrics: Map<string, MetricValue[]> = new Map();
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private maxHistorySize = 1000;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: { maxHistorySize?: number; cleanupInterval?: number } = {}) {
    super();
    this.maxHistorySize = config.maxHistorySize || 1000;
    
    if (config.cleanupInterval) {
      this.startCleanup(config.cleanupInterval);
    }
  }

  /**
   * Record a timing metric
   */
  timing(name: string, value: number, tags: Record<string, string> = {}): void {
    this.recordMetric(name, value, tags);
    this.addToHistogram(name, value);
    
    this.emit('timing', { name, value, tags, timestamp: Date.now() });
  }

  /**
   * Increment a counter
   */
  increment(name: string, value = 1, tags: Record<string, string> = {}): void {
    const key = this.getMetricKey(name, tags);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
    
    this.emit('counter', { name, value: current + value, tags, timestamp: Date.now() });
  }

  /**
   * Set a gauge value
   */
  gauge(name: string, value: number, tags: Record<string, string> = {}): void {
    const key = this.getMetricKey(name, tags);
    this.gauges.set(key, value);
    
    this.emit('gauge', { name, value, tags, timestamp: Date.now() });
  }

  /**
   * Record a histogram value
   */
  histogram(name: string, value: number, tags: Record<string, string> = {}): void {
    this.addToHistogram(name, value);
    this.recordMetric(name, value, tags);
    
    this.emit('histogram', { name, value, tags, timestamp: Date.now() });
  }

  /**
   * Time a function execution
   */
  async timeFunction<T>(
    name: string,
    fn: () => Promise<T>,
    tags: Record<string, string> = {}
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      
      this.timing(name, duration, { ...tags, success: 'true' });
      this.increment(`${name}_total`, 1, { ...tags, success: 'true' });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.timing(name, duration, { ...tags, success: 'false' });
      this.increment(`${name}_total`, 1, { ...tags, success: 'false' });
      this.increment(`${name}_errors`, 1, tags);
      
      throw error;
    }
  }

  /**
   * Get percentile statistics for a metric
   */
  getPercentiles(name: string): PercentileStats | null {
    const values = this.histograms.get(name);
    if (!values || values.length === 0) {
      return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;

    return {
      p50: this.percentile(sorted, 0.5),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
      min: sorted[0],
      max: sorted[count - 1],
      mean: sorted.reduce((sum, val) => sum + val, 0) / count,
      count
    };
  }

  /**
   * Get all metrics summary
   */
  getMetricsSummary(): Record<string, MetricSummary> {
    const summary: Record<string, MetricSummary> = {};

    // Process histograms
    for (const [name, values] of this.histograms) {
      const stats = this.getPercentiles(name);
      if (stats) {
        const recentMetrics = this.metrics.get(name) || [];
        summary[name] = {
          name,
          stats,
          recent: recentMetrics.slice(-10), // Last 10 values
          tags: {}
        };
      }
    }

    return summary;
  }

  /**
   * Get counter values
   */
  getCounters(): Record<string, number> {
    return Object.fromEntries(this.counters);
  }

  /**
   * Get gauge values
   */
  getGauges(): Record<string, number> {
    return Object.fromEntries(this.gauges);
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics.clear();
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    
    this.emit('reset', { timestamp: Date.now() });
  }

  /**
   * Get trading-specific metrics
   */
  getTradingMetrics(): {
    latency: PercentileStats | null;
    slippage: PercentileStats | null;
    successRate: number;
    costPerTrade: PercentileStats | null;
    routerPerformance: Record<string, PercentileStats | null>;
  } {
    const latency = this.getPercentiles('trade_execution_duration');
    const slippage = this.getPercentiles('trade_slippage');
    const costPerTrade = this.getPercentiles('trade_cost');

    // Calculate success rate
    const totalTrades = this.counters.get('trade_total') || 0;
    const successfulTrades = this.counters.get('trade_total_success:true') || 0;
    const successRate = totalTrades > 0 ? (successfulTrades / totalTrades) * 100 : 0;

    // Router performance
    const routerPerformance: Record<string, PercentileStats | null> = {};
    const routers = ['jupiter', 'raydium', 'orca', 'meteora'];
    
    routers.forEach(router => {
      routerPerformance[router] = this.getPercentiles(`trade_execution_duration_router:${router}`);
    });

    return {
      latency,
      slippage,
      successRate,
      costPerTrade,
      routerPerformance
    };
  }

  private recordMetric(name: string, value: number, tags: Record<string, string>): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metrics = this.metrics.get(name)!;
    metrics.push({
      value,
      timestamp: Date.now(),
      tags
    });

    // Keep only recent values
    if (metrics.length > this.maxHistorySize) {
      metrics.splice(0, metrics.length - this.maxHistorySize);
    }
  }

  private addToHistogram(name: string, value: number): void {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, []);
    }

    const histogram = this.histograms.get(name)!;
    histogram.push(value);

    // Keep only recent values
    if (histogram.length > this.maxHistorySize) {
      histogram.splice(0, histogram.length - this.maxHistorySize);
    }
  }

  private getMetricKey(name: string, tags: Record<string, string>): string {
    const tagString = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}:${value}`)
      .join('_');
    
    return tagString ? `${name}_${tagString}` : name;
  }

  private percentile(sortedArray: number[], p: number): number {
    const index = (sortedArray.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;

    if (upper >= sortedArray.length) {
      return sortedArray[sortedArray.length - 1];
    }

    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }

  private startCleanup(intervalMs: number): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldMetrics();
    }, intervalMs);
  }

  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago

    for (const [name, metrics] of this.metrics) {
      const filtered = metrics.filter(metric => metric.timestamp > cutoff);
      this.metrics.set(name, filtered);
    }
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

/**
 * Trading Metrics - specialized metrics for trading operations
 */
export class TradingMetrics {
  private metrics: MetricsCollector;

  constructor(metrics: MetricsCollector) {
    this.metrics = metrics;
  }

  /**
   * Record trade execution metrics
   */
  recordTrade(params: {
    dex: string;
    side: 'buy' | 'sell';
    duration: number;
    success: boolean;
    slippage?: number;
    cost?: number;
    amount?: number;
    executionMethod?: string;
  }): void {
    const tags = {
      dex: params.dex,
      side: params.side,
      success: params.success.toString(),
      executionMethod: params.executionMethod || 'unknown'
    };

    // Record execution time
    this.metrics.timing('trade_execution_duration', params.duration, tags);

    // Record success/failure
    this.metrics.increment('trade_total', 1, tags);

    // Record slippage if provided
    if (params.slippage !== undefined) {
      this.metrics.histogram('trade_slippage', params.slippage, tags);
    }

    // Record cost if provided
    if (params.cost !== undefined) {
      this.metrics.histogram('trade_cost', params.cost, tags);
    }

    // Record amount if provided
    if (params.amount !== undefined) {
      this.metrics.histogram('trade_amount', params.amount, tags);
    }
  }

  /**
   * Record quote metrics
   */
  recordQuote(params: {
    dex: string;
    duration: number;
    success: boolean;
    priceImpact?: number;
  }): void {
    const tags = {
      dex: params.dex,
      success: params.success.toString()
    };

    this.metrics.timing('quote_duration', params.duration, tags);
    this.metrics.increment('quote_total', 1, tags);

    if (params.priceImpact !== undefined) {
      this.metrics.histogram('quote_price_impact', params.priceImpact, tags);
    }
  }

  /**
   * Record streaming metrics
   */
  recordStreamingEvent(params: {
    dex: string;
    eventType: string;
    processingTime: number;
  }): void {
    const tags = {
      dex: params.dex,
      eventType: params.eventType
    };

    this.metrics.timing('streaming_processing_time', params.processingTime, tags);
    this.metrics.increment('streaming_events_total', 1, tags);
  }

  /**
   * Record system metrics
   */
  recordSystemMetrics(params: {
    memoryUsage: number;
    cpuUsage: number;
    activeConnections: number;
    queueSize: number;
  }): void {
    this.metrics.gauge('system_memory_usage', params.memoryUsage);
    this.metrics.gauge('system_cpu_usage', params.cpuUsage);
    this.metrics.gauge('system_active_connections', params.activeConnections);
    this.metrics.gauge('system_queue_size', params.queueSize);
  }
}

/**
 * Global metrics collector
 */
export const metricsCollector = new MetricsCollector({
  maxHistorySize: 1000,
  cleanupInterval: 60000 // 1 minute
});

/**
 * Global trading metrics
 */
export const tradingMetrics = new TradingMetrics(metricsCollector);
