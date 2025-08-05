import { EventEmitter } from 'events';
import { 
  DexAdapter, 
  QuoteParams, 
  TradeParams, 
  TradeResult, 
  Quote, 
  RouterConfig, 
  RouterStats,
  DEFAULT_ROUTER_CONFIG 
} from './types';
import { scoreQuotes, getBestQuote, filterQuotesByQuality } from './scoring';

/**
 * Unified Router - Single interface for all DEX trading
 */
export class UnifiedRouter extends EventEmitter {
  private adapters: Map<string, DexAdapter> = new Map();
  private config: RouterConfig;
  private stats: RouterStats;

  constructor(config: Partial<RouterConfig> = {}) {
    super();
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...config };
    this.stats = {
      totalQuotes: 0,
      totalTrades: 0,
      successRate: 0,
      averageLatency: 0,
      dexUsage: {} as any,
      lastUpdated: Date.now()
    };
  }

  /**
   * Register a DEX adapter
   */
  registerAdapter(adapter: DexAdapter): void {
    this.adapters.set(adapter.name, adapter);
    this.stats.dexUsage[adapter.name] = 0;
    
    console.log(`📝 Registered DEX adapter: ${adapter.name}`);
    this.emit('adapterRegistered', { name: adapter.name });
  }

  /**
   * Get quotes from all adapters in parallel with fallback logic
   */
  async quoteAll(params: QuoteParams): Promise<{ quotes: Quote[]; best: Quote | null }> {
    const startTime = Date.now();
    this.stats.totalQuotes++;

    try {
      if (!this.config.enableParallelQuotes) {
        // Sequential quotes (fallback mode)
        return await this.quoteSequential(params);
      }

      // Parallel quotes with timeout and fallback
      const quotePromises = Array.from(this.adapters.values()).map(async (adapter) => {
        try {
          const quote = await Promise.race([
            adapter.quote(params),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Quote timeout')), this.config.timeoutMs)
            )
          ]);

          this.emit('quoteReceived', { adapter: adapter.name, quote, latency: Date.now() - startTime });
          return { adapter: adapter.name, quote, error: null };
        } catch (error) {
          this.emit('quoteError', { adapter: adapter.name, error });
          return { adapter: adapter.name, quote: null, error };
        }
      });

      const results = await Promise.allSettled(quotePromises);
      const adapterResults = results
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
        .map(result => result.value);

      const quotes = adapterResults
        .filter(result => result.quote !== null)
        .map(result => result.quote);

      // If no quotes received within timeout, try fallback to default DEX
      if (quotes.length === 0) {
        console.warn('⚠️ No quotes received, trying fallback to default DEX');
        return await this.quoteFallback(params);
      }

      // Filter quotes by quality thresholds
      const filteredQuotes = filterQuotesByQuality(quotes, {
        maxPriceImpact: 10, // Max 10% price impact
        minConfidence: 0.5  // Min 50% confidence
      });

      const best = getBestQuote(filteredQuotes, this.config.scoringWeights);

      // Update stats
      this.updateLatencyStats(Date.now() - startTime);

      this.emit('quotesCompleted', {
        total: quotes.length,
        filtered: filteredQuotes.length,
        best: best?.dex,
        fallbackUsed: false
      });

      return { quotes: filteredQuotes, best };

    } catch (error) {
      console.error('❌ Quote error, trying fallback:', error);
      this.emit('quotesError', error);

      // Try fallback before throwing
      try {
        return await this.quoteFallback(params);
      } catch (fallbackError) {
        throw new Error(`All quote methods failed. Original: ${error instanceof Error ? error.message : 'Unknown'}, Fallback: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown'}`);
      }
    }
  }

  /**
   * Execute trade using best available route
   */
  async trade(params: TradeParams): Promise<TradeResult> {
    const startTime = Date.now();
    this.stats.totalTrades++;

    try {
      // Get quotes first
      const { quotes, best } = await this.quoteAll(params);
      
      if (!best) {
        throw new Error('No valid quotes available');
      }

      // Find the adapter for the best quote
      const adapter = this.adapters.get(best.dex);
      if (!adapter) {
        throw new Error(`Adapter not found for DEX: ${best.dex}`);
      }

      // Execute trade with retry logic
      let lastError: Error | null = null;
      
      for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
        try {
          this.emit('tradeAttempt', { 
            adapter: adapter.name, 
            attempt, 
            params: { ...params, wallet: '[REDACTED]' } 
          });

          const result = await adapter.trade(params);
          
          // Update stats
          this.updateTradeStats(adapter.name, result.success, Date.now() - startTime);
          
          this.emit('tradeCompleted', { 
            adapter: adapter.name, 
            success: result.success, 
            signature: result.signature 
          });

          return result;

        } catch (error) {
          lastError = error as Error;
          this.emit('tradeError', { 
            adapter: adapter.name, 
            attempt, 
            error: lastError.message 
          });

          if (attempt < this.config.maxRetries) {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
        }
      }

      // All retries failed
      const failedResult: TradeResult = {
        dex: best.dex,
        success: false,
        error: lastError?.message || 'Trade failed after retries',
        idempotencyKey: params.idempotencyKey
      };

      this.updateTradeStats(adapter.name, false, Date.now() - startTime);
      return failedResult;

    } catch (error) {
      this.emit('tradeFailed', error);
      
      return {
        dex: this.config.defaultDex,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        idempotencyKey: params.idempotencyKey
      };
    }
  }

  /**
   * Simulate trade without execution
   */
  async simulate(params: QuoteParams): Promise<{ quotes: Quote[]; simulations: any[] }> {
    const { quotes } = await this.quoteAll(params);
    const simulations = [];

    for (const quote of quotes) {
      const adapter = this.adapters.get(quote.dex);
      if (adapter?.simulate) {
        try {
          const simulation = await adapter.simulate(params);
          simulations.push({ dex: quote.dex, simulation });
        } catch (error) {
          simulations.push({ 
            dex: quote.dex, 
            simulation: { success: false, error: error instanceof Error ? error.message : 'Simulation failed' }
          });
        }
      }
    }

    return { quotes, simulations };
  }

  /**
   * Get router statistics
   */
  getStats(): RouterStats {
    return { ...this.stats, lastUpdated: Date.now() };
  }

  /**
   * Health check for all adapters
   */
  async healthCheck(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    
    const healthPromises = Array.from(this.adapters.entries()).map(async ([name, adapter]) => {
      try {
        const healthy = adapter.healthCheck ? await adapter.healthCheck() : true;
        results[name] = healthy;
      } catch (error) {
        results[name] = false;
      }
    });

    await Promise.allSettled(healthPromises);
    return results;
  }

  private async quoteSequential(params: QuoteParams): Promise<{ quotes: Quote[]; best: Quote | null }> {
    const quotes: Quote[] = [];

    // Try default DEX first
    const defaultAdapter = this.adapters.get(this.config.defaultDex);
    if (defaultAdapter) {
      try {
        const quote = await defaultAdapter.quote(params);
        quotes.push(quote);
        this.emit('quoteReceived', { adapter: defaultAdapter.name, quote, latency: 0 });
      } catch (error) {
        console.warn(`Default DEX ${this.config.defaultDex} failed:`, error);
        this.emit('quoteError', { adapter: defaultAdapter.name, error });
      }
    }

    // Try other adapters if default failed or for comparison
    for (const [name, adapter] of this.adapters) {
      if (name === this.config.defaultDex) continue;

      try {
        const quote = await adapter.quote(params);
        quotes.push(quote);
        this.emit('quoteReceived', { adapter: adapter.name, quote, latency: 0 });
      } catch (error) {
        console.warn(`DEX ${name} failed:`, error);
        this.emit('quoteError', { adapter: adapter.name, error });
      }
    }

    const best = getBestQuote(quotes, this.config.scoringWeights);
    return { quotes, best };
  }

  /**
   * Fallback quote method - tries only default DEX with extended timeout
   */
  private async quoteFallback(params: QuoteParams): Promise<{ quotes: Quote[]; best: Quote | null }> {
    console.log(`🔄 Using fallback quote with default DEX: ${this.config.defaultDex}`);

    const defaultAdapter = this.adapters.get(this.config.defaultDex);
    if (!defaultAdapter) {
      throw new Error(`Default DEX adapter not found: ${this.config.defaultDex}`);
    }

    try {
      // Extended timeout for fallback
      const quote = await Promise.race([
        defaultAdapter.quote(params),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Fallback timeout')), this.config.timeoutMs * 2)
        )
      ]);

      this.emit('quotesCompleted', {
        total: 1,
        filtered: 1,
        best: quote.dex,
        fallbackUsed: true
      });

      return { quotes: [quote], best: quote };

    } catch (error) {
      throw new Error(`Fallback quote failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private updateLatencyStats(latency: number): void {
    // Simple moving average
    this.stats.averageLatency = (this.stats.averageLatency + latency) / 2;
  }

  private updateTradeStats(dexName: string, success: boolean, latency: number): void {
    this.stats.dexUsage[dexName as keyof typeof this.stats.dexUsage]++;
    
    // Update success rate
    const totalSuccessful = this.stats.totalTrades * this.stats.successRate + (success ? 1 : 0);
    this.stats.successRate = totalSuccessful / this.stats.totalTrades;
    
    this.updateLatencyStats(latency);
  }
}

/**
 * Factory function to create unified router
 */
export function createUnifiedRouter(config?: Partial<RouterConfig>): UnifiedRouter {
  return new UnifiedRouter(config);
}
