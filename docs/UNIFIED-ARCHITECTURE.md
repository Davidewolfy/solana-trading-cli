# Unified Architecture - Solana Trading CLI

This document describes the new unified architecture that provides a single interface for multi-DEX trading with low-latency streaming.

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

## 🔄 Unified Router

### Core Components

1. **Router Types** (`src/router/types.ts`)
   - Common interfaces for all DEX adapters
   - Execution modes: `simple`, `jito`, `bloxroute`
   - Standardized quote and trade results

2. **Scoring System** (`src/router/scoring.ts`)
   - Multi-factor quote evaluation
   - Weighted scoring: output amount, price impact, fees, latency
   - Quality filtering and best route selection

3. **Unified Router** (`src/router/unified-router.ts`)
   - Single interface for all DEX operations
   - Parallel quote fetching with timeout
   - Automatic best route selection
   - Retry logic and error handling

### Usage Example

```typescript
import { createUnifiedRouter, createJupiterUnifiedAdapter } from './src/router';

// Create router
const router = createUnifiedRouter({
  defaultDex: 'jupiter',
  timeoutMs: 10000,
  enableParallelQuotes: true
});

// Register adapters
router.registerAdapter(createJupiterUnifiedAdapter());

// Get quotes
const { quotes, best } = await router.quoteAll({
  inputMint: 'So11111111111111111111111111111111111111112',
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  amount: '1000000',
  slippageBps: 50
});

// Execute trade
const result = await router.trade({
  inputMint: 'So11111111111111111111111111111111111111112',
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  amount: '1000000',
  slippageBps: 50,
  mode: 'simple',
  dryRun: false,
  idempotencyKey: 'trade_123'
});
```

## 📡 gRPC Streaming

### Core Components

1. **Stream Types** (`src/grpc/types.ts`)
   - Yellowstone gRPC protocol definitions
   - Subscription filters and configurations
   - Event types and data structures

2. **Yellowstone Client** (`src/grpc/client.ts`)
   - Low-level gRPC client with keepalive
   - Connection management and reconnection
   - Ping mechanism to prevent LB timeouts

3. **Streaming Service** (`src/grpc/unified-streaming.ts`)
   - High-level event processing
   - DEX program detection and filtering
   - Event aggregation and analysis

### Usage Example

```typescript
import { createUnifiedStreamingService } from './src/grpc';

// Create streaming service
const streaming = createUnifiedStreamingService({
  endpoint: 'grpc.triton.one:443',
  programs: [
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium
    'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc'   // Orca
  ],
  pingIntervalMs: 30000
});

// Event handlers
streaming.on('newPool', (event) => {
  console.log(`New pool: ${event.dex} - ${event.poolAddress}`);
});

streaming.on('dexTx', (event) => {
  console.log(`DEX transaction: ${event.dex} - ${event.data.signature}`);
});

// Start streaming
await streaming.start();
```

## 🦀 Rust Executor

### Commands

1. **ping** - Health check and RPC validation
2. **simulate** - Transaction simulation without execution
3. **swap** - Trade execution with multiple modes

### Usage Example

```bash
# Health check
./exec-rs ping --rpc-url https://api.mainnet-beta.solana.com

# Simulate trade
./exec-rs simulate \
  --input-mint So11111111111111111111111111111111111111112 \
  --output-mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
  --amount 1000000 \
  --slippage-bps 50

# Execute trade
./exec-rs swap \
  --input-mint So11111111111111111111111111111111111111112 \
  --output-mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
  --amount 1000000 \
  --slippage-bps 50 \
  --wallet /path/to/wallet.json \
  --mode simple \
  --idempotency-key trade_123
```

## 🎛️ Kestra Orchestration

### Available Flows

1. **minimal-trade.yml** - Basic trading with unified router
2. **minimal-stream.yml** - Yellowstone gRPC streaming
3. **e2e-integration.yml** - End-to-end integration test

### Flow Execution

```bash
# Execute trade flow
curl -X POST http://localhost:8080/api/v1/executions/solana.trading/minimal-trade \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": {
      "inputMint": "So11111111111111111111111111111111111111112",
      "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "amount": "1000000",
      "dryRun": true
    }
  }'

# Execute streaming flow
curl -X POST http://localhost:8080/api/v1/executions/solana.streaming/minimal-stream \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": {
      "duration": "PT5M",
      "programs": ["675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"]
    }
  }'
```

## 🔧 Configuration

### Environment Variables

```bash
# Required
export MAINNET_ENDPOINT="https://api.mainnet-beta.solana.com"
export YELLOWSTONE_ENDPOINT="grpc.triton.one:443"

# Optional
export JUPITER_API_URL="https://quote-api.jup.ag/v6"
export WALLET_PATH="/path/to/wallet.json"
export LOG_LEVEL="info"
```

### Kestra Secrets

```yaml
secrets:
  RPC_URL: "https://api.mainnet-beta.solana.com"
  YELLOWSTONE_ENDPOINT: "grpc.triton.one:443"
  WALLET_PATH: "/secrets/wallet.json"
```

## 🚀 Getting Started

### 1. Build Components

```bash
# Install Node.js dependencies
npm ci

# Build TypeScript
npm run build

# Build Rust executor
cd exec-rs
cargo build --release
cd ..
```

### 2. Run E2E Test

```bash
# Via Node.js
npm run test:e2e

# Via Kestra
curl -X POST http://localhost:8080/api/v1/executions/solana.testing/e2e-integration
```

### 3. Start Trading

```bash
# Manual trade via Kestra
curl -X POST http://localhost:8080/api/v1/executions/solana.trading/minimal-trade \
  -d '{"inputs": {"inputMint": "...", "outputMint": "...", "amount": "1000000"}}'
```

## 📊 Monitoring

### Key Metrics

- **Quote Latency**: P95 < 2000ms
- **Trade Success Rate**: > 95%
- **Stream Events**: > 100/minute
- **Error Rate**: < 5%

### Health Checks

```bash
# Router health
curl http://localhost:3000/api/router/health

# Streaming health
curl http://localhost:3000/api/streaming/health

# Executor health
./exec-rs ping
```

## 🔄 Migration from Legacy

### Router Migration

```typescript
// Old
import { createRouter, DEXType } from './src/router';
const router = createRouter({ defaultDEX: DEXType.JUPITER });

// New
import { createUnifiedRouter } from './src/router';
const router = createUnifiedRouter({ defaultDex: 'jupiter' });
```

### Streaming Migration

```typescript
// Old
import { createDataAggregator } from './src/data';
const aggregator = createDataAggregator();

// New
import { createUnifiedStreamingService } from './src/grpc';
const streaming = createUnifiedStreamingService();
```

## 🎯 Next Steps

1. **Multi-DEX Expansion** - Add Raydium, Orca, Meteora adapters
2. **Advanced Streaming** - Account filters, event aggregation
3. **Production Hardening** - Error handling, monitoring, optimization
4. **Strategy Integration** - Connect with trading strategies
5. **Performance Optimization** - Latency reduction, throughput improvement

## 📚 Additional Resources

- [API Documentation](./API.md)
- [Configuration Guide](./CONFIG.md)
- [Troubleshooting](./RUNBOOK.md)
- [Performance Tuning](./PERFORMANCE.md)
