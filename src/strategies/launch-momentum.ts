import { TradingStrategy, StrategyConfig, MarketSignal, TradingDecision, StrategyMetrics } from './types';

/**
 * Launch Momentum Strategy
 * 
 * Targets new token/pool launches with strong initial momentum
 * Entry: 1-2 min after launch with min liquidity and tx activity
 * Exit: Quick TP/SL or time-based exit when momentum fades
 */
export class LaunchMomentumStrategy extends TradingStrategy {
  private readonly params = {
    // Entry conditions
    minLiquidity: 5000, // Min 5k USDC TVL
    minTxPerMin: 10, // Min 10 tx/min
    maxDecisionWindow: 120000, // 2 min decision window (ms)
    
    // Sizing
    baseSizeMultiplier: 0.25, // Start with 25% of base size
    maxSizeMultiplier: 0.5, // Max 50% of base size
    
    // Slippage (dynamic based on conditions)
    baseSlippageBps: 50,
    maxSlippageBps: 120,
    
    // Exit conditions
    takeProfitBps: 100, // 1.0% TP
    stopLossBps: 50, // 0.5% SL
    maxHoldTimeMs: 300000, // 5 min max hold
    momentumFadeThreshold: 0.5, // Exit when tx/min drops below 50% of entry
    
    // Risk controls
    maxDailyLaunches: 20, // Max 20 launch trades per day
    minTimeBetweenTrades: 30000, // 30s between trades on same token
  };

  private dailyLaunchCount = 0;
  private lastTradeTime = new Map<string, number>();

  constructor(config: StrategyConfig) {
    super(config);
  }

  protected initializeMetrics(): StrategyMetrics {
    return {
      strategyName: 'launch_momentum',
      period: 'daily',
      trades: { total: 0, wins: 0, losses: 0, winRate: 0 },
      performance: { totalPnl: 0, avgPnl: 0, maxDrawdown: 0, sharpeRatio: 0, expectancy: 0 },
      execution: { avgLatencyMs: 0, p95LatencyMs: 0, avgSlippage: 0, p95Slippage: 0, successRate: 0 },
      risk: { maxExposure: 0, avgHoldingTime: 0, falseBreakouts: 0, rugPulls: 0 }
    };
  }

  analyzeSignal(signal: MarketSignal): TradingDecision | null {
    if (signal.signalType !== 'launch_momentum') {
      return null;
    }

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
        timeoutMs: 10000,
        maxRetries: 2
      },
      reasoning: this.generateReasoning(signal, confidence, sizing, slippage),
      metadata: {
        strategy: 'launch_momentum',
        entryTime: Date.now(),
        expectedHoldTime: this.params.maxHoldTimeMs,
        riskLevel: this.calculateRiskLevel(signal)
      }
    };

    return decision;
  }

  shouldEnter(signal: MarketSignal): boolean {
    const reasons: string[] = [];
    
    // Check if signal is fresh enough
    const signalAge = Date.now() - signal.timestamp;
    if (signalAge > this.params.maxDecisionWindow) {
      reasons.push(`Signal too old: ${signalAge}ms > ${this.params.maxDecisionWindow}ms`);
      return false;
    }

    // Check minimum liquidity
    if (signal.data.tvl < this.params.minLiquidity) {
      reasons.push(`TVL too low: ${signal.data.tvl} < ${this.params.minLiquidity}`);
      return false;
    }

    // Check transaction activity
    if (signal.data.txPerMin < this.params.minTxPerMin) {
      reasons.push(`Low activity: ${signal.data.txPerMin} < ${this.params.minTxPerMin} tx/min`);
      return false;
    }

    // Check daily launch limit
    if (this.dailyLaunchCount >= this.params.maxDailyLaunches) {
      reasons.push(`Daily launch limit reached: ${this.dailyLaunchCount}`);
      return false;
    }

    // Check time between trades on same token
    const lastTrade = this.lastTradeTime.get(signal.tokenMint) || 0;
    const timeSinceLastTrade = Date.now() - lastTrade;
    if (timeSinceLastTrade < this.params.minTimeBetweenTrades) {
      reasons.push(`Too soon since last trade: ${timeSinceLastTrade}ms`);
      return false;
    }

    // Check token allowlist/denylist
    if (!this.isTokenAllowed(signal.tokenMint)) {
      reasons.push('Token not allowed (denylist/whitelist)');
      return false;
    }

    // Check spread (wide spread = low liquidity)
    if (signal.data.spread > 200) { // 2% spread
      reasons.push(`Spread too wide: ${signal.data.spread} bps`);
      return false;
    }

    // Check for potential rug indicators
    if (this.hasRugIndicators(signal)) {
      reasons.push('Potential rug indicators detected');
      return false;
    }

    return true;
  }

  shouldExit(position: any, currentData: MarketSignal): boolean {
    const entryTime = position.entryTime;
    const entryPrice = position.entryPrice;
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
      return true; // Stop loss
    }

    // Momentum fade exit
    const currentTxPerMin = currentData.data.txPerMin;
    const entryTxPerMin = position.entryTxPerMin;
    
    if (currentTxPerMin < entryTxPerMin * this.params.momentumFadeThreshold) {
      return true; // Momentum fading
    }

    return false;
  }

  calculateSizing(signal: MarketSignal): number {
    let sizeMultiplier = this.params.baseSizeMultiplier;
    
    // Increase size based on signal strength
    sizeMultiplier += (signal.strength - 0.5) * 0.3;
    
    // Increase size based on liquidity depth
    if (signal.data.tvl > 20000) sizeMultiplier += 0.1;
    if (signal.data.tvl > 50000) sizeMultiplier += 0.1;
    
    // Increase size based on activity
    if (signal.data.txPerMin > 20) sizeMultiplier += 0.1;
    if (signal.data.txPerMin > 50) sizeMultiplier += 0.1;
    
    // Cap at maximum
    return Math.min(sizeMultiplier, this.params.maxSizeMultiplier);
  }

  calculateSlippage(signal: MarketSignal): number {
    let slippage = this.params.baseSlippageBps;
    
    // Increase slippage for lower liquidity
    if (signal.data.tvl < 10000) slippage += 30;
    if (signal.data.depth < 2000) slippage += 20;
    
    // Increase slippage for wider spreads
    if (signal.data.spread > 50) slippage += 20;
    if (signal.data.spread > 100) slippage += 30;
    
    // Increase slippage for high volatility periods
    if (signal.data.txPerMin > 30) slippage += 20;
    
    return Math.min(slippage, this.params.maxSlippageBps);
  }

  private hasRugIndicators(signal: MarketSignal): boolean {
    // Check for common rug indicators
    const indicators = [];
    
    // Very low initial liquidity
    if (signal.data.tvl < 1000) indicators.push('very_low_liquidity');
    
    // Suspicious token metadata
    // This would check token name, symbol for common rug patterns
    
    // Unusual trading patterns
    if (signal.data.txPerMin > 100 && signal.data.tvl < 5000) {
      indicators.push('high_activity_low_liquidity');
    }
    
    return indicators.length > 0;
  }

  private calculateRiskLevel(signal: MarketSignal): 'low' | 'medium' | 'high' {
    let riskScore = 0;
    
    if (signal.data.tvl < 10000) riskScore += 1;
    if (signal.data.spread > 100) riskScore += 1;
    if (signal.data.depth < 2000) riskScore += 1;
    if (signal.strength < 0.7) riskScore += 1;
    
    if (riskScore >= 3) return 'high';
    if (riskScore >= 2) return 'medium';
    return 'low';
  }

  private generateReasoning(signal: MarketSignal, confidence: number, sizing: number, slippage: number): string[] {
    return [
      `Launch momentum detected for ${signal.tokenMint}`,
      `TVL: $${signal.data.tvl.toLocaleString()}, Activity: ${signal.data.txPerMin} tx/min`,
      `Signal strength: ${(signal.strength * 100).toFixed(1)}%, Confidence: ${(confidence * 100).toFixed(1)}%`,
      `Position size: ${(sizing * 100).toFixed(1)}% of base, Slippage: ${slippage} bps`,
      `Expected hold time: ${this.params.maxHoldTimeMs / 1000}s, TP: ${this.params.takeProfitBps}bps, SL: ${this.params.stopLossBps}bps`
    ];
  }

  // Strategy-specific methods
  public onTradeExecuted(mint: string): void {
    this.dailyLaunchCount++;
    this.lastTradeTime.set(mint, Date.now());
  }

  public resetDailyCounters(): void {
    this.dailyLaunchCount = 0;
    this.lastTradeTime.clear();
  }

  public getDailyStats(): any {
    return {
      launchTrades: this.dailyLaunchCount,
      maxLaunches: this.params.maxDailyLaunches,
      activeTokens: this.lastTradeTime.size
    };
  }
}
