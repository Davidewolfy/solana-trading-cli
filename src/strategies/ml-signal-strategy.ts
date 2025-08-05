import { TradingStrategy, StrategyConfig, MarketSignal, TradingDecision, StrategyMetrics } from './types';
import * as Redis from 'redis';

/**
 * ML Signal Strategy
 * 
 * Consumes ML-generated signals from Redis and applies risk management
 * Integrates with ASI-Arch model search results
 */
export class MLSignalStrategy extends TradingStrategy {
  private redisClient: any;
  private modelConfig: any = null;
  
  private readonly params = {
    // Signal consumption
    signalKey: 'ml_signals',
    signalTtlMs: 300000, // 5 min signal TTL
    minConfidence: 0.6, // Minimum model confidence
    
    // Position sizing
    baseSizeMultiplier: 0.3, // Conservative base size
    maxSizeMultiplier: 1.0,
    confidenceScaling: true, // Scale size by confidence
    
    // Risk management
    maxHoldTimeMs: 1800000, // 30 min max hold
    stopLossMultiplier: 2.0, // 2x expected volatility
    takeProfitMultiplier: 3.0, // 3x expected volatility
    
    // Turnover control
    minTimeBetweenSignals: 60000, // 1 min between signals
    maxDailyTurnover: 5.0, // Max 5x daily turnover
    turnoverPenalty: 0.0005, // 5 bps penalty per turn
    
    // Model validation
    minModelSharpe: 0.8, // Minimum model Sharpe for deployment
    maxModelAge: 7 * 24 * 60 * 60 * 1000, // 7 days max model age
    
    // Regime detection
    enableRegimeFilter: true,
    volatilityThreshold: 2.0, // Z-score threshold for high vol regime
  };

  private lastSignalTime = new Map<string, number>();
  private dailyTurnover = 0;
  private modelMetrics: any = null;

  constructor(config: StrategyConfig) {
    super(config);
    this.initializeRedis();
  }

  protected initializeMetrics(): StrategyMetrics {
    return {
      strategyName: 'ml_signal',
      period: 'daily',
      trades: { total: 0, wins: 0, losses: 0, winRate: 0 },
      performance: { totalPnl: 0, avgPnl: 0, maxDrawdown: 0, sharpeRatio: 0, expectancy: 0 },
      execution: { avgLatencyMs: 0, p95LatencyMs: 0, avgSlippage: 0, p95Slippage: 0, successRate: 0 },
      risk: { maxExposure: 0, avgHoldingTime: 0, falseBreakouts: 0, rugPulls: 0 }
    };
  }

  analyzeSignal(signal: MarketSignal): TradingDecision | null {
    // This strategy doesn't process market signals directly
    // Instead, it consumes ML signals from Redis
    return null;
  }

  /**
   * Process ML signal from Redis
   */
  async processMLSignal(mlSignal: MLSignal): Promise<TradingDecision | null> {
    if (!this.shouldProcessSignal(mlSignal)) {
      return null;
    }

    // Convert ML signal to market signal format
    const marketSignal: MarketSignal = {
      tokenMint: mlSignal.symbol,
      timestamp: mlSignal.timestamp,
      signalType: 'ml_generated' as any,
      strength: mlSignal.confidence,
      data: {
        txPerMin: 0, // Not applicable for ML signals
        tvl: 0,
        priceChange: mlSignal.predicted_return * 100,
        spread: 50, // Default spread
        depth: 10000, // Default depth
        volume24h: 0,
        mlConfidence: mlSignal.confidence,
        modelId: mlSignal.model_id,
        features: mlSignal.features
      }
    };

    if (!this.shouldEnter(marketSignal)) {
      return null;
    }

    const confidence = this.calculateConfidence(marketSignal);
    const sizing = this.calculateSizing(marketSignal);
    const slippage = this.calculateSlippage(marketSignal);

    const decision: TradingDecision = {
      signal: marketSignal,
      action: mlSignal.predicted_return > 0 ? 'buy' : 'sell',
      confidence,
      sizing: {
        baseAmount: 1000, // Base $1000 USDC
        multiplier: sizing,
        finalAmount: 1000 * sizing
      },
      execution: {
        slippageBps: slippage,
        timeoutMs: 15000,
        maxRetries: 2
      },
      reasoning: this.generateReasoning(mlSignal, confidence, sizing),
      metadata: {
        strategy: 'ml_signal',
        modelId: mlSignal.model_id,
        mlConfidence: mlSignal.confidence,
        predictedReturn: mlSignal.predicted_return,
        expectedHoldTime: this.params.maxHoldTimeMs,
        riskLevel: this.calculateRiskLevel(mlSignal)
      }
    };

    return decision;
  }

  shouldEnter(signal: MarketSignal): boolean {
    const mlData = signal.data;
    
    // Check model validation
    if (!this.isModelValid()) {
      return false;
    }

    // Check confidence threshold
    if (mlData.mlConfidence < this.params.minConfidence) {
      return false;
    }

    // Check time between signals
    const lastSignal = this.lastSignalTime.get(signal.tokenMint) || 0;
    if (Date.now() - lastSignal < this.params.minTimeBetweenSignals) {
      return false;
    }

    // Check daily turnover limit
    if (this.dailyTurnover >= this.params.maxDailyTurnover) {
      return false;
    }

    // Check regime filter
    if (this.params.enableRegimeFilter && this.isHighVolatilityRegime(signal)) {
      return false;
    }

    // Check token allowlist
    if (!this.isTokenAllowed(signal.tokenMint)) {
      return false;
    }

    return true;
  }

  shouldExit(position: any, currentData: MarketSignal): boolean {
    const entryTime = position.entryTime;
    const entryPrice = position.entryPrice;
    const predictedReturn = position.predictedReturn;
    const holdTime = Date.now() - entryTime;

    // Time-based exit
    if (holdTime > this.params.maxHoldTimeMs) {
      return true;
    }

    // Get current price (simplified)
    const currentPrice = currentData.data.price || entryPrice;
    const actualReturn = (currentPrice - entryPrice) / entryPrice;

    // Dynamic stop loss based on predicted volatility
    const expectedVol = Math.abs(predictedReturn) * this.params.stopLossMultiplier;
    const stopLoss = -expectedVol;

    // Dynamic take profit
    const takeProfit = Math.abs(predictedReturn) * this.params.takeProfitMultiplier;

    // Exit conditions
    if (actualReturn <= stopLoss) {
      return true; // Stop loss
    }

    if (actualReturn >= takeProfit) {
      return true; // Take profit
    }

    // Model confidence degradation
    if (holdTime > this.params.maxHoldTimeMs * 0.5) {
      // After 50% of max hold time, check if we should exit early
      const timeDecay = holdTime / this.params.maxHoldTimeMs;
      const confidenceThreshold = this.params.minConfidence * (1 + timeDecay);
      
      if (currentData.data.mlConfidence < confidenceThreshold) {
        return true; // Confidence too low
      }
    }

    return false;
  }

  calculateSizing(signal: MarketSignal): number {
    let sizeMultiplier = this.params.baseSizeMultiplier;
    
    // Scale by confidence
    if (this.params.confidenceScaling) {
      const confidenceBoost = (signal.data.mlConfidence - this.params.minConfidence) / (1 - this.params.minConfidence);
      sizeMultiplier += confidenceBoost * 0.3;
    }
    
    // Scale by predicted return magnitude
    const returnMagnitude = Math.abs(signal.data.predictedReturn || 0);
    if (returnMagnitude > 0.01) sizeMultiplier += 0.2; // Large predicted move
    
    // Reduce size in high turnover periods
    if (this.dailyTurnover > this.params.maxDailyTurnover * 0.7) {
      sizeMultiplier *= 0.5;
    }
    
    // Model quality adjustment
    if (this.modelMetrics && this.modelMetrics.sharpe > 1.5) {
      sizeMultiplier += 0.2; // High quality model
    }
    
    return Math.min(sizeMultiplier, this.params.maxSizeMultiplier);
  }

  calculateSlippage(signal: MarketSignal): number {
    let slippage = 40; // Base 40 bps
    
    // Increase for larger predicted moves (more urgent)
    const returnMagnitude = Math.abs(signal.data.predictedReturn || 0);
    if (returnMagnitude > 0.02) slippage += 20;
    
    // Increase for lower confidence (less certain)
    if (signal.data.mlConfidence < 0.8) slippage += 15;
    
    // Increase in high volatility regime
    if (this.isHighVolatilityRegime(signal)) {
      slippage += 25;
    }
    
    return Math.min(slippage, 100); // Max 100 bps
  }

  private async initializeRedis(): Promise<void> {
    try {
      this.redisClient = Redis.createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });
      
      await this.redisClient.connect();
      console.log('✅ Connected to Redis for ML signals');
      
      // Load model configuration
      await this.loadModelConfig();
      
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error);
    }
  }

  private async loadModelConfig(): Promise<void> {
    try {
      const configKey = 'ml_model_config';
      const configData = await this.redisClient.get(configKey);
      
      if (configData) {
        this.modelConfig = JSON.parse(configData);
        this.modelMetrics = this.modelConfig.metrics;
        console.log(`✅ Loaded model config: ${this.modelConfig.model_id}`);
      } else {
        console.warn('⚠️ No model config found in Redis');
      }
    } catch (error) {
      console.error('❌ Failed to load model config:', error);
    }
  }

  private shouldProcessSignal(mlSignal: MLSignal): boolean {
    // Check signal age
    const signalAge = Date.now() - mlSignal.timestamp;
    if (signalAge > this.params.signalTtlMs) {
      return false;
    }

    // Check if we have model config
    if (!this.modelConfig) {
      return false;
    }

    // Check model ID matches
    if (mlSignal.model_id !== this.modelConfig.model_id) {
      return false;
    }

    return true;
  }

  private isModelValid(): boolean {
    if (!this.modelConfig) return false;
    
    // Check model age
    const modelAge = Date.now() - new Date(this.modelConfig.created_at).getTime();
    if (modelAge > this.params.maxModelAge) {
      return false;
    }
    
    // Check model performance
    if (this.modelMetrics && this.modelMetrics.sharpe < this.params.minModelSharpe) {
      return false;
    }
    
    return true;
  }

  private isHighVolatilityRegime(signal: MarketSignal): boolean {
    // Simplified volatility regime detection
    // In practice, this would use rolling volatility metrics
    return signal.data.vol_zscore > this.params.volatilityThreshold;
  }

  private calculateRiskLevel(mlSignal: MLSignal): 'low' | 'medium' | 'high' {
    let riskScore = 0;
    
    if (mlSignal.confidence < 0.7) riskScore += 1;
    if (Math.abs(mlSignal.predicted_return) > 0.02) riskScore += 1;
    if (!this.modelMetrics || this.modelMetrics.sharpe < 1.0) riskScore += 1;
    
    if (riskScore >= 2) return 'high';
    if (riskScore >= 1) return 'medium';
    return 'low';
  }

  private generateReasoning(mlSignal: MLSignal, confidence: number, sizing: number): string[] {
    return [
      `ML signal for ${mlSignal.symbol}`,
      `Model: ${mlSignal.model_id}, Confidence: ${(mlSignal.confidence * 100).toFixed(1)}%`,
      `Predicted return: ${(mlSignal.predicted_return * 100).toFixed(2)}%`,
      `Position size: ${(sizing * 100).toFixed(1)}% of base`,
      `Model Sharpe: ${this.modelMetrics?.sharpe?.toFixed(2) || 'N/A'}`
    ];
  }

  // Strategy-specific methods
  public async startSignalConsumer(): Promise<void> {
    if (!this.redisClient) {
      throw new Error('Redis client not initialized');
    }

    console.log('🔄 Starting ML signal consumer...');
    
    // Subscribe to ML signals
    const subscriber = this.redisClient.duplicate();
    await subscriber.connect();
    
    await subscriber.subscribe(this.params.signalKey, (message: string) => {
      try {
        const mlSignal: MLSignal = JSON.parse(message);
        this.processMLSignal(mlSignal);
      } catch (error) {
        console.error('Error processing ML signal:', error);
      }
    });
  }

  public updateDailyTurnover(amount: number): void {
    this.dailyTurnover += amount;
  }

  public resetDailyCounters(): void {
    this.dailyTurnover = 0;
    this.lastSignalTime.clear();
  }

  public async getMLSignalStats(): Promise<any> {
    if (!this.redisClient) return null;
    
    try {
      const stats = await this.redisClient.hGetAll('ml_signal_stats');
      return stats;
    } catch (error) {
      console.error('Error getting ML signal stats:', error);
      return null;
    }
  }
}

export interface MLSignal {
  symbol: string;
  timestamp: number;
  model_id: string;
  confidence: number;
  predicted_return: number;
  features: Record<string, number>;
  metadata?: any;
}
