import { EventEmitter } from 'events';
import { PublicKey } from '@solana/web3.js';

/**
 * Market data event types
 */
export enum MarketEventType {
  NEW_POOL = 'new_pool',
  PRICE_UPDATE = 'price_update',
  VOLUME_UPDATE = 'volume_update',
  LIQUIDITY_UPDATE = 'liquidity_update',
  TRADE_EXECUTED = 'trade_executed',
  ERROR = 'error'
}

/**
 * DEX types for streaming
 */
export enum StreamingDEX {
  RAYDIUM = 'raydium',
  ORCA = 'orca',
  METEORA = 'meteora',
  PUMP_FUN = 'pump_fun',
  CPMM = 'cpmm'
}

/**
 * Market data structure
 */
export interface MarketData {
  eventType: MarketEventType;
  dex: StreamingDEX;
  tokenAddress: string;
  poolAddress?: string;
  timestamp: number;
  data: any;
}

/**
 * New pool event data
 */
export interface NewPoolData {
  tokenAddress: string;
  poolAddress: string;
  baseToken: string;
  quoteToken: string;
  initialPrice: number;
  initialLiquidity: number;
  dex: StreamingDEX;
}

/**
 * Price update event data
 */
export interface PriceUpdateData {
  tokenAddress: string;
  poolAddress: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  dex: StreamingDEX;
}

/**
 * Trade event data
 */
export interface TradeEventData {
  tokenAddress: string;
  poolAddress: string;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  trader: string;
  signature: string;
  dex: StreamingDEX;
}

/**
 * Streaming configuration
 */
export interface StreamingConfig {
  /** gRPC endpoint */
  grpcEndpoint: string;
  /** Authentication token */
  authToken?: string;
  /** DEXs to monitor */
  dexes: StreamingDEX[];
  /** Specific tokens to monitor (empty = all) */
  tokenFilters?: string[];
  /** Minimum volume threshold */
  minVolumeThreshold?: number;
  /** Minimum liquidity threshold */
  minLiquidityThreshold?: number;
  /** Enable automatic reconnection */
  autoReconnect?: boolean;
  /** Reconnection interval in ms */
  reconnectInterval?: number;
}

/**
 * Streaming service for real-time market data
 */
export class StreamingService extends EventEmitter {
  private config: StreamingConfig;
  private connections: Map<StreamingDEX, any> = new Map();
  private isRunning: boolean = false;
  private reconnectTimers: Map<StreamingDEX, NodeJS.Timeout> = new Map();

  constructor(config: StreamingConfig) {
    super();
    this.config = {
      autoReconnect: true,
      reconnectInterval: 5000,
      ...config
    };
  }

  /**
   * Start streaming from all configured DEXs
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Streaming service is already running');
    }

    this.isRunning = true;
    console.log('Starting streaming service...');

    for (const dex of this.config.dexes) {
      try {
        await this.startDEXStream(dex);
      } catch (error) {
        console.error(`Failed to start ${dex} stream:`, error);
        this.emit('error', { dex, error });
      }
    }
  }

  /**
   * Stop all streaming connections
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    console.log('Stopping streaming service...');

    // Clear reconnect timers
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    // Close all connections
    for (const [dex, connection] of this.connections) {
      try {
        if (connection && typeof connection.close === 'function') {
          await connection.close();
        }
      } catch (error) {
        console.error(`Error closing ${dex} connection:`, error);
      }
    }
    this.connections.clear();
  }

  /**
   * Start streaming for a specific DEX
   */
  private async startDEXStream(dex: StreamingDEX): Promise<void> {
    switch (dex) {
      case StreamingDEX.RAYDIUM:
        await this.startRaydiumStream();
        break;
      case StreamingDEX.ORCA:
        await this.startOrcaStream();
        break;
      case StreamingDEX.METEORA:
        await this.startMeteoraStream();
        break;
      case StreamingDEX.PUMP_FUN:
        await this.startPumpFunStream();
        break;
      case StreamingDEX.CPMM:
        await this.startCPMMStream();
        break;
      default:
        throw new Error(`Unsupported DEX: ${dex}`);
    }
  }

  /**
   * Start Raydium streaming
   */
  private async startRaydiumStream(): Promise<void> {
    try {
      // Import Raydium streaming module
      const { startRaydiumSniper } = await import('../grpc_streaming_dev/grpc-raydium-sniper/src/streaming/raydium');
      
      const connection = await startRaydiumSniper({
        onNewPool: (data: any) => this.handleNewPool(StreamingDEX.RAYDIUM, data),
        onPriceUpdate: (data: any) => this.handlePriceUpdate(StreamingDEX.RAYDIUM, data),
        onTrade: (data: any) => this.handleTrade(StreamingDEX.RAYDIUM, data),
        onError: (error: any) => this.handleError(StreamingDEX.RAYDIUM, error)
      });

      this.connections.set(StreamingDEX.RAYDIUM, connection);
      console.log('Raydium streaming started');

    } catch (error) {
      console.error('Failed to start Raydium stream:', error);
      if (this.config.autoReconnect) {
        this.scheduleReconnect(StreamingDEX.RAYDIUM);
      }
      throw error;
    }
  }

  /**
   * Start Orca streaming
   */
  private async startOrcaStream(): Promise<void> {
    // Similar implementation for Orca
    console.log('Orca streaming started (placeholder)');
  }

  /**
   * Start Meteora streaming
   */
  private async startMeteoraStream(): Promise<void> {
    // Similar implementation for Meteora
    console.log('Meteora streaming started (placeholder)');
  }

  /**
   * Start Pump.fun streaming
   */
  private async startPumpFunStream(): Promise<void> {
    try {
      // Import Pump.fun streaming module
      const { startPumpFunSniper } = await import('../grpc_streaming_dev/grpc-pf-sniper/src');
      
      const connection = await startPumpFunSniper({
        onNewToken: (data: any) => this.handleNewPool(StreamingDEX.PUMP_FUN, data),
        onTrade: (data: any) => this.handleTrade(StreamingDEX.PUMP_FUN, data),
        onError: (error: any) => this.handleError(StreamingDEX.PUMP_FUN, error)
      });

      this.connections.set(StreamingDEX.PUMP_FUN, connection);
      console.log('Pump.fun streaming started');

    } catch (error) {
      console.error('Failed to start Pump.fun stream:', error);
      if (this.config.autoReconnect) {
        this.scheduleReconnect(StreamingDEX.PUMP_FUN);
      }
      throw error;
    }
  }

  /**
   * Start CPMM streaming
   */
  private async startCPMMStream(): Promise<void> {
    try {
      // Import CPMM streaming module
      const { startCPMMSniper } = await import('../grpc_streaming_dev/grpc-cpmm-sniper');
      
      const connection = await startCPMMSniper({
        onNewPool: (data: any) => this.handleNewPool(StreamingDEX.CPMM, data),
        onTrade: (data: any) => this.handleTrade(StreamingDEX.CPMM, data),
        onError: (error: any) => this.handleError(StreamingDEX.CPMM, error)
      });

      this.connections.set(StreamingDEX.CPMM, connection);
      console.log('CPMM streaming started');

    } catch (error) {
      console.error('Failed to start CPMM stream:', error);
      if (this.config.autoReconnect) {
        this.scheduleReconnect(StreamingDEX.CPMM);
      }
      throw error;
    }
  }

  /**
   * Handle new pool events
   */
  private handleNewPool(dex: StreamingDEX, data: any): void {
    const marketData: MarketData = {
      eventType: MarketEventType.NEW_POOL,
      dex,
      tokenAddress: data.tokenAddress || data.mint,
      poolAddress: data.poolAddress || data.pool,
      timestamp: Date.now(),
      data
    };

    // Apply filters
    if (this.shouldProcessEvent(marketData)) {
      this.emit('marketData', marketData);
      this.emit('newPool', marketData);
    }
  }

  /**
   * Handle price update events
   */
  private handlePriceUpdate(dex: StreamingDEX, data: any): void {
    const marketData: MarketData = {
      eventType: MarketEventType.PRICE_UPDATE,
      dex,
      tokenAddress: data.tokenAddress || data.mint,
      poolAddress: data.poolAddress || data.pool,
      timestamp: Date.now(),
      data
    };

    if (this.shouldProcessEvent(marketData)) {
      this.emit('marketData', marketData);
      this.emit('priceUpdate', marketData);
    }
  }

  /**
   * Handle trade events
   */
  private handleTrade(dex: StreamingDEX, data: any): void {
    const marketData: MarketData = {
      eventType: MarketEventType.TRADE_EXECUTED,
      dex,
      tokenAddress: data.tokenAddress || data.mint,
      poolAddress: data.poolAddress || data.pool,
      timestamp: Date.now(),
      data
    };

    if (this.shouldProcessEvent(marketData)) {
      this.emit('marketData', marketData);
      this.emit('trade', marketData);
    }
  }

  /**
   * Handle error events
   */
  private handleError(dex: StreamingDEX, error: any): void {
    console.error(`${dex} streaming error:`, error);
    this.emit('error', { dex, error });

    if (this.config.autoReconnect) {
      this.scheduleReconnect(dex);
    }
  }

  /**
   * Schedule reconnection for a DEX
   */
  private scheduleReconnect(dex: StreamingDEX): void {
    if (this.reconnectTimers.has(dex)) {
      return; // Already scheduled
    }

    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(dex);
      if (this.isRunning) {
        try {
          await this.startDEXStream(dex);
        } catch (error) {
          console.error(`Reconnection failed for ${dex}:`, error);
          this.scheduleReconnect(dex);
        }
      }
    }, this.config.reconnectInterval);

    this.reconnectTimers.set(dex, timer);
  }

  /**
   * Check if event should be processed based on filters
   */
  private shouldProcessEvent(marketData: MarketData): boolean {
    // Token filter
    if (this.config.tokenFilters && this.config.tokenFilters.length > 0) {
      if (!this.config.tokenFilters.includes(marketData.tokenAddress)) {
        return false;
      }
    }

    // Volume filter
    if (this.config.minVolumeThreshold && marketData.data.volume) {
      if (marketData.data.volume < this.config.minVolumeThreshold) {
        return false;
      }
    }

    // Liquidity filter
    if (this.config.minLiquidityThreshold && marketData.data.liquidity) {
      if (marketData.data.liquidity < this.config.minLiquidityThreshold) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get connection status for all DEXs
   */
  getConnectionStatus(): Record<StreamingDEX, boolean> {
    const status: Record<StreamingDEX, boolean> = {} as any;
    
    for (const dex of this.config.dexes) {
      status[dex] = this.connections.has(dex);
    }

    return status;
  }

  /**
   * Check if service is running
   */
  isServiceRunning(): boolean {
    return this.isRunning;
  }
}

/**
 * Factory function to create streaming service
 */
export function createStreamingService(config: StreamingConfig): StreamingService {
  return new StreamingService(config);
}

/**
 * Default streaming configuration
 */
export const DEFAULT_STREAMING_CONFIG: Partial<StreamingConfig> = {
  dexes: [StreamingDEX.RAYDIUM, StreamingDEX.PUMP_FUN],
  autoReconnect: true,
  reconnectInterval: 5000,
  minVolumeThreshold: 1000, // $1000 minimum volume
  minLiquidityThreshold: 5000 // $5000 minimum liquidity
};
