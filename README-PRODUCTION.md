# Solana Trading CLI - Production Deployment Guide

This guide covers the production deployment of the unified router and streaming architecture.

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Kestra Flow   │    │  Unified Router │    │ gRPC Streaming  │
│                 │    │                 │    │                 │
│ • Trade Flow    │───▶│ • Jupiter       │◀───│ • Yellowstone   │
│ • Stream Flow   │    │ • Raydium       │    │ • Account Data  │
│ • E2E Test      │    │ • Orca          │    │ • Transactions  │
└─────────────────┘    │ • Meteora       │    │ • Slots         │
                       └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │ Rust Executor   │
                       │                 │
                       │ • ping          │
                       │ • simulate      │
                       │ • swap          │
                       └─────────────────┘
```

## 🚀 Quick Start

### 1. Environment Setup

```bash
# Clone and setup
git clone <repository>
cd solana-trading-cli

# Copy environment configuration
cp .env.example .env
# Edit .env with your configuration

# Install dependencies
npm ci

# Build TypeScript
npm run build

# Build Rust executor
cd exec-rs
cargo build --release
cd ..
```

### 2. Configure Secrets

```bash
# Create secrets directory
mkdir -p secrets

# Add your wallet (IMPORTANT: Use a dedicated trading wallet)
cp /path/to/your/wallet.json secrets/wallet.json

# Set proper permissions
chmod 600 secrets/wallet.json
```

### 3. Start Kestra

```bash
# Start Kestra with all services
docker-compose -f docker-compose.kestra.yml up -d

# Check status
docker-compose -f docker-compose.kestra.yml ps

# View logs
docker-compose -f docker-compose.kestra.yml logs -f kestra
```

### 4. Deploy Flows

```bash
# Kestra should auto-load flows from ./kestra/flows/
# Verify in UI: http://localhost:8080

# Or manually upload flows
curl -X POST http://localhost:8080/api/v1/flows \
  -H "Content-Type: application/yaml" \
  --data-binary @kestra/flows/production-trade.yml
```

## 📊 Production Flows

### Trade Flow

Execute multi-DEX trades with advanced scoring:

```bash
curl -X POST http://localhost:8080/api/v1/executions/solana.trading/production-trade \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": {
      "inputMint": "So11111111111111111111111111111111111111112",
      "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "amount": "1000000",
      "slippageBps": 50,
      "executionMode": "simple",
      "dryRun": true,
      "enableParallelQuotes": true
    }
  }'
```

### Streaming Flow

Monitor DEX programs with advanced filtering:

```bash
curl -X POST http://localhost:8080/api/v1/executions/solana.streaming/production-stream \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": {
      "duration": "PT30M",
      "programs": [
        "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
        "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc"
      ],
      "enableAccountFiltering": true,
      "minLiquidityThreshold": 5000000
    }
  }'
```

### E2E Integration Test

```bash
curl -X POST http://localhost:8080/api/v1/executions/solana.testing/e2e-integration \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": {
      "duration": "PT5M",
      "dryRun": true
    }
  }'
```

## 🔧 Configuration

### Environment Variables

Key configuration in `.env`:

```bash
# RPC Configuration
RPC_URL=https://api.mainnet-beta.solana.com
YELLOWSTONE_ENDPOINT=grpc.triton.one:443

# Performance Tuning
MAX_PARALLEL_QUOTES=4
QUOTE_TIMEOUT_MS=10000
TRADE_TIMEOUT_MS=60000

# Safety Limits
MAX_TRADE_AMOUNT=1000000000
MAX_SLIPPAGE_BPS=1000
REQUIRE_DRY_RUN=false
```

### Kestra Secrets

Secrets are automatically loaded from environment variables with `KESTRA_SECRET_` prefix:

- `KESTRA_SECRET_RPC_URL`
- `KESTRA_SECRET_YELLOWSTONE_ENDPOINT`
- `KESTRA_SECRET_WALLET_PATH`

## 📈 Monitoring

### Health Checks

```bash
# System health
curl http://localhost:8080/health

# Executor health
./exec-rs/target/release/exec-rs ping --rpc-url $RPC_URL

# Router health (via Node.js)
node -e "
const { createUnifiedRouter } = require('./dist/router');
const router = createUnifiedRouter();
router.healthCheck().then(console.log);
"
```

### Metrics

Access monitoring dashboards:

- **Kestra UI**: http://localhost:8080
- **Prometheus**: http://localhost:9090 (if enabled)
- **Grafana**: http://localhost:3000 (if enabled)

### Logs

```bash
# Kestra logs
docker-compose -f docker-compose.kestra.yml logs -f kestra

# Application logs
tail -f logs/trading.log

# Executor logs
./exec-rs/target/release/exec-rs ping --rpc-url $RPC_URL 2>&1 | tee logs/executor.log
```

## 🛡️ Security

### Wallet Security

```bash
# Use dedicated trading wallet
# Never commit wallet files to git
# Set proper file permissions
chmod 600 secrets/wallet.json

# Consider hardware wallet integration for production
```

### Network Security

```bash
# Use HTTPS endpoints only
# Configure firewall rules
# Enable VPN for sensitive operations
# Use private RPC endpoints for production
```

### Operational Security

```bash
# Enable dry-run mode for testing
REQUIRE_DRY_RUN=true

# Set conservative limits
MAX_TRADE_AMOUNT=100000000  # 0.1 SOL
MAX_SLIPPAGE_BPS=100        # 1%

# Monitor all transactions
# Set up alerts for failed trades
# Regular backup of configurations
```

## 🔄 Deployment

### Production Checklist

- [ ] Environment variables configured
- [ ] Wallet properly secured
- [ ] RPC endpoints tested
- [ ] Yellowstone gRPC connectivity verified
- [ ] All adapters health checked
- [ ] Dry-run tests passed
- [ ] Monitoring configured
- [ ] Alerts set up
- [ ] Backup procedures in place

### Scaling

```bash
# Horizontal scaling with multiple Kestra workers
docker-compose -f docker-compose.kestra.yml up -d --scale kestra=3

# Load balancing for high availability
# Database clustering for persistence
# Redis clustering for caching
```

## 🚨 Troubleshooting

### Common Issues

1. **Quote Timeouts**
   ```bash
   # Increase timeout
   QUOTE_TIMEOUT_MS=15000
   
   # Check RPC connectivity
   curl -X POST $RPC_URL -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
   ```

2. **gRPC Connection Issues**
   ```bash
   # Test connectivity
   grpcurl -plaintext $YELLOWSTONE_ENDPOINT list
   
   # Check firewall/proxy settings
   # Verify endpoint credentials
   ```

3. **Executor Failures**
   ```bash
   # Check binary permissions
   chmod +x exec-rs/target/release/exec-rs
   
   # Test manually
   ./exec-rs/target/release/exec-rs ping --rpc-url $RPC_URL
   
   # Check dependencies
   ldd exec-rs/target/release/exec-rs
   ```

### Performance Tuning

```bash
# Optimize quote fetching
MAX_PARALLEL_QUOTES=6
QUOTE_TIMEOUT_MS=8000

# Tune gRPC streaming
YELLOWSTONE_PING_INTERVAL=30000
YELLOWSTONE_RECONNECT_INTERVAL=5000

# Database optimization
# Connection pooling
# Query optimization
```

## 📚 API Reference

### Unified Router

```typescript
import { createUnifiedRouter } from './src/router';

const router = createUnifiedRouter({
  defaultDex: 'jupiter',
  timeoutMs: 10000,
  enableParallelQuotes: true,
  scoringWeights: { /* custom weights */ }
});

// Get quotes from all DEXs
const { quotes, best } = await router.quoteAll(params);

// Execute trade
const result = await router.trade(params);
```

### Streaming Service

```typescript
import { createUnifiedStreamingService } from './src/grpc';

const streaming = createUnifiedStreamingService({
  endpoint: 'grpc.triton.one:443',
  programs: ['675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'],
  pingIntervalMs: 30000
});

streaming.on('newPool', (event) => {
  console.log('New pool detected:', event);
});

await streaming.start();
```

## 🎯 Next Steps

1. **Production Hardening**
   - Implement circuit breakers
   - Add comprehensive error handling
   - Set up automated failover

2. **Advanced Features**
   - MEV protection integration
   - Advanced routing algorithms
   - Real-time arbitrage detection

3. **Monitoring Enhancement**
   - Custom metrics collection
   - Performance dashboards
   - Automated alerting

4. **Security Improvements**
   - Hardware wallet integration
   - Multi-signature support
   - Audit trail logging

For detailed documentation, see [docs/UNIFIED-ARCHITECTURE.md](docs/UNIFIED-ARCHITECTURE.md).
