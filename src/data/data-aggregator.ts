import { EventEmitter } from 'events';
import Redis from 'ioredis';

/**
 * Data Aggregator with redundancy and quality validation
 * Combines multiple data sources with fallback and sanity checks
 */

export interface DataSource {
  id: string;
  name: string;
  priority: number;
  timeout: number;
  enabled: boolean;
  healthCheck: () => Promise<boolean>;
  getPrice: (tokenAddress: string) => Promise<PriceData>;
  getQuote: (params: QuoteParams) => Promise<QuoteData>;
}

export interface PriceData {
  price: number;
  source: string;
  timestamp: number;
  confidence: number; // 0-1 scale
  volume24h?: number;
  liquidity?: number;
}

export interface QuoteParams {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippage: number;
}

export interface QuoteData {
  inputAmount: number;
  outputAmount: number;
  priceImpact: number;
  route: any[];
  source: string;
  timestamp: number;
  confidence: number;
}

export interface ValidationConfig {
  maxSpreadPercent: number;
  minConfidence: number;
  minSources: number;
  outlierThreshold: number;
  maxAge: number; // milliseconds
}

export interface AggregatedData<T> {
  data: T;
  sources: string[];
  confidence: number;
  timestamp: number;
  validationPassed: boolean;
  warnings: string[];
}

export class DataAggregator extends EventEmitter {
  private sources: Map<string, DataSource> = new Map();
  private redis?: Redis;
  private config: ValidationConfig;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(
    config: ValidationConfig,
    redisConfig?: { host: string; port: number; password?: string }
  ) {
    super();
    this.config = config;

    if (redisConfig) {
      this.redis = new Redis({
        ...redisConfig,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true
      });
    }

    this.startHealthChecks();
  }

  registerSource(source: DataSource): void {
    this.sources.set(source.id, source);
    console.log(`📊 Registered data source: ${source.name} (priority: ${source.priority})`);
  }

  async getAggregatedPrice(tokenAddress: string): Promise<AggregatedData<PriceData>> {
    const cacheKey = `price:${tokenAddress}`;
    
    // Try cache first
    const cached = await this.getFromCache(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.config.maxAge) {
      return cached;
    }

    // Fetch from multiple sources
    const results = await this.fetchFromSources('getPrice', tokenAddress);
    const validatedData = this.validatePriceData(results);

    // Cache result
    await this.setCache(cacheKey, validatedData, 30); // 30 second TTL

    return validatedData;
  }

  async getAggregatedQuote(params: QuoteParams): Promise<AggregatedData<QuoteData>> {
    const cacheKey = `quote:${params.inputMint}:${params.outputMint}:${params.amount}:${params.slippage}`;
    
    // Try cache first (shorter TTL for quotes)
    const cached = await this.getFromCache(cacheKey);
    if (cached && Date.now() - cached.timestamp < 10000) { // 10 second cache
      return cached;
    }

    // Fetch from multiple sources
    const results = await this.fetchFromSources('getQuote', params);
    const validatedData = this.validateQuoteData(results);

    // Cache result
    await this.setCache(cacheKey, validatedData, 10); // 10 second TTL

    return validatedData;
  }

  private async fetchFromSources(method: string, params: any): Promise<any[]> {
    const enabledSources = Array.from(this.sources.values())
      .filter(source => source.enabled)
      .sort((a, b) => a.priority - b.priority);

    const promises = enabledSources.map(async (source) => {
      try {
        const startTime = Date.now();
        const result = await Promise.race([
          (source as any)[method](params),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), source.timeout)
          )
        ]);

        const latency = Date.now() - startTime;
        
        return {
          source: source.id,
          data: result,
          latency,
          success: true
        };
      } catch (error) {
        console.warn(`❌ Source ${source.id} failed:`, error);
        this.emit('sourceError', { source: source.id, error, method });
        
        return {
          source: source.id,
          error: error instanceof Error ? error.message : 'Unknown error',
          success: false
        };
      }
    });

    const results = await Promise.allSettled(promises);
    
    return results
      .filter((result): result is PromiseFulfilledResult<any> => 
        result.status === 'fulfilled' && result.value.success
      )
      .map(result => result.value);
  }

  private validatePriceData(results: any[]): AggregatedData<PriceData> {
    const warnings: string[] = [];
    
    if (results.length < this.config.minSources) {
      warnings.push(`Insufficient sources: ${results.length} < ${this.config.minSources}`);
    }

    // Extract prices and calculate statistics
    const prices = results.map(r => r.data.price).filter(p => p > 0);
    
    if (prices.length === 0) {
      return {
        data: { price: 0, source: 'none', timestamp: Date.now(), confidence: 0 },
        sources: [],
        confidence: 0,
        timestamp: Date.now(),
        validationPassed: false,
        warnings: ['No valid prices available']
      };
    }

    const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const spread = ((maxPrice - minPrice) / avgPrice) * 100;

    // Check spread
    if (spread > this.config.maxSpreadPercent) {
      warnings.push(`High spread: ${spread.toFixed(2)}% > ${this.config.maxSpreadPercent}%`);
    }

    // Remove outliers
    const filteredResults = results.filter(r => {
      const deviation = Math.abs(r.data.price - avgPrice) / avgPrice;
      return deviation <= this.config.outlierThreshold;
    });

    // Calculate weighted average (by confidence and inverse latency)
    let weightedSum = 0;
    let totalWeight = 0;

    filteredResults.forEach(result => {
      const confidence = result.data.confidence || 0.5;
      const latencyWeight = 1 / (1 + result.latency / 1000); // Lower latency = higher weight
      const weight = confidence * latencyWeight;
      
      weightedSum += result.data.price * weight;
      totalWeight += weight;
    });

    const finalPrice = totalWeight > 0 ? weightedSum / totalWeight : avgPrice;
    const confidence = Math.min(
      filteredResults.length / this.config.minSources,
      1 - (spread / 100),
      totalWeight / filteredResults.length
    );

    // Select best source data for additional fields
    const bestResult = filteredResults.reduce((best, current) => {
      const bestScore = (best.data.confidence || 0.5) / (1 + best.latency / 1000);
      const currentScore = (current.data.confidence || 0.5) / (1 + current.latency / 1000);
      return currentScore > bestScore ? current : best;
    }, filteredResults[0]);

    return {
      data: {
        price: finalPrice,
        source: `aggregated(${filteredResults.map(r => r.source).join(',')})`,
        timestamp: Date.now(),
        confidence,
        volume24h: bestResult?.data.volume24h,
        liquidity: bestResult?.data.liquidity
      },
      sources: filteredResults.map(r => r.source),
      confidence,
      timestamp: Date.now(),
      validationPassed: warnings.length === 0 && confidence >= this.config.minConfidence,
      warnings
    };
  }

  private validateQuoteData(results: any[]): AggregatedData<QuoteData> {
    const warnings: string[] = [];
    
    if (results.length < this.config.minSources) {
      warnings.push(`Insufficient sources: ${results.length} < ${this.config.minSources}`);
    }

    if (results.length === 0) {
      return {
        data: { 
          inputAmount: 0, 
          outputAmount: 0, 
          priceImpact: 100, 
          route: [], 
          source: 'none', 
          timestamp: Date.now(), 
          confidence: 0 
        },
        sources: [],
        confidence: 0,
        timestamp: Date.now(),
        validationPassed: false,
        warnings: ['No valid quotes available']
      };
    }

    // Find best quote (highest output amount with reasonable price impact)
    const bestQuote = results.reduce((best, current) => {
      const bestScore = best.data.outputAmount * (1 - best.data.priceImpact / 100);
      const currentScore = current.data.outputAmount * (1 - current.data.priceImpact / 100);
      return currentScore > bestScore ? current : best;
    });

    const confidence = Math.min(
      results.length / this.config.minSources,
      1 - (bestQuote.data.priceImpact / 100),
      bestQuote.data.confidence || 0.5
    );

    return {
      data: {
        ...bestQuote.data,
        source: `best_of(${results.map(r => r.source).join(',')})`
      },
      sources: results.map(r => r.source),
      confidence,
      timestamp: Date.now(),
      validationPassed: warnings.length === 0 && confidence >= this.config.minConfidence,
      warnings
    };
  }

  private async getFromCache(key: string): Promise<any | null> {
    if (!this.redis) return null;

    try {
      const cached = await this.redis.get(`aggregator:${key}`);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.warn('Cache get error:', error);
      return null;
    }
  }

  private async setCache(key: string, data: any, ttlSeconds: number): Promise<void> {
    if (!this.redis) return;

    try {
      await this.redis.setex(`aggregator:${key}`, ttlSeconds, JSON.stringify(data));
    } catch (error) {
      console.warn('Cache set error:', error);
    }
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const [id, source] of this.sources) {
        try {
          const isHealthy = await source.healthCheck();
          if (!isHealthy && source.enabled) {
            console.warn(`⚠️ Source ${id} health check failed, disabling`);
            source.enabled = false;
            this.emit('sourceDisabled', { source: id, reason: 'health_check_failed' });
          } else if (isHealthy && !source.enabled) {
            console.log(`✅ Source ${id} recovered, enabling`);
            source.enabled = true;
            this.emit('sourceEnabled', { source: id });
          }
        } catch (error) {
          console.error(`Health check error for ${id}:`, error);
        }
      }
    }, 30000); // Every 30 seconds
  }

  getSourceStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    for (const [id, source] of this.sources) {
      status[id] = {
        name: source.name,
        enabled: source.enabled,
        priority: source.priority,
        timeout: source.timeout
      };
    }
    
    return status;
  }

  async disconnect(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    if (this.redis) {
      await this.redis.disconnect();
    }
  }
}

/**
 * Default validation configuration
 */
export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  maxSpreadPercent: 5, // 5% max spread between sources
  minConfidence: 0.7,  // 70% minimum confidence
  minSources: 2,       // At least 2 sources required
  outlierThreshold: 0.1, // 10% deviation threshold for outliers
  maxAge: 30000        // 30 seconds max age
};
