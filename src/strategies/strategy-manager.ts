import { EventEmitter } from 'events';
import { TradingStrategy, StrategyConfig, MarketSignal, TradingDecision, StrategyMetrics, RiskLimits } from './types';
import { LaunchMomentumStrategy } from './launch-momentum';
import { MicroBreakoutStrategy } from './micro-breakout';
import { MLSignalStrategy } from './ml-signal-strategy';

/**
 * Strategy Manager
 * 
 * Orchestrates multiple trading strategies, manages risk limits,
 * and coordinates trade execution with shadow mode support
 */
export class StrategyManager extends EventEmitter {
  private strategies = new Map<string, TradingStrategy>();
  private globalRiskLimits: RiskLimits;
  private dailyStats = {
    totalNotional: 0,
    totalTrades: 0,
    totalPnl: 0,
    maxDrawdown: 0,
    startTime: Date.now()
  };
  
  private positionTracker = new Map<string, any>();
  private shadowMode: boolean;

  constructor(globalRiskLimits: RiskLimits, shadowMode = false) {
    super();
    this.globalRiskLimits = globalRiskLimits;
    this.shadowMode = shadowMode;
    
    // Reset daily stats at midnight
    this.scheduleDaily Reset();
  }

  /**
   * Register a trading strategy
   */
  registerStrategy(strategy: TradingStrategy): void {
    const strategyName = strategy.constructor.name;
    this.strategies.set(strategyName, strategy);
    
    this.emit('strategyRegistered', {
      name: strategyName,
      config: (strategy as any).config
    });
  }

  /**
   * Process market signal through all strategies
   */
  processSignal(signal: MarketSignal): TradingDecision[] {
    const decisions: TradingDecision[] = [];
    
    // Check global kill switch
    if (this.globalRiskLimits.globalKillSwitch) {
      this.emit('signalBlocked', { signal, reason: 'global_kill_switch' });
      return decisions;
    }

    // Process signal through each strategy
    for (const [name, strategy] of this.strategies) {
      try {
        const decision = strategy.analyzeSignal(signal);
        
        if (decision) {
          // Validate against global risk limits
          if (this.validateGlobalRiskLimits(decision)) {
            decisions.push(decision);
            
            this.emit('decisionGenerated', {
              strategy: name,
              decision,
              shadowMode: this.shadowMode
            });
          } else {
            this.emit('decisionBlocked', {
              strategy: name,
              decision,
              reason: 'global_risk_limits'
            });
          }
        }
      } catch (error) {
        this.emit('strategyError', {
          strategy: name,
          signal,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return decisions;
  }

  /**
   * Execute trading decision (or log in shadow mode)
   */
  async executeDecision(decision: TradingDecision): Promise<any> {
    const startTime = Date.now();
    
    if (this.shadowMode) {
      return this.logShadowDecision(decision);
    }

    try {
      // Import router for actual execution
      const { createUnifiedRouter } = await import('../router/unified-router');
      const { createJupiterUnifiedAdapter } = await import('../router/adapters/jupiter-unified');
      
      // Create router instance
      const router = createUnifiedRouter({
        defaultDex: 'jupiter',
        timeoutMs: decision.execution.timeoutMs,
        enableParallelQuotes: false
      });
      
      // Register Jupiter adapter
      const jupiterAdapter = createJupiterUnifiedAdapter();
      router.registerAdapter(jupiterAdapter);

      // Execute trade
      const tradeParams = {
        inputMint: decision.action === 'buy' ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : decision.signal.tokenMint, // USDC or token
        outputMint: decision.action === 'buy' ? decision.signal.tokenMint : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Token or USDC
        amount: decision.sizing.finalAmount.toString(),
        slippageBps: decision.execution.slippageBps,
        mode: 'simple' as const,
        dryRun: false,
        idempotencyKey: `strategy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      const result = await router.trade(tradeParams);
      const executionTime = Date.now() - startTime;

      // Track position
      if (result.success && decision.action === 'buy') {
        this.positionTracker.set(decision.signal.tokenMint, {
          entryTime: Date.now(),
          entryPrice: decision.signal.data.price || 0,
          entryTxPerMin: decision.signal.data.txPerMin,
          amount: decision.sizing.finalAmount,
          strategy: decision.metadata.strategy,
          signature: result.signature
        });
      }

      // Update daily stats
      this.updateDailyStats(decision, result, executionTime);

      this.emit('tradeExecuted', {
        decision,
        result,
        executionTime,
        shadowMode: false
      });

      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      this.emit('tradeError', {
        decision,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime
      });

      throw error;
    }
  }

  /**
   * Check exit conditions for all open positions
   */
  checkExitConditions(currentSignals: MarketSignal[]): TradingDecision[] {
    const exitDecisions: TradingDecision[] = [];

    for (const [mint, position] of this.positionTracker) {
      const currentSignal = currentSignals.find(s => s.tokenMint === mint);
      if (!currentSignal) continue;

      const strategy = this.strategies.get(position.strategy);
      if (!strategy) continue;

      try {
        if (strategy.shouldExit(position, currentSignal)) {
          const exitDecision: TradingDecision = {
            signal: currentSignal,
            action: 'sell',
            confidence: 0.9, // High confidence for exits
            sizing: {
              baseAmount: position.amount,
              multiplier: 1.0,
              finalAmount: position.amount
            },
            execution: {
              slippageBps: 50, // Conservative slippage for exits
              timeoutMs: 10000,
              maxRetries: 3
            },
            reasoning: [`Exit signal for ${mint}`, `Strategy: ${position.strategy}`],
            metadata: {
              strategy: position.strategy,
              exitType: 'strategy_signal',
              holdTime: Date.now() - position.entryTime
            }
          };

          exitDecisions.push(exitDecision);
        }
      } catch (error) {
        this.emit('exitCheckError', {
          mint,
          position,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return exitDecisions;
  }

  /**
   * Get aggregated metrics from all strategies
   */
  getAggregatedMetrics(): Record<string, StrategyMetrics> {
    const metrics: Record<string, StrategyMetrics> = {};
    
    for (const [name, strategy] of this.strategies) {
      metrics[name] = strategy.getMetrics();
    }

    return metrics;
  }

  /**
   * Get current daily statistics
   */
  getDailyStats(): any {
    return {
      ...this.dailyStats,
      uptime: Date.now() - this.dailyStats.startTime,
      openPositions: this.positionTracker.size,
      strategies: Array.from(this.strategies.keys()),
      shadowMode: this.shadowMode
    };
  }

  /**
   * Get current positions
   */
  getPositions(): Map<string, any> {
    return new Map(this.positionTracker);
  }

  /**
   * Emergency stop all trading
   */
  emergencyStop(): void {
    this.globalRiskLimits.globalKillSwitch = true;
    this.emit('emergencyStop', { timestamp: Date.now() });
  }

  /**
   * Resume trading after emergency stop
   */
  resumeTrading(): void {
    this.globalRiskLimits.globalKillSwitch = false;
    this.emit('tradingResumed', { timestamp: Date.now() });
  }

  private validateGlobalRiskLimits(decision: TradingDecision): boolean {
    // Check daily notional limit
    if (this.dailyStats.totalNotional + decision.sizing.finalAmount > this.globalRiskLimits.maxDailyNotional) {
      return false;
    }

    // Check daily trade count limit
    if (this.dailyStats.totalTrades >= this.globalRiskLimits.maxDailyTrades) {
      return false;
    }

    // Check daily drawdown limit
    if (Math.abs(this.dailyStats.totalPnl) > this.globalRiskLimits.maxDailyDrawdown) {
      return false;
    }

    // Check per-token exposure limit
    const currentExposure = this.positionTracker.get(decision.signal.tokenMint)?.amount || 0;
    if (currentExposure + decision.sizing.finalAmount > this.globalRiskLimits.maxPerTokenExposure) {
      return false;
    }

    return true;
  }

  private logShadowDecision(decision: TradingDecision): any {
    const shadowResult = {
      decision,
      timestamp: Date.now(),
      shadowMode: true,
      wouldExecute: true,
      estimatedResult: {
        success: true,
        signature: `shadow_${Date.now()}`,
        simulatedSlippage: decision.execution.slippageBps * 0.8, // Assume 80% of max slippage
        estimatedGas: 5000
      }
    };

    this.emit('shadowDecision', shadowResult);
    return shadowResult;
  }

  private updateDailyStats(decision: TradingDecision, result: any, executionTime: number): void {
    this.dailyStats.totalTrades++;
    this.dailyStats.totalNotional += decision.sizing.finalAmount;
    
    // Update PnL if this is an exit
    if (decision.action === 'sell') {
      const position = this.positionTracker.get(decision.signal.tokenMint);
      if (position) {
        const pnl = decision.sizing.finalAmount - position.amount;
        this.dailyStats.totalPnl += pnl;
        this.dailyStats.maxDrawdown = Math.min(this.dailyStats.maxDrawdown, this.dailyStats.totalPnl);
        
        // Remove position
        this.positionTracker.delete(decision.signal.tokenMint);
      }
    }
  }

  private scheduleDailyReset(): void {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    setTimeout(() => {
      this.resetDailyStats();
      this.scheduleDailyReset(); // Schedule next reset
    }, msUntilMidnight);
  }

  private resetDailyStats(): void {
    this.dailyStats = {
      totalNotional: 0,
      totalTrades: 0,
      totalPnl: 0,
      maxDrawdown: 0,
      startTime: Date.now()
    };

    // Reset strategy daily counters
    for (const strategy of this.strategies.values()) {
      if ('resetDailyCounters' in strategy) {
        (strategy as any).resetDailyCounters();
      }
    }

    this.emit('dailyReset', { timestamp: Date.now() });
  }
}

/**
 * Factory function to create strategy manager with default strategies
 */
export function createStrategyManager(
  globalRiskLimits: RiskLimits,
  shadowMode = false
): StrategyManager {
  const manager = new StrategyManager(globalRiskLimits, shadowMode);

  // Register default strategies
  const launchMomentumConfig: StrategyConfig = {
    name: 'launch_momentum',
    enabled: true,
    shadowMode,
    riskLimits: globalRiskLimits,
    parameters: {}
  };

  const microBreakoutConfig: StrategyConfig = {
    name: 'micro_breakout',
    enabled: true,
    shadowMode,
    riskLimits: globalRiskLimits,
    parameters: {}
  };

  manager.registerStrategy(new LaunchMomentumStrategy(launchMomentumConfig));
  manager.registerStrategy(new MicroBreakoutStrategy(microBreakoutConfig));

  return manager;
}
