import { TradingStrategy, StrategyConfig, MarketSignal, TradingDecision, StrategyMetrics } from './types';

/**
 * Micro-Breakout Strategy
 * 
 * Targets breakouts after short consolidation periods
 * Entry: When tx/min increases significantly after consolidation with tight spread
 * Exit: Quick TP/SL or when activity returns to normal levels
 */
export class MicroBreakoutStrategy extends TradingStrategy {
  private readonly params = {
    // Consolidation detection
    consolidationPeriodMs: 900000, // 15 min consolidation period
    minConsolidationMs: 600000, // Min 10 min consolidation
    maxPriceVariation: 200, // Max 2% price variation during consolidation
    
    // Breakout detection
    txMultiplierThreshold: 1.5, // 1.5x median tx/min
    minTxPerMin: 8, // Minimum absolute tx/min
    maxSpreadBps: 80, // Max 0.8% spread for entry
    
    // Sizing
    baseSizeMultiplier: 0.5, // 50% of base size
    maxSizeMultiplier: 1.0, // Max 100% of base size
    
    // Slippage (dynamic)
    baseSlippageBps: 30,
    maxSlippageBps: 80,
    
    // Exit conditions
    takeProfitBps: 80, // 0.8% TP
    stopLossBps: 40, // 0.4% SL
    maxHoldTimeMs: 600000, // 10 min max hold
    activityFadeMultiplier: 0.7, // Exit when tx/min drops below 70% of entry
    
    // Risk controls
    minDepth: 1500, // Min $1500 depth
    maxDailyBreakouts: 30,
    falseBreakoutCooldown: 300000, // 5 min cooldown after false breakout
  };

  private dailyBreakoutCount = 0;
  private consolidationData = new Map<string, ConsolidationTracker>();
  private falseBreakoutCooldowns = new Map<string, number>();

  constructor(config: StrategyConfig) {
    super(config);
  }

  protected initializeMetrics(): StrategyMetrics {
    return {
      strategyName: 'micro_breakout',
      period: 'daily',
      trades: { total: 0, wins: 0, losses: 0, winRate: 0 },
      performance: { totalPnl: 0, avgPnl: 0, maxDrawdown: 0, sharpeRatio: 0, expectancy: 0 },
      execution: { avgLatencyMs: 0, p95LatencyMs: 0, avgSlippage: 0, p95Slippage: 0, successRate: 0 },
      risk: { maxExposure: 0, avgHoldingTime: 0, falseBreakouts: 0, rugPulls: 0 }
    };
  }

  analyzeSignal(signal: MarketSignal): TradingDecision | null {
    if (signal.signalType !== 'micro_breakout') {
      return null;
    }

    // Update consolidation tracking
    this.updateConsolidationTracking(signal);

    if (!this.shouldEnter(signal)) {
      return null;
    }

    const confidence = this.calculateConfidence(signal);
    const sizing = this.calculateSizing(signal);
    const slippage = this.calculateSlippage(signal);

    const decision: TradingDecision = {
      signal,
      action: 'buy',
      confidence,
      sizing: {
        baseAmount: 1000, // Base $1000 USDC
        multiplier: sizing,
        finalAmount: 1000 * sizing
      },
      execution: {
        slippageBps: slippage,
        timeoutMs: 8000,
        maxRetries: 2
      },
      reasoning: this.generateReasoning(signal, confidence, sizing, slippage),
      metadata: {
        strategy: 'micro_breakout',
        entryTime: Date.now(),
        consolidationPeriod: this.getConsolidationPeriod(signal.tokenMint),
        breakoutStrength: this.calculateBreakoutStrength(signal),
        riskLevel: this.calculateRiskLevel(signal)
      }
    };

    return decision;
  }

  shouldEnter(signal: MarketSignal): boolean {
    const mint = signal.tokenMint;
    
    // Check daily breakout limit
    if (this.dailyBreakoutCount >= this.params.maxDailyBreakouts) {
      return false;
    }

    // Check false breakout cooldown
    const cooldownEnd = this.falseBreakoutCooldowns.get(mint) || 0;
    if (Date.now() < cooldownEnd) {
      return false;
    }

    // Check minimum depth
    if (signal.data.depth < this.params.minDepth) {
      return false;
    }

    // Check spread constraint
    if (signal.data.spread > this.params.maxSpreadBps) {
      return false;
    }

    // Check consolidation requirements
    const consolidation = this.consolidationData.get(mint);
    if (!consolidation || !this.isValidConsolidation(consolidation)) {
      return false;
    }

    // Check breakout conditions
    if (!this.isValidBreakout(signal, consolidation)) {
      return false;
    }

    // Check token allowlist/denylist
    if (!this.isTokenAllowed(mint)) {
      return false;
    }

    return true;
  }

  shouldExit(position: any, currentData: MarketSignal): boolean {
    const entryTime = position.entryTime;
    const entryPrice = position.entryPrice;
    const entryTxPerMin = position.entryTxPerMin;
    const currentPrice = currentData.data.price || 0;
    const holdTime = Date.now() - entryTime;

    // Time-based exit
    if (holdTime > this.params.maxHoldTimeMs) {
      return true;
    }

    // Profit/Loss based exit
    const pnlBps = ((currentPrice - entryPrice) / entryPrice) * 10000;
    
    if (pnlBps >= this.params.takeProfitBps) {
      return true; // Take profit
    }
    
    if (pnlBps <= -this.params.stopLossBps) {
      // Mark as false breakout for cooldown
      this.markFalseBreakout(currentData.tokenMint);
      return true; // Stop loss
    }

    // Activity fade exit
    const currentTxPerMin = currentData.data.txPerMin;
    if (currentTxPerMin < entryTxPerMin * this.params.activityFadeMultiplier) {
      return true; // Activity fading
    }

    // Spread widening (liquidity drying up)
    if (currentData.data.spread > this.params.maxSpreadBps * 1.5) {
      return true;
    }

    return false;
  }

  calculateSizing(signal: MarketSignal): number {
    let sizeMultiplier = this.params.baseSizeMultiplier;
    
    // Increase size based on breakout strength
    const breakoutStrength = this.calculateBreakoutStrength(signal);
    sizeMultiplier += breakoutStrength * 0.3;
    
    // Increase size based on consolidation quality
    const consolidation = this.consolidationData.get(signal.tokenMint);
    if (consolidation) {
      const consolidationQuality = this.calculateConsolidationQuality(consolidation);
      sizeMultiplier += consolidationQuality * 0.2;
    }
    
    // Increase size based on depth
    if (signal.data.depth > 5000) sizeMultiplier += 0.1;
    if (signal.data.depth > 10000) sizeMultiplier += 0.1;
    
    // Reduce size based on spread
    if (signal.data.spread > 40) sizeMultiplier -= 0.1;
    if (signal.data.spread > 60) sizeMultiplier -= 0.1;
    
    return Math.min(Math.max(sizeMultiplier, 0.25), this.params.maxSizeMultiplier);
  }

  calculateSlippage(signal: MarketSignal): number {
    let slippage = this.params.baseSlippageBps;
    
    // Adjust based on depth
    if (signal.data.depth < 3000) slippage += 20;
    if (signal.data.depth < 2000) slippage += 20;
    
    // Adjust based on spread
    slippage += Math.min(signal.data.spread * 0.5, 30);
    
    // Adjust based on activity level
    if (signal.data.txPerMin > 25) slippage += 10;
    if (signal.data.txPerMin > 40) slippage += 10;
    
    return Math.min(slippage, this.params.maxSlippageBps);
  }

  private updateConsolidationTracking(signal: MarketSignal): void {
    const mint = signal.tokenMint;
    const now = signal.timestamp;
    
    let tracker = this.consolidationData.get(mint);
    if (!tracker) {
      tracker = {
        startTime: now,
        prices: [],
        txPerMinHistory: [],
        lastUpdate: now
      };
      this.consolidationData.set(mint, tracker);
    }

    // Add current data point
    tracker.prices.push({
      price: signal.data.price || 0,
      timestamp: now
    });
    
    tracker.txPerMinHistory.push({
      txPerMin: signal.data.txPerMin,
      timestamp: now
    });
    
    tracker.lastUpdate = now;

    // Clean old data (keep only consolidation period)
    const cutoffTime = now - this.params.consolidationPeriodMs;
    tracker.prices = tracker.prices.filter(p => p.timestamp > cutoffTime);
    tracker.txPerMinHistory = tracker.txPerMinHistory.filter(t => t.timestamp > cutoffTime);
    
    // Reset if gap in data
    if (now - tracker.lastUpdate > 300000) { // 5 min gap
      tracker.startTime = now;
    }
  }

  private isValidConsolidation(tracker: ConsolidationTracker): boolean {
    const now = Date.now();
    const consolidationDuration = now - tracker.startTime;
    
    // Check minimum consolidation time
    if (consolidationDuration < this.params.minConsolidationMs) {
      return false;
    }

    // Check price stability during consolidation
    if (tracker.prices.length < 5) return false;
    
    const prices = tracker.prices.map(p => p.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceVariation = ((maxPrice - minPrice) / minPrice) * 10000;
    
    return priceVariation <= this.params.maxPriceVariation;
  }

  private isValidBreakout(signal: MarketSignal, tracker: ConsolidationTracker): boolean {
    // Check tx/min increase
    if (tracker.txPerMinHistory.length < 3) return false;
    
    const recentTxPerMin = tracker.txPerMinHistory.slice(-5).map(t => t.txPerMin);
    const medianTxPerMin = this.calculateMedian(recentTxPerMin);
    
    const currentTxPerMin = signal.data.txPerMin;
    
    // Must exceed threshold multiplier and minimum absolute value
    return currentTxPerMin >= medianTxPerMin * this.params.txMultiplierThreshold &&
           currentTxPerMin >= this.params.minTxPerMin;
  }

  private calculateBreakoutStrength(signal: MarketSignal): number {
    const tracker = this.consolidationData.get(signal.tokenMint);
    if (!tracker) return 0;

    const recentTxPerMin = tracker.txPerMinHistory.slice(-5).map(t => t.txPerMin);
    const medianTxPerMin = this.calculateMedian(recentTxPerMin);
    
    const multiplier = signal.data.txPerMin / medianTxPerMin;
    
    // Normalize to 0-1 scale
    return Math.min((multiplier - 1) / 2, 1);
  }

  private calculateConsolidationQuality(tracker: ConsolidationTracker): number {
    const duration = Date.now() - tracker.startTime;
    const durationScore = Math.min(duration / this.params.consolidationPeriodMs, 1);
    
    // Price stability score
    const prices = tracker.prices.map(p => p.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const variation = ((maxPrice - minPrice) / minPrice) * 10000;
    const stabilityScore = Math.max(0, 1 - (variation / this.params.maxPriceVariation));
    
    return (durationScore + stabilityScore) / 2;
  }

  private calculateMedian(numbers: number[]): number {
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
  }

  private calculateRiskLevel(signal: MarketSignal): 'low' | 'medium' | 'high' {
    let riskScore = 0;
    
    if (signal.data.depth < 3000) riskScore += 1;
    if (signal.data.spread > 60) riskScore += 1;
    if (signal.data.txPerMin < 15) riskScore += 1;
    if (signal.strength < 0.6) riskScore += 1;
    
    if (riskScore >= 3) return 'high';
    if (riskScore >= 2) return 'medium';
    return 'low';
  }

  private getConsolidationPeriod(mint: string): number {
    const tracker = this.consolidationData.get(mint);
    return tracker ? Date.now() - tracker.startTime : 0;
  }

  private markFalseBreakout(mint: string): void {
    this.falseBreakoutCooldowns.set(mint, Date.now() + this.params.falseBreakoutCooldown);
    this.metrics.risk.falseBreakouts++;
  }

  private generateReasoning(signal: MarketSignal, confidence: number, sizing: number, slippage: number): string[] {
    const tracker = this.consolidationData.get(signal.tokenMint);
    const consolidationPeriod = tracker ? (Date.now() - tracker.startTime) / 1000 : 0;
    
    return [
      `Micro-breakout detected for ${signal.tokenMint}`,
      `Consolidation period: ${consolidationPeriod.toFixed(0)}s, Activity: ${signal.data.txPerMin} tx/min`,
      `Breakout strength: ${(this.calculateBreakoutStrength(signal) * 100).toFixed(1)}%`,
      `Confidence: ${(confidence * 100).toFixed(1)}%, Size: ${(sizing * 100).toFixed(1)}%`,
      `Depth: $${signal.data.depth}, Spread: ${signal.data.spread}bps, Slippage: ${slippage}bps`
    ];
  }

  // Strategy-specific methods
  public onTradeExecuted(mint: string): void {
    this.dailyBreakoutCount++;
  }

  public resetDailyCounters(): void {
    this.dailyBreakoutCount = 0;
    this.falseBreakoutCooldowns.clear();
  }

  public getDailyStats(): any {
    return {
      breakoutTrades: this.dailyBreakoutCount,
      maxBreakouts: this.params.maxDailyBreakouts,
      trackedTokens: this.consolidationData.size,
      falseBreakouts: this.metrics.risk.falseBreakouts,
      cooldowns: this.falseBreakoutCooldowns.size
    };
  }

  public getConsolidationStatus(mint: string): any {
    const tracker = this.consolidationData.get(mint);
    if (!tracker) return null;

    return {
      duration: Date.now() - tracker.startTime,
      dataPoints: tracker.prices.length,
      isValid: this.isValidConsolidation(tracker),
      quality: this.calculateConsolidationQuality(tracker)
    };
  }
}

interface ConsolidationTracker {
  startTime: number;
  prices: Array<{ price: number; timestamp: number }>;
  txPerMinHistory: Array<{ txPerMin: number; timestamp: number }>;
  lastUpdate: number;
}
