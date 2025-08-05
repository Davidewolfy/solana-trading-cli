/**
 * Trading Strategy Types and Interfaces
 */

export interface StrategyConfig {
  name: string;
  enabled: boolean;
  shadowMode: boolean; // Log decisions without execution
  riskLimits: RiskLimits;
  parameters: Record<string, any>;
}

export interface RiskLimits {
  maxDailyNotional: number; // Max daily trading volume in USDC
  maxDailyTrades: number; // Max number of trades per day
  maxDailyDrawdown: number; // Max daily loss in USDC
  maxPerTokenExposure: number; // Max exposure per token in USDC
  globalKillSwitch: boolean; // Emergency stop all trading
}

export interface MarketSignal {
  tokenMint: string;
  timestamp: number;
  signalType: 'launch_momentum' | 'micro_breakout' | 'mean_reversion' | 'event_driven' | 'dca';
  strength: number; // 0-1 signal strength
  data: {
    txPerMin: number;
    tvl: number;
    priceChange: number;
    spread: number;
    depth: number;
    volume24h: number;
    [key: string]: any;
  };
}

export interface TradingDecision {
  signal: MarketSignal;
  action: 'buy' | 'sell' | 'hold' | 'exit';
  confidence: number; // 0-1
  sizing: {
    baseAmount: number; // Base position size
    multiplier: number; // Size multiplier based on confidence
    finalAmount: number; // Final trade amount
  };
  execution: {
    slippageBps: number;
    timeoutMs: number;
    maxRetries: number;
  };
  reasoning: string[];
  metadata: Record<string, any>;
}

export interface StrategyMetrics {
  strategyName: string;
  period: string;
  trades: {
    total: number;
    wins: number;
    losses: number;
    winRate: number;
  };
  performance: {
    totalPnl: number;
    avgPnl: number;
    maxDrawdown: number;
    sharpeRatio: number;
    expectancy: number;
  };
  execution: {
    avgLatencyMs: number;
    p95LatencyMs: number;
    avgSlippage: number;
    p95Slippage: number;
    successRate: number;
  };
  risk: {
    maxExposure: number;
    avgHoldingTime: number;
    falseBreakouts: number;
    rugPulls: number;
  };
}

export interface TokenMetadata {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  isWhitelisted: boolean;
  isDenylisted: boolean;
  riskScore: number; // 0-1, higher = riskier
  tags: string[];
  createdAt: number;
  verified: boolean;
}

export interface PoolData {
  poolAddress: string;
  tokenA: string;
  tokenB: string;
  tvl: number;
  volume24h: number;
  txCount24h: number;
  createdAt: number;
  dex: string;
  fees: number;
}

export interface PriceData {
  mint: string;
  price: number;
  timestamp: number;
  source: string;
  confidence: number;
}

export interface TxActivity {
  mint: string;
  txPerMin: number;
  avgTxSize: number;
  uniqueWallets: number;
  buyPressure: number; // 0-1, higher = more buys
  timestamp: number;
}

export abstract class TradingStrategy {
  protected config: StrategyConfig;
  protected metrics: StrategyMetrics;

  constructor(config: StrategyConfig) {
    this.config = config;
    this.metrics = this.initializeMetrics();
  }

  abstract analyzeSignal(signal: MarketSignal): TradingDecision | null;
  abstract shouldEnter(signal: MarketSignal): boolean;
  abstract shouldExit(position: any, currentData: MarketSignal): boolean;
  abstract calculateSizing(signal: MarketSignal): number;
  abstract calculateSlippage(signal: MarketSignal): number;

  protected abstract initializeMetrics(): StrategyMetrics;

  // Common utility methods
  protected isWithinRiskLimits(amount: number): boolean {
    // Check daily limits, per-token exposure, etc.
    return true; // Simplified for now
  }

  protected isTokenAllowed(mint: string): boolean {
    // Check whitelist/denylist
    return true; // Simplified for now
  }

  protected calculateConfidence(signal: MarketSignal): number {
    // Base confidence calculation
    let confidence = signal.strength;
    
    // Adjust based on market conditions
    if (signal.data.spread > 100) confidence *= 0.8; // Wide spread reduces confidence
    if (signal.data.depth < 1000) confidence *= 0.7; // Low depth reduces confidence
    if (signal.data.txPerMin < 5) confidence *= 0.6; // Low activity reduces confidence
    
    return Math.max(0, Math.min(1, confidence));
  }

  public getMetrics(): StrategyMetrics {
    return this.metrics;
  }

  public updateMetrics(trade: any): void {
    // Update strategy metrics after trade
    this.metrics.trades.total++;
    // ... more metric updates
  }
}

export interface StrategyManager {
  strategies: Map<string, TradingStrategy>;
  registerStrategy(strategy: TradingStrategy): void;
  processSignal(signal: MarketSignal): TradingDecision[];
  executeDecision(decision: TradingDecision): Promise<any>;
  getAggregatedMetrics(): Record<string, StrategyMetrics>;
}
