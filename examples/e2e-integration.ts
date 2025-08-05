import { createUnifiedRouter } from '../src/router/unified-router';
import {
  createJupiterUnifiedAdapter,
  createRaydiumUnifiedAdapter,
  createOrcaUnifiedAdapter,
  createMeteoraUnifiedAdapter
} from '../src/router';
import { createUnifiedStreamingService } from '../src/grpc/unified-streaming';
import { EventEmitter } from 'events';

/**
 * End-to-End Integration Example
 * Demonstrates: Stream -> Router -> Trade (dry-run) workflow
 */

interface E2EConfig {
  yellowstoneEndpoint: string;
  executorPath: string;
  programs: string[];
  testTokens: {
    input: string;
    output: string;
  };
  dryRun: boolean;
}

export class E2EIntegration extends EventEmitter {
  private config: E2EConfig;
  private router: any;
  private streamingService: any;
  private stats = {
    streamsReceived: 0,
    tradesTriggered: 0,
    tradesSuccessful: 0,
    errors: 0
  };

  constructor(config: E2EConfig) {
    super();
    this.config = config;
    this.initializeComponents();
  }

  private initializeComponents(): void {
    console.log('🔧 Initializing E2E integration components...');

    // Initialize unified router with production settings
    this.router = createUnifiedRouter({
      defaultDex: 'jupiter',
      timeoutMs: 12000,
      enableParallelQuotes: true,
      maxRetries: 2,
      scoringWeights: {
        expectedOut: 0.35,
        priceImpact: -0.2,
        fees: -0.15,
        latency: -0.1,
        confidence: 0.1,
        hops: -0.05,
        computeUnits: -0.05,
        liquidity: 0.1
      }
    });

    // Register all available adapters
    try {
      this.router.registerAdapter(createJupiterUnifiedAdapter({
        executorPath: this.config.executorPath
      }));
      console.log('✅ Jupiter adapter registered');
    } catch (error) {
      console.warn('⚠️ Jupiter adapter failed:', error);
    }

    try {
      this.router.registerAdapter(createRaydiumUnifiedAdapter({
        executorPath: this.config.executorPath
      }));
      console.log('✅ Raydium adapter registered');
    } catch (error) {
      console.warn('⚠️ Raydium adapter failed:', error);
    }

    try {
      this.router.registerAdapter(createOrcaUnifiedAdapter({
        executorPath: this.config.executorPath
      }));
      console.log('✅ Orca adapter registered');
    } catch (error) {
      console.warn('⚠️ Orca adapter failed:', error);
    }

    try {
      this.router.registerAdapter(createMeteoraUnifiedAdapter({
        executorPath: this.config.executorPath
      }));
      console.log('✅ Meteora adapter registered');
    } catch (error) {
      console.warn('⚠️ Meteora adapter failed:', error);
    }

    // Initialize streaming service
    this.streamingService = createUnifiedStreamingService({
      endpoint: this.config.yellowstoneEndpoint,
      programs: this.config.programs,
      pingIntervalMs: 30000,
      reconnectIntervalMs: 5000,
      maxReconnectAttempts: 3
    });

    this.setupEventHandlers();
    console.log('✅ Components initialized');
  }

  private setupEventHandlers(): void {
    // Streaming events
    this.streamingService.on('connected', () => {
      console.log('📡 Streaming service connected');
      this.emit('streamConnected');
    });

    this.streamingService.on('disconnected', () => {
      console.log('📡 Streaming service disconnected');
      this.emit('streamDisconnected');
    });

    this.streamingService.on('error', (error: Error) => {
      console.error('🚨 Streaming error:', error);
      this.stats.errors++;
      this.emit('error', error);
    });

    // DEX events that trigger trading
    this.streamingService.on('newPool', (event: any) => {
      console.log(`🆕 New pool detected: ${event.dex} - ${event.poolAddress}`);
      this.stats.streamsReceived++;
      this.handleNewPool(event);
    });

    this.streamingService.on('dexTx', (event: any) => {
      console.log(`💱 DEX transaction: ${event.dex} - ${event.data.signature}`);
      this.stats.streamsReceived++;
      this.handleDexTransaction(event);
    });

    this.streamingService.on('liquidityUpdate', (event: any) => {
      console.log(`💧 Liquidity update: ${event.dex} - ${event.poolAddress}`);
      this.stats.streamsReceived++;
      // Could trigger rebalancing trades here
    });

    // Router events
    this.router.on('quoteReceived', (event: any) => {
      console.log(`📊 Quote received from ${event.adapter}: ${event.quote.expectedOut}`);
    });

    this.router.on('tradeCompleted', (event: any) => {
      console.log(`✅ Trade completed on ${event.adapter}: ${event.signature}`);
      this.stats.tradesSuccessful++;
    });

    this.router.on('tradeFailed', (error: Error) => {
      console.error('❌ Trade failed:', error);
      this.stats.errors++;
    });
  }

  /**
   * Start the E2E integration
   */
  async start(): Promise<void> {
    console.log('🚀 Starting E2E integration...');

    try {
      // Start streaming service
      await this.streamingService.start();
      
      // Wait a moment for connection to stabilize
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Test the router with a sample quote
      await this.testRouter();
      
      console.log('✅ E2E integration started successfully');
      this.emit('started');

    } catch (error) {
      console.error('❌ Failed to start E2E integration:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Stop the E2E integration
   */
  async stop(): Promise<void> {
    console.log('🛑 Stopping E2E integration...');

    try {
      await this.streamingService.stop();
      
      console.log('✅ E2E integration stopped');
      this.emit('stopped');

    } catch (error) {
      console.error('❌ Error stopping E2E integration:', error);
      this.emit('error', error);
    }
  }

  /**
   * Test the router with sample parameters
   */
  private async testRouter(): Promise<void> {
    console.log('🧪 Testing router with sample trade...');

    try {
      const quoteParams = {
        inputMint: this.config.testTokens.input,
        outputMint: this.config.testTokens.output,
        amount: '1000000', // 0.001 SOL
        slippageBps: 50
      };

      // Get quotes
      const { quotes, best } = await this.router.quoteAll(quoteParams);
      
      if (best) {
        console.log(`📈 Best quote: ${best.dex} - ${best.expectedOut} output`);
        console.log(`   Price impact: ${best.priceImpact}%`);
        
        // Execute dry run trade
        if (this.config.dryRun) {
          const tradeResult = await this.router.trade({
            ...quoteParams,
            dryRun: true,
            mode: 'simple'
          });
          
          if (tradeResult.success) {
            console.log('✅ Dry run trade successful');
            console.log(`   Simulated output: ${tradeResult.receivedAmount}`);
          } else {
            console.error('❌ Dry run trade failed:', tradeResult.error);
          }
        }
      } else {
        console.warn('⚠️ No quotes received from router');
      }

    } catch (error) {
      console.error('❌ Router test failed:', error);
      throw error;
    }
  }

  /**
   * Handle new pool detection
   */
  private async handleNewPool(event: any): Promise<void> {
    console.log(`🎯 Processing new pool: ${event.poolAddress}`);
    
    // Example: Could trigger initial liquidity provision or monitoring
    // For now, just log the event
    this.emit('newPoolProcessed', event);
  }

  /**
   * Handle DEX transaction
   */
  private async handleDexTransaction(event: any): Promise<void> {
    console.log(`🎯 Processing DEX transaction: ${event.data.signature}`);
    
    // Example: Could trigger arbitrage or copy trading
    // For demonstration, trigger a small test trade
    if (this.shouldTriggerTrade(event)) {
      await this.triggerTestTrade(event);
    }
  }

  /**
   * Determine if we should trigger a trade based on the event
   */
  private shouldTriggerTrade(event: any): boolean {
    // Simple logic: trigger trade every 10th transaction
    return this.stats.streamsReceived % 10 === 0;
  }

  /**
   * Trigger a test trade
   */
  private async triggerTestTrade(event: any): Promise<void> {
    console.log('🎯 Triggering test trade...');
    this.stats.tradesTriggered++;

    try {
      const tradeParams = {
        inputMint: this.config.testTokens.input,
        outputMint: this.config.testTokens.output,
        amount: '100000', // Very small amount
        slippageBps: 100, // 1% slippage
        dryRun: this.config.dryRun,
        mode: 'simple',
        idempotencyKey: `e2e_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      const result = await this.router.trade(tradeParams);
      
      if (result.success) {
        console.log('✅ Test trade successful');
        this.emit('testTradeCompleted', { event, result });
      } else {
        console.error('❌ Test trade failed:', result.error);
        this.emit('testTradeFailed', { event, result });
      }

    } catch (error) {
      console.error('❌ Test trade error:', error);
      this.stats.errors++;
      this.emit('error', error);
    }
  }

  /**
   * Get integration statistics
   */
  getStats(): any {
    const streamStats = this.streamingService.getStats();
    const routerStats = this.router.getStats();

    return {
      integration: this.stats,
      streaming: streamStats,
      router: routerStats,
      uptime: Date.now() - (streamStats.lastConnected || Date.now())
    };
  }

  /**
   * Run integration for a specified duration
   */
  async runForDuration(durationMs: number): Promise<void> {
    console.log(`⏱️ Running E2E integration for ${durationMs / 1000} seconds...`);

    await this.start();

    // Progress reporting
    const reportInterval = setInterval(() => {
      const stats = this.getStats();
      console.log('📊 E2E Stats:', JSON.stringify(stats.integration, null, 2));
    }, 30000); // Every 30 seconds

    // Wait for duration
    await new Promise(resolve => setTimeout(resolve, durationMs));

    clearInterval(reportInterval);
    await this.stop();

    // Final report
    const finalStats = this.getStats();
    console.log('📋 Final E2E Integration Report:');
    console.log(JSON.stringify(finalStats, null, 2));
  }
}

/**
 * Example usage
 */
async function runE2EExample() {
  const config: E2EConfig = {
    yellowstoneEndpoint: process.env.YELLOWSTONE_ENDPOINT || 'grpc.triton.one:443',
    executorPath: './exec-rs/target/release/exec-rs',
    programs: [
      '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium
    ],
    testTokens: {
      input: 'So11111111111111111111111111111111111111112', // WSOL
      output: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // USDC
    },
    dryRun: true // Always use dry run for safety
  };

  const integration = new E2EIntegration(config);

  // Set up event listeners
  integration.on('started', () => {
    console.log('🎉 E2E integration started');
  });

  integration.on('newPoolProcessed', (event) => {
    console.log(`📝 Processed new pool: ${event.poolAddress}`);
  });

  integration.on('testTradeCompleted', ({ event, result }) => {
    console.log(`💰 Test trade completed: ${result.signature || 'simulated'}`);
  });

  integration.on('error', (error) => {
    console.error('🚨 Integration error:', error);
  });

  try {
    // Run for 5 minutes
    await integration.runForDuration(5 * 60 * 1000);
    
    console.log('✅ E2E integration completed successfully');

  } catch (error) {
    console.error('❌ E2E integration failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  runE2EExample().catch(console.error);
}

export { E2EIntegration };
