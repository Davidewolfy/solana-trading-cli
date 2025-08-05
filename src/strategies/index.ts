/**
 * Solana Trading Strategies
 * 
 * Complete strategy system for memcoin trading with:
 * - Launch momentum detection
 * - Micro-breakout patterns
 * - Mean reversion opportunities
 * - Event-driven signals
 * - DCA/accumulation strategies
 */

// Core types and interfaces
export * from './types';

// Strategy implementations
export { LaunchMomentumStrategy } from './launch-momentum';
export { MicroBreakoutStrategy } from './micro-breakout';

// Strategy management
export { StrategyManager, createStrategyManager } from './strategy-manager';

// Signal generation
export { SignalGenerator, createSignalGenerator } from './signal-generator';

// Default configurations
export const DEFAULT_RISK_LIMITS = {
  maxDailyNotional: 10000, // $10k daily limit
  maxDailyTrades: 50, // 50 trades per day
  maxDailyDrawdown: 1000, // $1k max daily loss
  maxPerTokenExposure: 500, // $500 per token
  globalKillSwitch: false
};

export const DEFAULT_STRATEGY_CONFIGS = {
  launchMomentum: {
    name: 'launch_momentum',
    enabled: true,
    shadowMode: false,
    riskLimits: DEFAULT_RISK_LIMITS,
    parameters: {
      minLiquidity: 5000,
      minTxPerMin: 10,
      maxDecisionWindow: 120000,
      takeProfitBps: 100,
      stopLossBps: 50,
      maxHoldTimeMs: 300000
    }
  },
  
  microBreakout: {
    name: 'micro_breakout',
    enabled: true,
    shadowMode: false,
    riskLimits: DEFAULT_RISK_LIMITS,
    parameters: {
      consolidationPeriodMs: 900000,
      txMultiplierThreshold: 1.5,
      takeProfitBps: 80,
      stopLossBps: 40,
      maxHoldTimeMs: 600000
    }
  }
};

/**
 * Quick setup function for production use
 */
export function createProductionStrategySystem(shadowMode = false) {
  const strategyManager = createStrategyManager(DEFAULT_RISK_LIMITS, shadowMode);
  const signalGenerator = createSignalGenerator();
  
  // Connect signal generator to strategy manager
  signalGenerator.on('signal', (signal) => {
    const decisions = strategyManager.processSignal(signal);
    
    // Execute decisions
    decisions.forEach(async (decision) => {
      try {
        await strategyManager.executeDecision(decision);
      } catch (error) {
        console.error('Strategy execution error:', error);
      }
    });
  });
  
  return {
    strategyManager,
    signalGenerator,
    
    // Convenience methods
    start: () => {
      console.log('🎯 Strategy system started');
      return { strategyManager, signalGenerator };
    },
    
    stop: () => {
      strategyManager.emergencyStop();
      console.log('⏹️ Strategy system stopped');
    },
    
    getStats: () => ({
      strategies: strategyManager.getAggregatedMetrics(),
      daily: strategyManager.getDailyStats(),
      signals: signalGenerator.getStats()
    })
  };
}

/**
 * Development/testing setup with mock data
 */
export function createTestStrategySystem() {
  const system = createProductionStrategySystem(true); // Shadow mode
  
  // Add test data generation
  const generateTestSignals = () => {
    const testTokens = [
      'TestToken111111111111111111111111111111111',
      'TestToken222222222222222222222222222222222',
      'TestToken333333333333333333333333333333333'
    ];
    
    setInterval(() => {
      const signal = {
        tokenMint: testTokens[Math.floor(Math.random() * testTokens.length)],
        timestamp: Date.now(),
        signalType: ['launch_momentum', 'micro_breakout'][Math.floor(Math.random() * 2)] as any,
        strength: 0.3 + Math.random() * 0.7,
        data: {
          txPerMin: 5 + Math.random() * 30,
          tvl: 1000 + Math.random() * 49000,
          priceChange: (Math.random() - 0.5) * 10,
          spread: 20 + Math.random() * 180,
          depth: 500 + Math.random() * 4500,
          volume24h: 10000 + Math.random() * 90000
        }
      };
      
      system.signalGenerator.emit('signal', signal);
    }, 5000 + Math.random() * 10000); // 5-15 second intervals
  };
  
  return {
    ...system,
    startTesting: () => {
      console.log('🧪 Starting test strategy system with mock signals');
      generateTestSignals();
      return system.start();
    }
  };
}
