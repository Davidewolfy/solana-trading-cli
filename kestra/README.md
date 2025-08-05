# Kestra Orchestration for Solana Trading CLI

This directory contains Kestra workflow configurations for orchestrating Solana trading operations and real-time market data streaming.

## Overview

Kestra is used to orchestrate complex trading workflows, manage scheduling, and provide monitoring capabilities for the Solana trading system.

## Flows

### 1. Trade Flow (`flows/trade.yml`)

Unified trading flow supporting multiple DEXs with the following features:

- **Multi-DEX Support**: Jupiter, Raydium, Orca, Meteora
- **Flexible Parameters**: Configurable token amounts, slippage, execution methods
- **Auto-Selection**: Automatically choose the best DEX based on price quotes
- **Risk Management**: Input validation and slippage limits
- **Execution Methods**: Simple, Jito, bloXroute transaction execution
- **Dry Run Mode**: Test trades without execution

#### Usage Examples

```bash
# Manual buy trade via Jupiter
curl -X POST http://localhost:8080/api/v1/executions/solana.trading/solana-trading-flow \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": {
      "tokenAddress": "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
      "side": "buy",
      "solAmount": 0.1,
      "dex": "jupiter",
      "slippage": 1.0
    }
  }'

# Auto-select best DEX for sell
curl -X POST http://localhost:8080/api/v1/executions/solana.trading/solana-trading-flow \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": {
      "tokenAddress": "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
      "side": "sell",
      "sellPercentage": 50,
      "autoSelectBestDEX": true,
      "executionMethod": "jito"
    }
  }'
```

### 2. Streaming Flow (`flows/stream.yml`)

Real-time market data streaming with gRPC integration:

- **Multi-DEX Monitoring**: Raydium, Orca, Meteora, Pump.fun, CPMM
- **Event Types**: New pools, price updates, trades, liquidity changes
- **Filtering**: Token-specific monitoring, volume/liquidity thresholds
- **Alerting**: Webhook notifications for significant events
- **Auto-Reconnection**: Resilient connection management
- **Analytics**: Real-time event processing and reporting

#### Usage Examples

```bash
# Start streaming for specific DEXs
curl -X POST http://localhost:8080/api/v1/executions/solana.streaming/solana-streaming-flow \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": {
      "dexes": ["raydium", "pump_fun"],
      "minVolumeThreshold": 5000,
      "enableAlerts": true,
      "alertWebhook": "https://your-webhook-url.com/alerts"
    }
  }'

# Monitor specific tokens
curl -X POST http://localhost:8080/api/v1/executions/solana.streaming/solana-streaming-flow \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": {
      "dexes": ["raydium", "orca", "meteora"],
      "tokenFilters": ["7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr"],
      "minLiquidityThreshold": 10000
    }
  }'
```

## Setup

### 1. Start Kestra with Docker Compose

```bash
cd kestra
docker-compose up -d
```

This will start:
- Kestra server on `http://localhost:8080`
- PostgreSQL database for workflow storage
- Redis for caching (optional)
- Elasticsearch for logs (optional)

### 2. Access Kestra UI

Open `http://localhost:8080` in your browser to access the Kestra web interface.

### 3. Deploy Flows

The flows are automatically mounted from the `flows/` directory. You can also deploy them via the UI or API:

```bash
# Deploy trade flow
curl -X PUT http://localhost:8080/api/v1/flows/solana.trading/solana-trading-flow \
  -H "Content-Type: application/yaml" \
  --data-binary @flows/trade.yml

# Deploy streaming flow
curl -X PUT http://localhost:8080/api/v1/flows/solana.streaming/solana-streaming-flow \
  -H "Content-Type: application/yaml" \
  --data-binary @flows/stream.yml
```

## Configuration

### Environment Variables

Create a `.env` file in the project root with your configuration:

```env
# Solana Configuration
PRIVATE_KEY=your_private_key_here
MAINNET_ENDPOINT=https://your-rpc-endpoint.com
JITO_FEE=0.00009
BLOXROUTE_AUTH_HEADER=your_bloxroute_auth
BLOXROUTE_FEE=0.001

# gRPC Configuration
GRPC_ENDPOINT=grpc.triton.one:443
GRPC_AUTH_TOKEN=your_auth_token

# Alert Configuration
WEBHOOK_URL=https://your-webhook-url.com/alerts
```

### Kestra Configuration

The `docker-compose.yml` includes a complete Kestra configuration with:

- PostgreSQL backend for workflow storage
- Local file storage for artifacts
- Docker task runner support
- Health checks and monitoring

## Monitoring

### Execution Logs

View execution logs in the Kestra UI:
1. Go to `Executions` tab
2. Click on any execution to view detailed logs
3. Monitor real-time progress and outputs

### Metrics and Alerts

- **Trade Metrics**: Success rates, execution times, slippage
- **Streaming Metrics**: Event counts, connection status, error rates
- **System Metrics**: Resource usage, queue depths, task durations

### Webhooks

Configure webhook endpoints to receive alerts for:
- Trade execution results
- New pool discoveries
- Large trade detections
- System errors and reconnections

## Scheduling

### Automated Trading

Enable scheduled DCA (Dollar Cost Averaging) trades:

```yaml
triggers:
  - id: daily-dca
    type: io.kestra.core.models.triggers.types.Schedule
    cron: "0 0 12 * * ?" # Daily at noon
    inputs:
      side: "buy"
      solAmount: 0.1
      dex: "jupiter"
      autoSelectBestDEX: true
```

### Periodic Streaming

Schedule regular streaming sessions:

```yaml
triggers:
  - id: hourly-streaming
    type: io.kestra.core.models.triggers.types.Schedule
    cron: "0 0 */1 * * ?" # Every hour
    inputs:
      dexes: ["raydium", "pump_fun"]
      minVolumeThreshold: 1000
```

## Security

- Store sensitive configuration in environment variables
- Use Kestra's secret management for API keys
- Implement proper access controls for webhook endpoints
- Monitor execution logs for suspicious activity

## Troubleshooting

### Common Issues

1. **Node.js Module Not Found**
   - Ensure the project is properly mounted in the container
   - Check that `package.json` dependencies are installed

2. **gRPC Connection Failures**
   - Verify gRPC endpoint and authentication
   - Check network connectivity and firewall rules

3. **Trade Execution Errors**
   - Validate wallet configuration and balance
   - Check DEX-specific requirements and pool availability

### Logs and Debugging

- Enable debug logging in Kestra configuration
- Use dry run mode for testing trade parameters
- Monitor streaming connection status and event counts

## Integration Examples

### External Trading Signals

```bash
# Webhook trigger for external signals
curl -X POST http://localhost:8080/api/v1/executions/trigger/solana-trade-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "tokenAddress": "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
    "side": "buy",
    "solAmount": 0.5,
    "signal": "bullish_breakout"
  }'
```

### Portfolio Management

Combine multiple flows for comprehensive portfolio management:
1. Streaming flow for market monitoring
2. Trade flow for execution
3. Custom flows for rebalancing and risk management
