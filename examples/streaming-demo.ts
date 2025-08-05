import { 
  createStreamingService, 
  StreamingDEX, 
  MarketEventType,
  DEFAULT_STREAMING_CONFIG 
} from '../src/grpc';

/**
 * Streaming Service Demo
 * 
 * This example demonstrates how to use the streaming service to:
 * 1. Monitor multiple DEXs for real-time market data
 * 2. Filter events based on volume and liquidity thresholds
 * 3. Handle different types of market events
 * 4. Implement custom alert logic
 */

async function main() {
  console.log('📡 Streaming Service Demo Starting...\n');

  // Create streaming service with configuration
  const streamingService = createStreamingService({
    ...DEFAULT_STREAMING_CONFIG,
    grpcEndpoint: process.env.GRPC_ENDPOINT || "grpc.triton.one:443",
    dexes: [StreamingDEX.RAYDIUM, StreamingDEX.PUMP_FUN, StreamingDEX.ORCA],
    tokenFilters: [], // Monitor all tokens
    minVolumeThreshold: 1000, // $1000 minimum volume
    minLiquidityThreshold: 5000, // $5000 minimum liquidity
    autoReconnect: true,
    reconnectInterval: 5000
  });

  // Event counters for statistics
  const eventStats = {
    newPools: 0,
    priceUpdates: 0,
    trades: 0,
    errors: 0,
    startTime: Date.now()
  };

  // Set up event listeners
  console.log('🔧 Setting up event listeners...');

  // Listen for new pool events
  streamingService.on('newPool', (data) => {
    eventStats.newPools++;
    console.log(`\n🆕 NEW POOL DETECTED`);
    console.log(`DEX: ${data.dex.toUpperCase()}`);
    console.log(`Token: ${data.tokenAddress}`);
    console.log(`Pool: ${data.poolAddress}`);
    console.log(`Time: ${new Date(data.timestamp).toISOString()}`);
    
    // Custom logic for new pools
    if (data.data.initialLiquidity && data.data.initialLiquidity > 10000) {
      console.log(`🚨 HIGH LIQUIDITY POOL: $${data.data.initialLiquidity.toLocaleString()}`);
      sendAlert('high_liquidity_pool', data);
    }
  });

  // Listen for price update events
  streamingService.on('priceUpdate', (data) => {
    eventStats.priceUpdates++;
    
    // Only log significant price changes
    if (data.data.priceChange24h && Math.abs(data.data.priceChange24h) > 10) {
      console.log(`\n📈 SIGNIFICANT PRICE CHANGE`);
      console.log(`DEX: ${data.dex.toUpperCase()}`);
      console.log(`Token: ${data.tokenAddress}`);
      console.log(`Price: $${data.data.price?.toFixed(6) || 'N/A'}`);
      console.log(`24h Change: ${data.data.priceChange24h?.toFixed(2) || 'N/A'}%`);
      console.log(`Volume: $${data.data.volume24h?.toLocaleString() || 'N/A'}`);
      
      if (Math.abs(data.data.priceChange24h) > 50) {
        console.log(`🚨 EXTREME PRICE MOVEMENT: ${data.data.priceChange24h.toFixed(2)}%`);
        sendAlert('extreme_price_movement', data);
      }
    }
  });

  // Listen for trade events
  streamingService.on('trade', (data) => {
    eventStats.trades++;
    
    // Log large trades
    if (data.data.amount && data.data.amount > 1000) {
      console.log(`\n💱 LARGE TRADE`);
      console.log(`DEX: ${data.dex.toUpperCase()}`);
      console.log(`Token: ${data.tokenAddress}`);
      console.log(`Side: ${data.data.side?.toUpperCase() || 'N/A'}`);
      console.log(`Amount: $${data.data.amount?.toLocaleString() || 'N/A'}`);
      console.log(`Price: $${data.data.price?.toFixed(6) || 'N/A'}`);
      console.log(`Trader: ${data.data.trader || 'N/A'}`);
      
      if (data.data.amount > 10000) {
        console.log(`🐋 WHALE TRADE: $${data.data.amount.toLocaleString()}`);
        sendAlert('whale_trade', data);
      }
    }
  });

  // Listen for error events
  streamingService.on('error', (error) => {
    eventStats.errors++;
    console.error(`\n❌ STREAMING ERROR`);
    console.error(`DEX: ${error.dex?.toUpperCase() || 'UNKNOWN'}`);
    console.error(`Error: ${error.error}`);
    console.error(`Time: ${new Date().toISOString()}`);
  });

  // Generic market data listener for all events
  streamingService.on('marketData', (data) => {
    // This receives all market events
    // You can implement custom filtering and processing here
    
    // Example: Log summary every 100 events
    const totalEvents = eventStats.newPools + eventStats.priceUpdates + eventStats.trades;
    if (totalEvents % 100 === 0 && totalEvents > 0) {
      console.log(`\n📊 EVENT MILESTONE: ${totalEvents} events processed`);
    }
  });

  // Custom alert function
  function sendAlert(type: string, data: any) {
    // In a real implementation, this would send to Discord, Telegram, email, etc.
    console.log(`🚨 ALERT: ${type.toUpperCase()}`);
    
    // Example webhook call (commented out)
    /*
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          data,
          timestamp: new Date().toISOString()
        })
      }).catch(console.error);
    }
    */
  }

  // Status reporting function
  function reportStatus() {
    const runtime = (Date.now() - eventStats.startTime) / 1000;
    const connectionStatus = streamingService.getConnectionStatus();
    
    console.log(`\n📊 STREAMING STATUS REPORT`);
    console.log(`Runtime: ${runtime.toFixed(0)}s`);
    console.log(`Connections: ${JSON.stringify(connectionStatus)}`);
    console.log(`Events: ${JSON.stringify(eventStats)}`);
    console.log(`Events/sec: ${((eventStats.newPools + eventStats.priceUpdates + eventStats.trades) / runtime).toFixed(2)}`);
  }

  // Set up periodic status reporting
  const statusInterval = setInterval(reportStatus, 30000); // Every 30 seconds

  // Graceful shutdown handler
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down streaming service...');
    clearInterval(statusInterval);
    await streamingService.stop();
    reportStatus();
    console.log('✅ Streaming service stopped');
    process.exit(0);
  });

  try {
    // Start streaming
    console.log('🚀 Starting streaming service...');
    await streamingService.start();
    console.log('✅ Streaming service started successfully');
    console.log('📡 Monitoring market data... (Press Ctrl+C to stop)\n');

    // Keep the process running
    await new Promise(() => {}); // Run indefinitely

  } catch (error) {
    console.error('❌ Failed to start streaming service:', error);
    clearInterval(statusInterval);
    process.exit(1);
  }
}

// Demo with specific token monitoring
async function monitorSpecificTokens() {
  console.log('🎯 Monitoring Specific Tokens Demo\n');

  const specificTokens = [
    "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", // POPCAT
    "So11111111111111111111111111111111111111112"   // WSOL
  ];

  const streamingService = createStreamingService({
    ...DEFAULT_STREAMING_CONFIG,
    dexes: [StreamingDEX.RAYDIUM, StreamingDEX.JUPITER],
    tokenFilters: specificTokens,
    minVolumeThreshold: 500,
    minLiquidityThreshold: 1000
  });

  streamingService.on('marketData', (data) => {
    console.log(`📊 ${data.eventType.toUpperCase()} for monitored token:`);
    console.log(`Token: ${data.tokenAddress}`);
    console.log(`DEX: ${data.dex.toUpperCase()}`);
    console.log(`Data:`, JSON.stringify(data.data, null, 2));
    console.log('---');
  });

  await streamingService.start();
  
  // Run for 5 minutes then stop
  setTimeout(async () => {
    await streamingService.stop();
    console.log('✅ Specific token monitoring completed');
  }, 300000);
}

// Run the appropriate demo based on command line arguments
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--specific-tokens')) {
    monitorSpecificTokens().catch(console.error);
  } else {
    main().catch(console.error);
  }
}

export { main as runStreamingDemo, monitorSpecificTokens };
