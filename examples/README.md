# Examples

This directory contains comprehensive examples demonstrating the key features of the Solana Trading CLI.

## Unified Router Demo

**File**: `unified-router-demo.ts`

Demonstrates the unified router functionality:

- Trading across multiple DEXs with a single interface
- Price comparison from all supported DEXs
- Automatic DEX selection for best prices
- Different execution methods (Simple, Jito, bloXroute)
- Error handling and parameter validation

### Run the demo:

```bash
ts-node examples/unified-router-demo.ts
```

### Key Features Demonstrated:

1. **Multi-DEX Price Quotes**: Get quotes from Jupiter, Raydium, Orca, and Meteora simultaneously
2. **Manual DEX Selection**: Execute trades on specific DEXs
3. **Auto DEX Selection**: Automatically choose the DEX with the best price
4. **Execution Methods**: Compare Simple, Jito, and bloXroute execution
5. **Error Handling**: Proper validation and error management

## Streaming Service Demo

**File**: `streaming-demo.ts`

Demonstrates real-time market data streaming:

- Monitor multiple DEXs for new pools and price updates
- Filter events based on volume and liquidity thresholds
- Handle different types of market events
- Implement custom alert logic
- Connection management and auto-reconnection

### Run the demo:

```bash
# Monitor all tokens
ts-node examples/streaming-demo.ts

# Monitor specific tokens only
ts-node examples/streaming-demo.ts --specific-tokens
```

### Key Features Demonstrated:

1. **Multi-DEX Monitoring**: Stream data from Raydium, Pump.fun, Orca, etc.
2. **Event Filtering**: Volume and liquidity-based filtering
3. **Alert System**: Custom alerts for significant events
4. **Statistics**: Real-time event counting and reporting
5. **Graceful Shutdown**: Proper cleanup on exit

## Example Outputs

### Unified Router Demo Output:

```
🚀 Unified Router Demo Starting...

📝 Registering DEX adapters...
✅ All adapters registered

📊 Demo 1: Getting price quotes from all DEXs
==================================================
Price quotes for buying with 0.1 SOL:
JUPITER: 1234.567890 tokens (✅)
RAYDIUM: 1230.123456 tokens (✅)
ORCA: 1225.987654 tokens (✅)
METEORA: 1240.111222 tokens (✅)

🎯 Best quote: METEORA with 1240.111222 tokens

💰 Demo 2: Manual DEX selection (Jupiter buy)
==================================================
✅ Buy trade executed successfully!
📝 Signature: jupiter-buy-success
🏪 DEX used: jupiter
⚡ Execution method: simple
📊 Slippage: 1%
```

### Streaming Demo Output:

```
📡 Streaming Service Demo Starting...

🔧 Setting up event listeners...
🚀 Starting streaming service...
✅ Streaming service started successfully
📡 Monitoring market data... (Press Ctrl+C to stop)

🆕 NEW POOL DETECTED
DEX: RAYDIUM
Token: 7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr
Pool: 8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj
Time: 2024-01-15T10:30:45.123Z
🚨 HIGH LIQUIDITY POOL: $15,000

💱 LARGE TRADE
DEX: PUMP_FUN
Token: 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM
Side: BUY
Amount: $5,000
Price: $0.001234
Trader: 5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1
```

## Configuration

### Environment Variables

Make sure to set up your environment variables in `src/helpers/.env`:

```env
PRIVATE_KEY=your_private_key_here
MAINNET_ENDPOINT=https://your-rpc-endpoint.com
JITO_FEE=0.00009
BLOXROUTE_AUTH_HEADER=your_bloxroute_auth
BLOXROUTE_FEE=0.001
GRPC_ENDPOINT=grpc.triton.one:443
```

### Prerequisites

1. Node.js 22.2.0 or higher
2. TypeScript installed
3. Valid Solana wallet with some SOL for trading
4. RPC endpoint access
5. Optional: Jito/bloXroute credentials for advanced execution

## Safety Notes

- The demos use small amounts (0.01-0.005 SOL) for safety
- Always test on devnet first before using mainnet
- Monitor your wallet balance during demos
- Use dry-run mode in production workflows

## Extending the Examples

You can extend these examples to:

1. **Add Custom Strategies**: Implement your own trading logic
2. **Integrate with External APIs**: Connect to price feeds, news APIs, etc.
3. **Add Database Storage**: Store trade history and analytics
4. **Implement Risk Management**: Add stop-loss, take-profit logic
5. **Create Custom Alerts**: Send notifications via Discord, Telegram, etc.

## Troubleshooting

### Common Issues:

1. **Module Not Found**: Ensure you're running from the project root
2. **RPC Errors**: Check your RPC endpoint and rate limits
3. **Insufficient Balance**: Ensure wallet has enough SOL for trades
4. **gRPC Connection**: Verify gRPC endpoint and authentication

### Debug Mode:

Enable debug logging by setting:

```bash
export DEBUG=solana-trading:*
ts-node examples/unified-router-demo.ts
```
