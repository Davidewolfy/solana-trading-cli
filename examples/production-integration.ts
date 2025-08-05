import { Connection, Keypair } from '@solana/web3.js';
import { 
  createYellowstoneClient, 
  createDataAggregator,
  DEFAULT_VALIDATION_CONFIG 
} from '../src/data';
import { AdvancedRouter, DEFAULT_ADVANCED_CONFIG } from '../src/router/advanced-router';
import { 
  createJupiterAdapter, 
  createRaydiumAdapter, 
  createOrcaAdapter, 
  createMeteoraAdapter 
} from '../src/router/adapters';
import { AccountManager, DEFAULT_ACCOUNT_CONFIG } from '../src/execution';
import { 
  CircuitBreakerManager, 
  RetryManagerFactory, 
  QueueManager,
  DEFAULT_CIRCUIT_CONFIGS,
  DEFAULT_RETRY_CONFIGS,
  DEFAULT_QUEUE_CONFIG 
} from '../src/reliability';
import { 
  RiskManager, 
  TokenValidator, 
  KeyManager,
  DEFAULT_RISK_LIMITS,
  DEFAULT_KEY_CONFIGS 
} from '../src/risk';
import { 
  logger, 
  metricsCollector, 
  tradingMetrics, 
  healthChecker 
} from '../src/observability';

/**
 * Production Integration Example
 * 
 * This example demonstrates how to integrate all components
 * for a production-ready trading system
 */

export class ProductionTradingSystem {
  private connection: Connection;
  private dataAggregator: any;
  private router: AdvancedRouter;
  private accountManager: AccountManager;
  private circuitBreakers: CircuitBreakerManager;
  private queueManager: QueueManager;
  private riskManager: RiskManager;
  private tokenValidator: TokenValidator;
  private keyManager: KeyManager;
  private yellowstoneClient: any;

  constructor(config: {
    rpcEndpoint: string;
    yellowstoneEndpoint: string;
    redisConfig?: { host: string; port: number; password?: string };
    keyStorePath: string;
    encryptionPassword: string;
  }) {
    this.connection = new Connection(config.rpcEndpoint);
    
    // Initialize all components
    this.initializeComponents(config);
  }

  private async initializeComponents(config: any): Promise<void> {
    logger.info('🚀 Initializing production trading system');

    // 1. Data Layer
    this.dataAggregator = createDataAggregator(config.redisConfig);
    
    this.yellowstoneClient = createYellowstoneClient({
      endpoint: config.yellowstoneEndpoint,
      subscriptions: {
        programs: [
          '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium
          'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',  // Orca
          'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo'   // Meteora
        ],
        transactions: true,
        slots: true
      },
      redis: config.redisConfig
    });

    // 2. Reliability Layer
    this.circuitBreakers = new CircuitBreakerManager();
    this.circuitBreakers.createBreaker('rpc', DEFAULT_CIRCUIT_CONFIGS.rpc);
    this.circuitBreakers.createBreaker('jupiter', DEFAULT_CIRCUIT_CONFIGS.jupiter);
    this.circuitBreakers.createBreaker('dex', DEFAULT_CIRCUIT_CONFIGS.dex);

    this.queueManager = new (class extends QueueManager {
      protected async executeTask(task: any): Promise<any> {
        return await this.executeTradingTask(task);
      }
      
      private async executeTradingTask(task: any): Promise<any> {
        // Implementation would go here
        logger.info('Executing trading task', { taskId: task.id, type: task.type });
        return { success: true };
      }
    })(DEFAULT_QUEUE_CONFIG);

    // 3. Risk Management
    this.riskManager = new RiskManager(DEFAULT_RISK_LIMITS);
    this.tokenValidator = new TokenValidator(this.connection);
    this.keyManager = new KeyManager(config.encryptionPassword, config.keyStorePath);

    // 4. Execution Layer
    const masterWallet = Keypair.generate(); // In production, load from secure storage
    this.accountManager = new AccountManager(this.connection, masterWallet);

    // 5. Advanced Router
    this.router = new AdvancedRouter(
      this.connection,
      this.dataAggregator,
      DEFAULT_ADVANCED_CONFIG.feeConfig,
      DEFAULT_ADVANCED_CONFIG.idempotencyConfig
    );

    // Register adapters
    this.router.registerAdapter(createJupiterAdapter());
    this.router.registerAdapter(createRaydiumAdapter());
    this.router.registerAdapter(createOrcaAdapter());
    this.router.registerAdapter(createMeteoraAdapter());

    logger.info('✅ All components initialized successfully');
  }

  /**
   * Start the trading system
   */
  async start(): Promise<void> {
    logger.info('🚀 Starting production trading system');

    try {
      // Start data streams
      await this.yellowstoneClient.connect();
      
      // Start queue processing
      this.queueManager.start();
      
      // Setup event handlers
      this.setupEventHandlers();
      
      // Register health checks
      this.registerHealthChecks();
      
      logger.info('✅ Trading system started successfully');
      
    } catch (error) {
      logger.error('❌ Failed to start trading system', error as Error);
      throw error;
    }
  }

  /**
   * Execute a trade with full production safeguards
   */
  async executeTrade(params: {
    tokenAddress: string;
    side: 'buy' | 'sell';
    amount: number;
    maxSlippage?: number;
    accountId?: string;
  }): Promise<any> {
    const traceId = logger.generateTraceId();
    
    return await logger.time('trade_execution', async () => {
      // 1. Risk checks
      const riskCheck = await this.riskManager.checkTradeAllowed({
        tokenAddress: params.tokenAddress,
        side: params.side,
        amount: params.amount,
        estimatedValue: params.amount * 100, // Simplified
        slippage: params.maxSlippage || 1,
        dex: 'auto'
      });

      if (!riskCheck.allowed) {
        throw new Error(`Trade blocked by risk management: ${riskCheck.violations.map(v => v.message).join(', ')}`);
      }

      // 2. Token validation
      const tokenValidation = await this.tokenValidator.validateToken(params.tokenAddress);
      if (!tokenValidation.isValid) {
        throw new Error(`Token validation failed: ${tokenValidation.errors.join(', ')}`);
      }

      // 3. Account preparation
      const accountId = params.accountId || 'default';
      await this.accountManager.prepareAccountForTrading(accountId, params.tokenAddress);

      // 4. Execute through advanced router with circuit breaker
      const jupiterBreaker = this.circuitBreakers.getBreaker('jupiter');
      
      const result = await jupiterBreaker!.execute(async () => {
        return await this.router.executeTradeWithRouting({
          tokenAddress: params.tokenAddress,
          side: params.side === 'buy' ? 'buy' as any : 'sell' as any,
          solAmount: params.side === 'buy' ? params.amount : undefined,
          tokenAmount: params.side === 'sell' ? params.amount : undefined,
          slippage: params.maxSlippage,
          traceId
        });
      });

      // 5. Record trade for risk tracking
      this.riskManager.recordTrade({
        tokenAddress: params.tokenAddress,
        side: params.side,
        amount: params.amount,
        value: params.amount * 100, // Simplified
        dex: result.dexUsed || 'unknown'
      });

      // 6. Record metrics
      tradingMetrics.recordTrade({
        dex: result.dexUsed || 'unknown',
        side: params.side,
        duration: Date.now() - (result.timestamp || Date.now()),
        success: result.success,
        slippage: result.actualSlippage,
        amount: params.amount
      });

      return result;
    }, { traceId, operation: 'trade_execution' });
  }

  /**
   * Get system status
   */
  getSystemStatus(): any {
    return {
      health: healthChecker.getSystemHealth(),
      metrics: tradingMetrics.getTradingMetrics(),
      risk: this.riskManager.getRiskStatus(),
      queue: this.queueManager.getStats(),
      circuitBreakers: this.circuitBreakers.getAllStats(),
      accounts: this.accountManager.getAccountStatus(),
      yellowstone: this.yellowstoneClient.getConnectionStats()
    };
  }

  private setupEventHandlers(): void {
    // Risk management events
    this.riskManager.on('killSwitchActivated', (event) => {
      logger.error('🚨 KILL SWITCH ACTIVATED', undefined, { 
        reason: event.reason, 
        message: event.message 
      });
      
      // Stop all trading activities
      this.queueManager.stop();
    });

    // Circuit breaker events
    this.circuitBreakers.on('circuitOpened', (event) => {
      logger.warn('⚠️ Circuit breaker opened', { 
        service: event.name, 
        failures: event.failures 
      });
    });

    // Yellowstone events
    this.yellowstoneClient.on('newPool', (data: any) => {
      logger.info('🆕 New pool detected', { 
        dex: data.dex, 
        token: data.tokenAddress 
      });
    });

    // Queue events
    this.queueManager.on('taskFailed', (task) => {
      logger.error('❌ Task failed', undefined, { 
        taskId: task.id, 
        error: task.error 
      });
    });
  }

  private registerHealthChecks(): void {
    // Register custom health checks
    healthChecker.registerCheck({
      name: 'trading_system',
      check: async () => {
        const riskStatus = this.riskManager.getRiskStatus();
        const healthy = !riskStatus.killSwitchActive;
        
        return {
          healthy,
          message: healthy ? 'Trading system operational' : 'Kill switch active',
          details: { killSwitch: riskStatus.killSwitchActive },
          responseTime: 0,
          timestamp: 0
        };
      },
      timeout: 2000,
      interval: 30000,
      critical: true
    });

    healthChecker.registerCheck({
      name: 'yellowstone_connection',
      check: async () => {
        const connected = this.yellowstoneClient.isClientConnected();
        
        return {
          healthy: connected,
          message: connected ? 'Yellowstone connected' : 'Yellowstone disconnected',
          responseTime: 0,
          timestamp: 0
        };
      },
      timeout: 3000,
      interval: 60000,
      critical: true
    });
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('🛑 Shutting down trading system');

    try {
      // Stop queue processing
      await this.queueManager.stop();
      
      // Disconnect data streams
      await this.yellowstoneClient.disconnect();
      
      // Cleanup components
      this.riskManager.cleanup();
      this.keyManager.cleanup();
      this.accountManager.cleanup();
      metricsCollector.cleanup();
      healthChecker.stop();
      
      logger.info('✅ Trading system shutdown complete');
      
    } catch (error) {
      logger.error('❌ Error during shutdown', error as Error);
    }
  }
}

/**
 * Example usage
 */
async function main() {
  const system = new ProductionTradingSystem({
    rpcEndpoint: process.env.MAINNET_ENDPOINT || 'https://api.mainnet-beta.solana.com',
    yellowstoneEndpoint: process.env.YELLOWSTONE_ENDPOINT || 'grpc.triton.one:443',
    redisConfig: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    },
    keyStorePath: process.env.KEY_STORE_PATH || './keys',
    encryptionPassword: process.env.ENCRYPTION_PASSWORD || 'change-me-in-production'
  });

  try {
    await system.start();
    
    // Example trade
    const result = await system.executeTrade({
      tokenAddress: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
      side: 'buy',
      amount: 0.1,
      maxSlippage: 1
    });
    
    console.log('Trade result:', result);
    
    // Get system status
    const status = system.getSystemStatus();
    console.log('System status:', JSON.stringify(status, null, 2));
    
  } catch (error) {
    console.error('System error:', error);
  } finally {
    await system.shutdown();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { ProductionTradingSystem };
