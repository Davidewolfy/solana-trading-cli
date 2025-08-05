import { EventEmitter } from 'events';
import { MarketSignal, TokenMetadata, PoolData, TxActivity } from './types';

/**
 * Signal Generator
 * 
 * Generates trading signals from streaming data and market analysis
 * Integrates with Yellowstone gRPC streaming and DEX monitoring
 */
export class SignalGenerator extends EventEmitter {
  private tokenTracker = new Map<string, TokenTracker>();
  private poolTracker = new Map<string, PoolData>();
  private activityTracker = new Map<string, TxActivity[]>();
  
  private config = {
    // Launch momentum detection
    launchDetection: {
      newPoolAgeMs: 300000, // 5 min window for "new" pools
      minInitialTvl: 5000,
      minTxBurst: 10, // Min tx/min for momentum
      momentumWindowMs: 120000 // 2 min momentum window
    },
    
    // Breakout detection
    breakoutDetection: {
      consolidationPeriodMs: 900000, // 15 min consolidation
      txMultiplierThreshold: 1.5,
      priceStabilityThreshold: 200, // 2% max variation
      minBreakoutVolume: 1000
    },
    
    // Mean reversion detection
    meanReversionDetection: {
      deviationThreshold: 60, // 0.6% deviation
      referenceWindowMs: 300000, // 5 min reference window
      minLiquidity: 10000
    },
    
    // Signal quality filters
    qualityFilters: {
      minTvl: 1000,
      maxSpread: 500, // 5% max spread
      minDepth: 500,
      minTxPerMin: 2
    }
  };

  constructor() {
    super();
  }

  /**
   * Process new pool creation event
   */
  onNewPool(poolData: PoolData): void {
    this.poolTracker.set(poolData.poolAddress, poolData);
    
    // Check for launch momentum signal
    const signal = this.checkLaunchMomentum(poolData);
    if (signal) {
      this.emit('signal', signal);
    }
  }

  /**
   * Process account update (liquidity changes)
   */
  onAccountUpdate(accountData: any): void {
    const poolAddress = accountData.pubkey;
    const existingPool = this.poolTracker.get(poolAddress);
    
    if (existingPool) {
      // Update pool data
      const updatedPool = {
        ...existingPool,
        tvl: accountData.lamports / 1e9, // Convert to SOL equivalent
        volume24h: existingPool.volume24h // Keep existing volume
      };
      
      this.poolTracker.set(poolAddress, updatedPool);
      
      // Check for mean reversion opportunities
      const signal = this.checkMeanReversion(updatedPool);
      if (signal) {
        this.emit('signal', signal);
      }
    }
  }

  /**
   * Process transaction activity
   */
  onTransaction(txData: any): void {
    // Extract token mints from transaction
    const tokenMints = this.extractTokenMints(txData);
    
    for (const mint of tokenMints) {
      this.updateActivityTracking(mint, txData);
      
      // Check for breakout signals
      const signal = this.checkMicroBreakout(mint);
      if (signal) {
        this.emit('signal', signal);
      }
    }
  }

  /**
   * Check for launch momentum signals
   */
  private checkLaunchMomentum(poolData: PoolData): MarketSignal | null {
    const now = Date.now();
    const poolAge = now - poolData.createdAt;
    
    // Must be a new pool
    if (poolAge > this.config.launchDetection.newPoolAgeMs) {
      return null;
    }
    
    // Must meet minimum TVL
    if (poolData.tvl < this.config.launchDetection.minInitialTvl) {
      return null;
    }
    
    // Check transaction activity
    const activity = this.getRecentActivity(poolData.tokenA) || this.getRecentActivity(poolData.tokenB);
    if (!activity || activity.txPerMin < this.config.launchDetection.minTxBurst) {
      return null;
    }
    
    // Calculate signal strength
    const tvlScore = Math.min(poolData.tvl / 50000, 1); // Normalize to 50k TVL
    const activityScore = Math.min(activity.txPerMin / 50, 1); // Normalize to 50 tx/min
    const ageScore = 1 - (poolAge / this.config.launchDetection.newPoolAgeMs); // Newer = higher score
    
    const strength = (tvlScore + activityScore + ageScore) / 3;
    
    if (strength < 0.3) return null; // Minimum strength threshold
    
    const tokenMint = poolData.tokenA === 'So11111111111111111111111111111111111111112' 
      ? poolData.tokenB 
      : poolData.tokenA; // Non-SOL token
    
    return {
      tokenMint,
      timestamp: now,
      signalType: 'launch_momentum',
      strength,
      data: {
        txPerMin: activity.txPerMin,
        tvl: poolData.tvl,
        priceChange: 0, // New launch, no price history
        spread: this.estimateSpread(poolData),
        depth: poolData.tvl * 0.1, // Estimate 10% of TVL as depth
        volume24h: poolData.volume24h,
        poolAge,
        dex: poolData.dex
      }
    };
  }

  /**
   * Check for micro-breakout signals
   */
  private checkMicroBreakout(tokenMint: string): MarketSignal | null {
    const tracker = this.tokenTracker.get(tokenMint);
    if (!tracker) return null;
    
    const now = Date.now();
    const recentActivity = this.getRecentActivity(tokenMint);
    if (!recentActivity) return null;
    
    // Check consolidation period
    const consolidationPeriod = now - tracker.consolidationStart;
    if (consolidationPeriod < this.config.breakoutDetection.consolidationPeriodMs * 0.67) {
      return null; // Need at least 2/3 of consolidation period
    }
    
    // Check price stability during consolidation
    const priceVariation = this.calculatePriceVariation(tracker);
    if (priceVariation > this.config.breakoutDetection.priceStabilityThreshold) {
      return null; // Too much price variation
    }
    
    // Check activity breakout
    const avgActivity = this.calculateAverageActivity(tokenMint);
    const activityMultiplier = recentActivity.txPerMin / avgActivity;
    
    if (activityMultiplier < this.config.breakoutDetection.txMultiplierThreshold) {
      return null; // No activity breakout
    }
    
    // Calculate signal strength
    const consolidationScore = Math.min(consolidationPeriod / this.config.breakoutDetection.consolidationPeriodMs, 1);
    const stabilityScore = 1 - (priceVariation / this.config.breakoutDetection.priceStabilityThreshold);
    const activityScore = Math.min((activityMultiplier - 1) / 2, 1); // Normalize above 1x
    
    const strength = (consolidationScore + stabilityScore + activityScore) / 3;
    
    if (strength < 0.4) return null;
    
    return {
      tokenMint,
      timestamp: now,
      signalType: 'micro_breakout',
      strength,
      data: {
        txPerMin: recentActivity.txPerMin,
        tvl: tracker.currentTvl,
        priceChange: this.calculateRecentPriceChange(tracker),
        spread: tracker.currentSpread,
        depth: tracker.currentDepth,
        volume24h: tracker.volume24h,
        consolidationPeriod,
        activityMultiplier
      }
    };
  }

  /**
   * Check for mean reversion signals
   */
  private checkMeanReversion(poolData: PoolData): MarketSignal | null {
    const tokenMint = poolData.tokenA === 'So11111111111111111111111111111111111111112' 
      ? poolData.tokenB 
      : poolData.tokenA;
    
    const tracker = this.tokenTracker.get(tokenMint);
    if (!tracker) return null;
    
    // Need sufficient liquidity for mean reversion
    if (poolData.tvl < this.config.meanReversionDetection.minLiquidity) {
      return null;
    }
    
    // Calculate price deviation from reference
    const referencePrice = this.calculateReferencePrice(tracker);
    const currentPrice = tracker.currentPrice;
    const deviation = Math.abs((currentPrice - referencePrice) / referencePrice) * 10000; // bps
    
    if (deviation < this.config.meanReversionDetection.deviationThreshold) {
      return null; // Not enough deviation
    }
    
    // Check if spread is reasonable for mean reversion
    if (tracker.currentSpread > 100) { // 1% spread
      return null; // Too wide spread
    }
    
    const strength = Math.min(deviation / 200, 1); // Normalize to 2% deviation
    
    return {
      tokenMint,
      timestamp: Date.now(),
      signalType: 'mean_reversion',
      strength,
      data: {
        txPerMin: this.getRecentActivity(tokenMint)?.txPerMin || 0,
        tvl: poolData.tvl,
        priceChange: (currentPrice - referencePrice) / referencePrice * 100,
        spread: tracker.currentSpread,
        depth: tracker.currentDepth,
        volume24h: tracker.volume24h,
        deviation,
        referencePrice
      }
    };
  }

  private updateActivityTracking(tokenMint: string, txData: any): void {
    const now = Date.now();
    
    if (!this.activityTracker.has(tokenMint)) {
      this.activityTracker.set(tokenMint, []);
    }
    
    const activities = this.activityTracker.get(tokenMint)!;
    
    // Add new activity point
    activities.push({
      mint: tokenMint,
      txPerMin: 1, // Will be calculated in aggregation
      avgTxSize: txData.amount || 0,
      uniqueWallets: 1,
      buyPressure: txData.isBuy ? 1 : 0,
      timestamp: now
    });
    
    // Clean old data (keep 1 hour)
    const cutoff = now - 3600000;
    this.activityTracker.set(tokenMint, activities.filter(a => a.timestamp > cutoff));
    
    // Update token tracker
    this.updateTokenTracker(tokenMint, txData);
  }

  private updateTokenTracker(tokenMint: string, txData: any): void {
    const now = Date.now();
    
    if (!this.tokenTracker.has(tokenMint)) {
      this.tokenTracker.set(tokenMint, {
        mint: tokenMint,
        consolidationStart: now,
        priceHistory: [],
        currentPrice: txData.price || 0,
        currentTvl: 0,
        currentSpread: 50, // Default spread
        currentDepth: 1000, // Default depth
        volume24h: 0,
        lastUpdate: now
      });
    }
    
    const tracker = this.tokenTracker.get(tokenMint)!;
    
    // Update price history
    if (txData.price) {
      tracker.priceHistory.push({
        price: txData.price,
        timestamp: now
      });
      
      tracker.currentPrice = txData.price;
      
      // Keep only recent price history (1 hour)
      const cutoff = now - 3600000;
      tracker.priceHistory = tracker.priceHistory.filter(p => p.timestamp > cutoff);
    }
    
    tracker.lastUpdate = now;
  }

  private getRecentActivity(tokenMint: string): TxActivity | null {
    const activities = this.activityTracker.get(tokenMint);
    if (!activities || activities.length === 0) return null;
    
    const now = Date.now();
    const recentActivities = activities.filter(a => now - a.timestamp < 60000); // Last minute
    
    if (recentActivities.length === 0) return null;
    
    return {
      mint: tokenMint,
      txPerMin: recentActivities.length,
      avgTxSize: recentActivities.reduce((sum, a) => sum + a.avgTxSize, 0) / recentActivities.length,
      uniqueWallets: new Set(recentActivities.map(a => a.timestamp)).size, // Simplified
      buyPressure: recentActivities.reduce((sum, a) => sum + a.buyPressure, 0) / recentActivities.length,
      timestamp: now
    };
  }

  private calculateAverageActivity(tokenMint: string): number {
    const activities = this.activityTracker.get(tokenMint);
    if (!activities || activities.length === 0) return 1;
    
    const now = Date.now();
    const windowMs = 900000; // 15 min window
    const recentActivities = activities.filter(a => now - a.timestamp < windowMs);
    
    if (recentActivities.length === 0) return 1;
    
    // Calculate average tx/min over the window
    const minutes = windowMs / 60000;
    return recentActivities.length / minutes;
  }

  private calculatePriceVariation(tracker: TokenTracker): number {
    if (tracker.priceHistory.length < 2) return 0;
    
    const prices = tracker.priceHistory.map(p => p.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    
    return ((maxPrice - minPrice) / minPrice) * 10000; // bps
  }

  private calculateRecentPriceChange(tracker: TokenTracker): number {
    if (tracker.priceHistory.length < 2) return 0;
    
    const recent = tracker.priceHistory.slice(-2);
    const oldPrice = recent[0].price;
    const newPrice = recent[1].price;
    
    return ((newPrice - oldPrice) / oldPrice) * 100; // percentage
  }

  private calculateReferencePrice(tracker: TokenTracker): number {
    const now = Date.now();
    const windowMs = this.config.meanReversionDetection.referenceWindowMs;
    
    const referencePrices = tracker.priceHistory
      .filter(p => now - p.timestamp < windowMs)
      .map(p => p.price);
    
    if (referencePrices.length === 0) return tracker.currentPrice;
    
    // Return median price as reference
    const sorted = referencePrices.sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
  }

  private estimateSpread(poolData: PoolData): number {
    // Estimate spread based on TVL and DEX
    let baseSpread = 50; // 0.5% base spread
    
    if (poolData.tvl < 5000) baseSpread = 200; // 2% for low liquidity
    else if (poolData.tvl < 20000) baseSpread = 100; // 1% for medium liquidity
    
    // Adjust by DEX
    if (poolData.dex === 'jupiter') baseSpread *= 0.8; // Jupiter typically better
    
    return baseSpread;
  }

  private extractTokenMints(txData: any): string[] {
    // Extract token mints from transaction data
    // This would parse the actual transaction structure
    return []; // Simplified for now
  }

  /**
   * Get current signal statistics
   */
  getStats(): any {
    return {
      trackedTokens: this.tokenTracker.size,
      trackedPools: this.poolTracker.size,
      activeTokens: Array.from(this.activityTracker.keys()).filter(mint => {
        const activity = this.getRecentActivity(mint);
        return activity && activity.txPerMin > 0;
      }).length
    };
  }
}

interface TokenTracker {
  mint: string;
  consolidationStart: number;
  priceHistory: Array<{ price: number; timestamp: number }>;
  currentPrice: number;
  currentTvl: number;
  currentSpread: number;
  currentDepth: number;
  volume24h: number;
  lastUpdate: number;
}

/**
 * Factory function to create signal generator
 */
export function createSignalGenerator(): SignalGenerator {
  return new SignalGenerator();
}
