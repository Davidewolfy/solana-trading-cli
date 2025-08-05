# 🚀 Solana Trading CLI - Quick Start Guide

Get your production-ready Solana trading system up and running in minutes!

## ⚡ One-Command Deployment

```bash
# Complete automated deployment
make all
```

This single command will:
1. 🔧 Configure your environment interactively
2. 🚀 Deploy all services with Docker Compose  
3. 🧪 Test all flows and components
4. 📊 Setup monitoring and alerting
5. 🚀 Apply scaling optimizations

## 📋 Prerequisites

Ensure you have these installed:

```bash
# Check prerequisites
docker --version          # Docker 20.10+
docker-compose --version  # Docker Compose 2.0+
node --version            # Node.js 18+
cargo --version           # Rust 1.70+
```

## 🎯 Step-by-Step Deployment

### 1. Clone and Setup

```bash
git clone <repository>
cd solana-trading-cli

# Install dependencies and build
make install
```

### 2. Configure Environment

#### Option A: Infisical Secret Management (Recommended)

```bash
# Setup Infisical credentials in .env
INFISICAL_CLIENT_ID=your_client_id
INFISICAL_CLIENT_SECRET=your_client_secret
INFISICAL_PROJECT_ID=1232ea01-7ff9-4eac-be5a-c66a6cb34c88
INFISICAL_ENVIRONMENT=dev

# Test secret loading
make test-secrets
```

#### Option B: Local Configuration

```bash
# Interactive configuration
make configure
```

This will:
- Create `.env` file with your settings
- Setup wallet configuration
- Configure RPC and gRPC endpoints
- Set safety limits and performance parameters

### 3. Deploy Services

```bash
# Deploy all services
make deploy
```

Services deployed:
- 🎛️ **Kestra** (Orchestration) - `http://localhost:8080`
- 🗄️ **PostgreSQL** (Database) - `localhost:5432`
- 🔄 **Redis** (Caching) - `localhost:6379`

### 4. Test Everything

```bash
# Run comprehensive tests
make test
```

Tests include:
- ✅ Health checks for all services
- ✅ API endpoint validation
- ✅ Production trade flow (dry-run)
- ✅ Production stream flow
- ✅ E2E integration test
- ✅ Performance benchmark

### 5. Setup Monitoring

```bash
# Setup monitoring and alerting
make monitor
```

Monitoring stack:
- 📈 **Grafana** (Dashboards) - `http://localhost:3000`
- 🔍 **Prometheus** (Metrics) - `http://localhost:9090`
- 🚨 **Alertmanager** (Alerts) - `http://localhost:9093`

### 6. Scale for Production

```bash
# Apply scaling optimizations
make scale
```

Optimizations:
- 👥 Multiple Kestra workers
- 🗄️ Database performance tuning
- 🔄 Redis caching
- ⚡ Quote fetching optimization
- 🔄 Load balancing

## 🎮 Quick Commands

### Essential Commands

```bash
make help           # Show all available commands
make status         # Check service status
make logs           # View all logs
make restart        # Restart all services
```

### Testing Commands

```bash
make test-health      # Quick health check
make test-trade       # Test trade flow
make test-stream      # Test streaming flow
make test-strategies  # Test trading strategies (shadow mode)
make test-strategy-local # Test strategies locally
```

### Management Commands

```bash
make start          # Start all services
make stop           # Stop all services
make clean          # Clean up everything
make backup         # Backup configuration
```

## 💱 Execute Your First Trade

### Dry Run Trade (Safe Testing)

```bash
curl -X POST http://localhost:8080/api/v1/executions/solana.trading/production-trade \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": {
      "inputMint": "So11111111111111111111111111111111111111112",
      "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "amount": "1000000",
      "slippageBps": 50,
      "dryRun": true,
      "enableParallelQuotes": true
    }
  }'
```

### Monitor Trade Execution

```bash
# Watch Kestra UI
open http://localhost:8080

# View real-time logs
make logs-kestra
```

## 📡 Start Streaming

### Monitor DEX Activity

```bash
curl -X POST http://localhost:8080/api/v1/executions/solana.streaming/production-stream \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": {
      "duration": "PT10M",
      "programs": [
        "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
        "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc"
      ],
      "enableAccountFiltering": true,
      "minLiquidityThreshold": 5000000
    }
  }'
```

## 🎯 Test Trading Strategies

### Shadow Mode Strategy Testing

```bash
# Test strategies without real execution
curl -X POST http://localhost:8080/api/v1/executions/solana.strategies/strategy-shadow-mode \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": {
      "duration": "PT10M",
      "strategies": ["launch_momentum", "micro_breakout"],
      "riskLimits": {
        "maxDailyNotional": 10000,
        "maxDailyTrades": 50,
        "maxPerTokenExposure": 500
      }
    }
  }'
```

### Available Strategies

1. **Launch Momentum** - Detects new token launches with strong initial activity
   - Entry: 1-2 min after launch with min liquidity and tx activity
   - Exit: Quick TP/SL or time-based when momentum fades

2. **Micro Breakout** - Targets breakouts after consolidation periods
   - Entry: When tx/min increases significantly after consolidation
   - Exit: Quick TP/SL or when activity returns to normal

3. **Mean Reversion** - Exploits price deviations from reference levels
4. **Event Driven** - Reacts to cross-DEX signals and listings
5. **DCA/Accumulation** - Automated accumulation with trend filters

### Local Strategy Testing

```bash
# Test strategies locally
make test-strategy-local

# Or run directly
npm run build
node dist/examples/strategy-testing.js
```

## 📊 Access Dashboards

### Kestra UI (Main Interface)
- **URL**: http://localhost:8080
- **Features**: Flow management, execution monitoring, logs

### Grafana (Metrics & Dashboards)
- **URL**: http://localhost:3000
- **Login**: admin/admin
- **Dashboards**: Trading metrics, system performance

### Prometheus (Raw Metrics)
- **URL**: http://localhost:9090
- **Features**: Query metrics, view targets, alerts

## 🛡️ Safety First

### Always Start with Dry Run

```bash
# Set global dry-run mode in .env
REQUIRE_DRY_RUN=true

# Or specify in each trade
"dryRun": true
```

### Monitor Everything

```bash
# Real-time health monitoring
make test-health

# Check system status
make status

# View performance metrics
open http://localhost:3000
```

### Use Minimal Funds

- Start with small amounts (0.001-0.01 SOL)
- Use dedicated trading wallet
- Never use your main wallet

## 🔧 Configuration Examples

### High-Performance Setup

```bash
# In .env file
MAX_PARALLEL_QUOTES=6
QUOTE_TIMEOUT_MS=8000
ENABLE_PARALLEL_QUOTES=true
MAX_TRADE_AMOUNT=100000000  # 0.1 SOL
```

### Conservative Setup

```bash
# In .env file
MAX_PARALLEL_QUOTES=2
QUOTE_TIMEOUT_MS=15000
REQUIRE_DRY_RUN=true
MAX_SLIPPAGE_BPS=100  # 1%
```

## 🚨 Troubleshooting

### Common Issues

1. **Services won't start**
   ```bash
   # Check Docker
   docker ps
   make status
   
   # View logs
   make logs
   ```

2. **Tests failing**
   ```bash
   # Check health
   make test-health
   
   # Check configuration
   cat .env
   ```

3. **No quotes received**
   ```bash
   # Test RPC connectivity
   curl -X POST $RPC_URL -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
   
   # Check executor
   ./exec-rs/target/release/exec-rs ping --rpc-url $RPC_URL
   ```

### Get Help

```bash
# Show all commands
make help

# Check system info
make info

# View version
make version
```

## 🎯 Next Steps

1. **Customize Configuration**
   - Adjust `.env` settings for your needs
   - Configure monitoring alerts
   - Set up notification webhooks

2. **Add More DEX Adapters**
   - Implement additional DEX integrations
   - Customize scoring weights
   - Add new trading strategies

3. **Production Hardening**
   - Set up SSL/TLS
   - Configure firewall rules
   - Implement backup procedures

4. **Scale for Volume**
   - Add more workers
   - Optimize database
   - Set up load balancing

## 🤖 ML Trading (ASI-Arch)

### Quick ML Model Search

```bash
# Run automated architecture search
make model-search

# Extended search with more architectures
make model-search-extended

# Test ML components locally
make test-ml-local
```

### 3-Week Implementation Plan

**Week 1: Data & Features**
```bash
# Setup feature store and data pipeline
curl -X POST http://localhost:8080/api/v1/executions/solana.ml/data-pipeline \
  -d '{"inputs": {"symbols": ["SOL-PERP"], "days": 30}}'
```

**Week 2: Model Search & Validation**
```bash
# Run ASI-Arch model search
make model-search-extended

# Validate with walk-forward testing
curl -X POST http://localhost:8080/api/v1/executions/solana.ml/backtest \
  -d '{"inputs": {"model_id": "best_model", "validation_type": "walk_forward"}}'
```

**Week 3: Paper Trading & Live**
```bash
# Start paper trading
curl -X POST http://localhost:8080/api/v1/executions/solana.strategies/ml-paper-trading \
  -d '{"inputs": {"duration": "PT168H", "model_id": "validated_model"}}'

# Graduate to small live positions
make deploy-ml-strategy
```

## 📚 Documentation

- **Architecture**: [docs/UNIFIED-ARCHITECTURE.md](docs/UNIFIED-ARCHITECTURE.md)
- **Trading Strategies**: [docs/TRADING-STRATEGIES.md](docs/TRADING-STRATEGIES.md)
- **ML Validation**: [docs/ML-VALIDATION-CHECKLIST.md](docs/ML-VALIDATION-CHECKLIST.md)
- **Production Guide**: [README-PRODUCTION.md](README-PRODUCTION.md)
- **API Reference**: Available in Kestra UI

---

**🎉 You're ready to trade! Start with dry-run mode and gradually increase your confidence.**

**🤖 For ML trading: Start with model search, validate thoroughly, then paper trade before going live.**

**⚠️ Remember: Always test thoroughly before using real funds!**
