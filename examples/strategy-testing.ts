import { createStrategyManager } from '../src/strategies/strategy-manager';
import { createSignalGenerator } from '../src/strategies/signal-generator';
import { MarketSignal, RiskLimits } from '../src/strategies/types';

/**
 * Strategy Testing Example
 * 
 * Demonstrates how to use the strategy system with shadow mode
 * and real signal generation
 */

async function runStrategyTest() {
  console.log('🎯 Starting Strategy Testing Example');
  console.log('===================================');

  // Configure risk limits
  const riskLimits: RiskLimits = {
    maxDailyNotional: 10000, // $10k daily limit
    maxDailyTrades: 50, // 50 trades per day
    maxDailyDrawdown: 1000, // $1k max daily loss
    maxPerTokenExposure: 500, // $500 per token
    globalKillSwitch: false
  };

  // Create strategy manager in shadow mode
  const strategyManager = createStrategyManager(riskLimits, true);
  
  // Create signal generator
  const signalGenerator = createSignalGenerator();

  // Setup event listeners
  setupEventListeners(strategyManager, signalGenerator);

  // Generate test signals
  await generateTestSignals(signalGenerator);

  // Run for 5 minutes
  console.log('⏱️ Running test for 5 minutes...');
  await new Promise(resolve => setTimeout(resolve, 300000));

  // Generate final report
  generateFinalReport(strategyManager);
}

function setupEventListeners(strategyManager: any, signalGenerator: any) {
  // Strategy manager events
  strategyManager.on('decisionGenerated', (event: any) => {
    console.log(`📊 ${event.strategy} Decision:`);
    console.log(`   Token: ${event.decision.signal.tokenMint.slice(0, 8)}...`);
    console.log(`   Action: ${event.decision.action}`);
    console.log(`   Confidence: ${(event.decision.confidence * 100).toFixed(1)}%`);
    console.log(`   Size: $${event.decision.sizing.finalAmount}`);
    console.log(`   Reasoning: ${event.decision.reasoning[0]}`);
  });

  strategyManager.on('decisionBlocked', (event: any) => {
    console.log(`🚫 Decision Blocked: ${event.reason}`);
  });

  strategyManager.on('shadowDecision', (event: any) => {
    console.log(`👻 Shadow Trade: ${event.decision.action} $${event.decision.sizing.finalAmount} of ${event.decision.signal.tokenMint.slice(0, 8)}...`);
  });

  strategyManager.on('emergencyStop', () => {
    console.log('🚨 Emergency stop activated!');
  });

  // Signal generator events
  signalGenerator.on('signal', (signal: MarketSignal) => {
    console.log(`📡 Signal: ${signal.signalType} for ${signal.tokenMint.slice(0, 8)}... (strength: ${(signal.strength * 100).toFixed(1)}%)`);
    
    // Process signal through strategies
    const decisions = strategyManager.processSignal(signal);
    
    // Execute decisions in shadow mode
    decisions.forEach(async (decision: any) => {
      try {
        await strategyManager.executeDecision(decision);
      } catch (error) {
        console.error('Shadow execution error:', error);
      }
    });
  });
}

async function generateTestSignals(signalGenerator: any) {
  console.log('🔄 Starting test signal generation...');

  // Test tokens
  const testTokens = [
    'TokenLaunch111111111111111111111111111111111',
    'TokenBreakout22222222222222222222222222222222',
    'TokenMeanRev33333333333333333333333333333333',
    'TokenEvent444444444444444444444444444444444'
  ];

  let signalCount = 0;

  // Generate launch momentum signals
  const launchInterval = setInterval(() => {
    const token = testTokens[0];
    
    // Simulate new pool creation
    signalGenerator.onNewPool({
      poolAddress: `Pool${signalCount}111111111111111111111111111111`,
      tokenA: 'So11111111111111111111111111111111111111112', // SOL
      tokenB: token,
      tvl: 5000 + Math.random() * 45000, // 5k-50k TVL
      volume24h: 10000 + Math.random() * 90000,
      txCount24h: 100 + Math.random() * 900,
      createdAt: Date.now() - Math.random() * 120000, // 0-2 min old
      dex: 'raydium',
      fees: 0.25
    });

    signalCount++;
  }, 15000); // Every 15 seconds

  // Generate micro-breakout signals
  const breakoutInterval = setInterval(() => {
    const token = testTokens[1];
    
    // Simulate transaction activity
    for (let i = 0; i < 5 + Math.random() * 15; i++) {
      signalGenerator.onTransaction({
        tokenMint: token,
        amount: 100 + Math.random() * 1000,
        price: 0.01 + Math.random() * 0.1,
        isBuy: Math.random() > 0.5,
        timestamp: Date.now()
      });
    }
  }, 10000); // Every 10 seconds

  // Generate mean reversion signals
  const meanRevInterval = setInterval(() => {
    const token = testTokens[2];
    
    // Simulate account update (liquidity change)
    signalGenerator.onAccountUpdate({
      pubkey: `Pool${token}11111111111111111111111111111`,
      lamports: (20000 + Math.random() * 30000) * 1e9, // 20-50k SOL equivalent
      owner: 'LiquidityPool1111111111111111111111111111',
      data: Buffer.alloc(0)
    });
  }, 20000); // Every 20 seconds

  // Stop signal generation after test period
  setTimeout(() => {
    clearInterval(launchInterval);
    clearInterval(breakoutInterval);
    clearInterval(meanRevInterval);
    console.log('⏹️ Signal generation stopped');
  }, 280000); // Stop 20 seconds before test ends
}

function generateFinalReport(strategyManager: any) {
  console.log('\n📋 Final Strategy Test Report');
  console.log('=============================');

  const dailyStats = strategyManager.getDailyStats();
  const metrics = strategyManager.getAggregatedMetrics();

  console.log('📊 Overall Statistics:');
  console.log(`   Total trades: ${dailyStats.totalTrades}`);
  console.log(`   Total notional: $${dailyStats.totalNotional.toLocaleString()}`);
  console.log(`   Open positions: ${dailyStats.openPositions}`);
  console.log(`   Uptime: ${(dailyStats.uptime / 1000).toFixed(0)}s`);

  console.log('\n🎯 Strategy Performance:');
  Object.entries(metrics).forEach(([name, metric]: [string, any]) => {
    console.log(`\n${name}:`);
    console.log(`   Trades: ${metric.trades.total} (${(metric.trades.winRate * 100).toFixed(1)}% win rate)`);
    console.log(`   Avg PnL: $${metric.performance.avgPnl.toFixed(2)}`);
    console.log(`   Avg Latency: ${metric.execution.avgLatencyMs.toFixed(0)}ms`);
    console.log(`   Success Rate: ${(metric.execution.successRate * 100).toFixed(1)}%`);
  });

  console.log('\n💡 Insights:');
  
  if (dailyStats.totalTrades > 20) {
    console.log('   ✅ High activity - strategies are generating signals');
  } else if (dailyStats.totalTrades < 5) {
    console.log('   ⚠️ Low activity - consider relaxing signal filters');
  }

  const totalWinRate = Object.values(metrics).reduce((sum: number, m: any) => sum + m.trades.winRate, 0) / Object.keys(metrics).length;
  if (totalWinRate > 0.6) {
    console.log('   ✅ Good overall win rate - strategies show promise');
  } else if (totalWinRate < 0.4) {
    console.log('   ⚠️ Low win rate - strategies need tuning');
  }

  const avgLatency = Object.values(metrics).reduce((sum: number, m: any) => sum + m.execution.avgLatencyMs, 0) / Object.keys(metrics).length;
  if (avgLatency < 1000) {
    console.log('   ✅ Low latency - execution is fast');
  } else if (avgLatency > 3000) {
    console.log('   ⚠️ High latency - optimize execution path');
  }

  console.log('\n🔧 Recommendations:');
  
  if (dailyStats.totalNotional < 1000) {
    console.log('   • Consider increasing position sizes');
  }
  
  if (dailyStats.totalTrades > 40) {
    console.log('   • High frequency detected - consider consolidating signals');
  }
  
  console.log('   • Test with real market data before live trading');
  console.log('   • Gradually increase position sizes after validation');
  console.log('   • Monitor slippage and execution costs');

  console.log('\n✅ Strategy test completed successfully!');
}

// Example of manual signal testing
function testSpecificStrategy() {
  console.log('\n🧪 Testing Specific Strategy Scenarios');
  console.log('=====================================');

  const riskLimits: RiskLimits = {
    maxDailyNotional: 5000,
    maxDailyTrades: 20,
    maxDailyDrawdown: 500,
    maxPerTokenExposure: 250,
    globalKillSwitch: false
  };

  const strategyManager = createStrategyManager(riskLimits, true);

  // Test launch momentum with perfect conditions
  const perfectLaunchSignal: MarketSignal = {
    tokenMint: 'PerfectLaunch1111111111111111111111111111',
    timestamp: Date.now(),
    signalType: 'launch_momentum',
    strength: 0.9,
    data: {
      txPerMin: 25,
      tvl: 15000,
      priceChange: 0,
      spread: 50,
      depth: 2000,
      volume24h: 50000
    }
  };

  console.log('Testing perfect launch momentum signal...');
  const decisions = strategyManager.processSignal(perfectLaunchSignal);
  console.log(`Generated ${decisions.length} decisions`);

  // Test micro-breakout with good conditions
  const goodBreakoutSignal: MarketSignal = {
    tokenMint: 'GoodBreakout2222222222222222222222222222',
    timestamp: Date.now(),
    signalType: 'micro_breakout',
    strength: 0.7,
    data: {
      txPerMin: 18,
      tvl: 25000,
      priceChange: 2.5,
      spread: 40,
      depth: 3000,
      volume24h: 75000
    }
  };

  console.log('Testing good breakout signal...');
  const breakoutDecisions = strategyManager.processSignal(goodBreakoutSignal);
  console.log(`Generated ${breakoutDecisions.length} decisions`);

  // Test with risk limits exceeded
  console.log('Testing risk limit enforcement...');
  strategyManager.emergencyStop();
  
  const blockedDecisions = strategyManager.processSignal(perfectLaunchSignal);
  console.log(`Decisions after emergency stop: ${blockedDecisions.length} (should be 0)`);
}

// Run the tests
if (require.main === module) {
  runStrategyTest()
    .then(() => testSpecificStrategy())
    .catch(console.error);
}

export { runStrategyTest, testSpecificStrategy };
