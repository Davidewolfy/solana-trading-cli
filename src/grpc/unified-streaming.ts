import { EventEmitter } from 'events';
import { YellowstoneClient, createYellowstoneClient } from './client';
import { StreamConfig, StreamEvent, DEFAULT_STREAM_CONFIG } from './types';

/**
 * Unified Streaming Service
 * High-level service for processing Solana streaming data with DEX detection
 */

export interface ProcessedEvent {
  type: 'newPool' | 'liquidityUpdate' | 'dexTx' | 'priceUpdate';
  dex: string;
  tokenAddress?: string;
  poolAddress?: string;
  data: any;
  timestamp: number;
  slot: number;
}

export interface StreamingStats {
  connected: boolean;
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsByDex: Record<string, number>;
  lastEventTime?: number;
  uptime: number;
}

export class UnifiedStreamingService extends EventEmitter {
  private client: YellowstoneClient;
  private config: StreamConfig;
  private stats: StreamingStats;
  private programToDeX: Map<string, string> = new Map();

  constructor(config: Partial<StreamConfig> = {}) {
    super();
    this.config = { ...DEFAULT_STREAM_CONFIG, ...config };
    this.client = createYellowstoneClient(this.config);
    
    this.stats = {
      connected: false,
      totalEvents: 0,
      eventsByType: {},
      eventsByDex: {},
      lastEventTime: undefined,
      uptime: 0
    };

    this.initializeProgramMapping();
    this.setupEventHandlers();
  }

  /**
   * Start streaming service
   */
  async start(): Promise<void> {
    console.log('🚀 Starting unified streaming service');
    
    try {
      await this.client.connect();
      this.stats.connected = true;
      
      console.log('✅ Unified streaming service started successfully');
      this.emit('started');
      
    } catch (error) {
      console.error('❌ Failed to start unified streaming service:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Stop streaming service
   */
  async stop(): Promise<void> {
    console.log('🛑 Stopping unified streaming service');
    
    try {
      await this.client.disconnect();
      this.stats.connected = false;
      
      console.log('✅ Unified streaming service stopped');
      this.emit('stopped');
      
    } catch (error) {
      console.error('❌ Error stopping unified streaming service:', error);
      this.emit('error', error);
    }
  }

  /**
   * Get streaming statistics
   */
  getStats(): StreamingStats {
    const clientStats = this.client.getStats();
    return {
      ...this.stats,
      connected: clientStats.connected,
      uptime: clientStats.uptime
    };
  }

  /**
   * Check if service is connected
   */
  isConnected(): boolean {
    return this.client.isConnected();
  }

  private initializeProgramMapping(): void {
    // Map program IDs to DEX names
    this.programToDeX.set('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', 'raydium');
    this.programToDeX.set('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', 'orca');
    this.programToDeX.set('LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo', 'meteora');
    this.programToDeX.set('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', 'pump_fun');
  }

  private setupEventHandlers(): void {
    // Handle raw client events
    this.client.on('connected', () => {
      this.stats.connected = true;
      this.emit('connected');
    });

    this.client.on('disconnected', () => {
      this.stats.connected = false;
      this.emit('disconnected');
    });

    this.client.on('error', (error) => {
      this.emit('error', error);
    });

    // Process account updates
    this.client.on('account', (event: StreamEvent) => {
      this.processAccountUpdate(event);
    });

    // Process transaction updates
    this.client.on('transaction', (event: StreamEvent) => {
      this.processTransactionUpdate(event);
    });

    // Process slot updates
    this.client.on('slot', (event: StreamEvent) => {
      this.processSlotUpdate(event);
    });
  }

  private processAccountUpdate(event: StreamEvent): void {
    try {
      const { data } = event;
      const dex = this.getDexFromOwner(data.owner);
      
      if (!dex) return; // Not a DEX we're interested in

      this.updateStats('account', dex);

      // Detect new pools based on account creation
      if (this.isNewPoolAccount(data)) {
        const processedEvent: ProcessedEvent = {
          type: 'newPool',
          dex,
          poolAddress: data.pubkey,
          tokenAddress: this.extractTokenFromPoolData(data.data),
          data: {
            lamports: data.lamports,
            slot: data.slot,
            writeVersion: data.writeVersion
          },
          timestamp: event.timestamp,
          slot: data.slot
        };

        console.log(`🆕 New pool detected: ${dex} - ${processedEvent.poolAddress}`);
        this.emit('newPool', processedEvent);
        this.emit('processedEvent', processedEvent);
      }

      // Detect liquidity updates
      if (this.isLiquidityUpdate(data)) {
        const processedEvent: ProcessedEvent = {
          type: 'liquidityUpdate',
          dex,
          poolAddress: data.pubkey,
          data: {
            lamports: data.lamports,
            liquidityChange: this.calculateLiquidityChange(data),
            slot: data.slot
          },
          timestamp: event.timestamp,
          slot: data.slot
        };

        this.emit('liquidityUpdate', processedEvent);
        this.emit('processedEvent', processedEvent);
      }

    } catch (error) {
      console.error('Error processing account update:', error);
    }
  }

  private processTransactionUpdate(event: StreamEvent): void {
    try {
      const { data } = event;
      
      if (data.isVote) return; // Skip vote transactions

      // Extract DEX from transaction accounts
      const dex = this.getDexFromTransaction(data.transaction);
      if (!dex) return;

      this.updateStats('transaction', dex);

      const processedEvent: ProcessedEvent = {
        type: 'dexTx',
        dex,
        data: {
          signature: data.signature,
          slot: data.slot,
          meta: data.meta,
          accounts: this.extractRelevantAccounts(data.transaction),
          instructions: this.extractInstructions(data.transaction)
        },
        timestamp: event.timestamp,
        slot: data.slot
      };

      console.log(`💱 DEX transaction: ${dex} - ${data.signature}`);
      this.emit('dexTx', processedEvent);
      this.emit('processedEvent', processedEvent);

    } catch (error) {
      console.error('Error processing transaction update:', error);
    }
  }

  private processSlotUpdate(event: StreamEvent): void {
    try {
      // Slot updates help with timing and ordering
      this.emit('slot', event);
    } catch (error) {
      console.error('Error processing slot update:', error);
    }
  }

  private getDexFromOwner(owner: string): string | null {
    return this.programToDeX.get(owner) || null;
  }

  private getDexFromTransaction(transaction: any): string | null {
    // Extract program IDs from transaction and map to DEX
    if (!transaction?.message?.accountKeys) return null;

    for (const account of transaction.message.accountKeys) {
      const dex = this.programToDeX.get(account);
      if (dex) return dex;
    }

    return null;
  }

  private isNewPoolAccount(data: any): boolean {
    // Simplified logic - in reality you'd parse the account data
    // to determine if it's a new pool
    return data.lamports > 0 && data.writeVersion === 1;
  }

  private isLiquidityUpdate(data: any): boolean {
    // Simplified logic - detect significant lamport changes
    return data.lamports > 1000000; // > 0.001 SOL
  }

  private extractTokenFromPoolData(data: Uint8Array): string | undefined {
    // Simplified - in reality you'd parse the pool account data
    // to extract token mint addresses
    return undefined;
  }

  private calculateLiquidityChange(data: any): number {
    // Simplified - calculate liquidity change based on lamport difference
    return data.lamports;
  }

  private extractRelevantAccounts(transaction: any): string[] {
    // Extract accounts relevant to DEX operations
    return transaction?.message?.accountKeys?.slice(0, 5) || [];
  }

  private extractInstructions(transaction: any): any[] {
    // Extract and parse instructions
    return transaction?.message?.instructions || [];
  }

  private updateStats(eventType: string, dex: string): void {
    this.stats.totalEvents++;
    this.stats.lastEventTime = Date.now();
    
    if (!this.stats.eventsByType[eventType]) {
      this.stats.eventsByType[eventType] = 0;
    }
    this.stats.eventsByType[eventType]++;
    
    if (!this.stats.eventsByDex[dex]) {
      this.stats.eventsByDex[dex] = 0;
    }
    this.stats.eventsByDex[dex]++;
  }
}

/**
 * Factory function to create unified streaming service
 */
export function createUnifiedStreamingService(config?: Partial<StreamConfig>): UnifiedStreamingService {
  return new UnifiedStreamingService(config);
}
