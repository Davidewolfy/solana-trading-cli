# 🎯 Solana Trading Strategies

Comprehensive memcoin trading strategies with real-time signal detection and risk management.

## 📋 Strategy Overview

Our strategy system implements 5 core strategies designed for Solana memcoin trading:

### 1. 🚀 Launch Momentum
**Target**: New token/pool launches with strong initial momentum

**Signal Detection**:
- New pool creation on Raydium/Pump.fun
- Transaction burst in first minutes
- TVL accumulation above threshold

**Entry Conditions**:
- Min liquidity: 5-10k USDC
- Min activity: >10 tx/min
- Decision window: 1-2 min after launch
- No denylist flags

**Execution**:
- Position size: 0.25-0.5x base
- Slippage: 50-120 bps (dynamic)
- Immediate Jupiter swap (1-hop preferred)

**Exit Strategy**:
- Take Profit: 1.0-2.0% net
- Stop Loss: 0.5-1.0% net
- Time-based: 3-5 min if momentum fades
- Activity-based: Exit when tx/min drops below threshold

**Risk Controls**:
- Rug detection (honeypot, low liquidity)
- Whitelist/denylist validation
- Metadata verification

### 2. 📈 Micro-Breakout
**Target**: Breakouts after short consolidation periods

**Signal Detection**:
- 10-30 min consolidation period
- Price stability within 2% range
- Transaction activity increase

**Entry Conditions**:
- tx/min > 1.5-2.0x median from last 15 min
- Tight spread (<0.8%)
- Sufficient depth (>$1500)

**Execution**:
- Position size: 0.5-1.0x base
- Slippage: 30-80 bps (dynamic)
- Pre-execution simulation for larger amounts

**Exit Strategy**:
- Take Profit: 0.8-1.5% net
- Stop Loss: 0.4-0.8% net
- Activity fade: Exit when tx/min returns below threshold

**Risk Controls**:
- False breakout detection
- Spread monitoring
- Depth requirements

### 3. 🔄 Mean Reversion
**Target**: Price deviations from reference levels

**Signal Detection**:
- On-chain price deviation >60-120 bps from reference
- VWAP/median comparison across DEXs
- Stable transaction activity

**Entry Conditions**:
- Significant price divergence
- Tight spread
- Minimum TVL and stable tx/min

**Execution**:
- Position size: 0.5x base
- Slippage: 40-60 bps
- Trade on cheaper DEX side

**Exit Strategy**:
- Target: 50-70% reversion to median
- Stop Loss: If divergence increases
- Time stop: Prevent trend day losses

### 4. 📰 Event-Driven
**Target**: Cross-DEX signals and listing events

**Signal Detection**:
- Cross-DEX routing appearance
- TVL increases on adjacent pools
- Listing announcements

**Entry Conditions**:
- Sustained expected output advantage
- Cross-validation of events
- Minimum volume thresholds

**Execution**:
- Position size: 0.25-0.5x base
- Slippage: 30-80 bps
- Quick decision making

**Exit Strategy**:
- Quick TP: 0.5-1.0%
- Time stop: 1-3 min
- Event validation required

### 5. 💰 DCA/Auto-Accumulation
**Target**: Trend-following accumulation

**Signal Detection**:
- Uptrend confirmation
- Quality token filters
- Scheduled intervals

**Entry Conditions**:
- Cron-based execution in Kestra
- Whitelist validation
- Minimum TVL requirements

**Execution**:
- Small portions: 0.1-0.3x base
- Low slippage: 20-50 bps
- Spread monitoring

**Exit Strategy**:
- Partial profit taking
- Periodic rebalancing
- Momentum filters

## 🛡️ Risk Management

### Global Risk Limits
```typescript
const riskLimits = {
  maxDailyNotional: 10000,    // $10k daily volume
  maxDailyTrades: 50,         // 50 trades per day
  maxDailyDrawdown: 1000,     // $1k max daily loss
  maxPerTokenExposure: 500,   // $500 per token
  globalKillSwitch: false     // Emergency stop
};
```

### Per-Strategy Controls
- **Daily trade limits**: Prevent overtrading
- **Token exposure caps**: Diversification enforcement
- **Cooldown periods**: False signal protection
- **Quality filters**: Minimum liquidity/activity thresholds

### Safety Features
- **Denylist checking**: Known rug/honeypot tokens
- **Metadata validation**: Token program verification
- **Slippage protection**: Dynamic adjustment based on conditions
- **Timeout controls**: Prevent stale signal execution
- **Idempotency**: Prevent duplicate trades

## 🔧 Implementation

### Quick Setup
```typescript
import { createProductionStrategySystem } from './src/strategies';

// Create strategy system
const system = createProductionStrategySystem(false); // false = live trading

// Start monitoring
const { strategyManager, signalGenerator } = system.start();

// Monitor performance
setInterval(() => {
  const stats = system.getStats();
  console.log('Strategy performance:', stats);
}, 60000);
```

### Shadow Mode Testing
```typescript
// Test without real execution
const testSystem = createProductionStrategySystem(true); // true = shadow mode

// All decisions logged, no actual trades
testSystem.start();
```

### Kestra Integration
```bash
# Deploy shadow mode flow
curl -X POST http://localhost:8080/api/v1/flows \
  -H "Content-Type: application/yaml" \
  --data-binary @kestra/flows/strategy-shadow-mode.yml

# Execute strategy testing
curl -X POST http://localhost:8080/api/v1/executions/solana.strategies/strategy-shadow-mode \
  -d '{"inputs": {"duration": "PT30M", "strategies": ["launch_momentum", "micro_breakout"]}}'
```

## 📊 Performance Metrics

### Strategy Metrics
- **Win Rate**: Percentage of profitable trades
- **Average PnL**: Mean profit/loss per trade
- **Expectancy**: Expected value per trade
- **Max Drawdown**: Largest peak-to-trough decline
- **Sharpe Ratio**: Risk-adjusted returns

### Execution Metrics
- **Latency**: Signal-to-execution time (P95/P99)
- **Slippage**: Actual vs expected execution price
- **Success Rate**: Percentage of successful executions
- **Compute Units**: Average CU consumption per trade

### Risk Metrics
- **False Breakouts**: Failed breakout signals
- **Rug Pulls**: Detected malicious tokens
- **Max Exposure**: Peak position concentration
- **Average Hold Time**: Position duration statistics

## 🧪 Testing & Validation

### Local Testing
```bash
# Run comprehensive strategy tests
make test-strategy-local

# Or directly
npm run build
node dist/examples/strategy-testing.js
```

### Shadow Mode Flow
```bash
# Test strategies in Kestra without execution
make test-strategies

# Custom shadow mode test
curl -X POST http://localhost:8080/api/v1/executions/solana.strategies/strategy-shadow-mode \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": {
      "duration": "PT60M",
      "strategies": ["launch_momentum", "micro_breakout"],
      "riskLimits": {
        "maxDailyNotional": 5000,
        "maxDailyTrades": 25
      }
    }
  }'
```

### Performance Analysis
- **Backtesting**: Historical signal replay
- **Forward Testing**: Live signal monitoring without execution
- **A/B Testing**: Strategy parameter optimization
- **Risk Simulation**: Stress testing under various market conditions

## 🔄 Integration with Unified Router

### Signal Flow
1. **Yellowstone gRPC** → Raw blockchain data
2. **Signal Generator** → Market signal detection
3. **Strategy Manager** → Decision generation
4. **Unified Router** → Multi-DEX execution
5. **Risk Manager** → Position monitoring

### Execution Path
```
Market Signal → Strategy Analysis → Risk Validation → Router Execution → Position Tracking
```

### Data Sources
- **Raydium**: Pool creation, liquidity changes
- **Pump.fun**: New token launches
- **Orca**: Whirlpool activity
- **Meteora**: DLMM pool dynamics
- **Jupiter**: Cross-DEX arbitrage opportunities

## 🚀 Production Deployment

### Prerequisites
- Unified router deployed and tested
- Yellowstone gRPC streaming active
- Risk limits configured
- Wallet funded (start small!)

### Deployment Steps
1. **Shadow Mode**: Test strategies without execution
2. **Paper Trading**: Simulate with real signals
3. **Small Live**: Start with minimal position sizes
4. **Scale Up**: Gradually increase based on performance

### Monitoring
- **Real-time dashboards**: Grafana integration
- **Alert system**: Slack/Discord notifications
- **Performance tracking**: Daily/weekly reports
- **Risk monitoring**: Exposure and drawdown alerts

## ⚠️ Important Disclaimers

- **High Risk**: Memcoin trading is extremely risky
- **Start Small**: Use minimal funds for initial testing
- **Monitor Closely**: Never leave strategies unattended
- **Paper Trade First**: Validate thoroughly before live trading
- **Regulatory Compliance**: Ensure compliance with local regulations

## 📚 Further Reading

- [Unified Router Architecture](UNIFIED-ARCHITECTURE.md)
- [Production Deployment Guide](../README-PRODUCTION.md)
- [Risk Management Best Practices](RISK-MANAGEMENT.md)
- [Strategy Parameter Tuning](STRATEGY-TUNING.md)
