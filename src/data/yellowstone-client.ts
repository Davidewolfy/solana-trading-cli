import { EventEmitter } from 'events';
import { PublicKey } from '@solana/web3.js';
import { Client as YellowstoneClient, SubscribeRequest, SubscribeUpdate } from '@triton-one/yellowstone-grpc';
import Redis from 'ioredis';

/**
 * Yellowstone gRPC client for low-latency on-chain data streaming
 */

export interface YellowstoneConfig {
  endpoint: string;
  token?: string;
  redis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  subscriptions: {
    accounts?: string[];
    programs?: string[];
    transactions?: boolean;
    slots?: boolean;
  };
  bufferSize?: number;
  reconnectInterval?: number;
}

export interface AccountUpdate {
  pubkey: string;
  account: {
    lamports: number;
    data: Buffer;
    owner: string;
    executable: boolean;
    rentEpoch: number;
  };
  slot: number;
  writeVersion: number;
}

export interface TransactionUpdate {
  signature: string;
  slot: number;
  transaction: any;
  meta: any;
}

export interface SlotUpdate {
  slot: number;
  parent: number;
  status: 'processed' | 'confirmed' | 'finalized';
}

export class YellowstoneDataClient extends EventEmitter {
  private client: YellowstoneClient;
  private redis?: Redis;
  private config: YellowstoneConfig;
  private subscriptions: Map<string, any> = new Map();
  private isConnected: boolean = false;
  private reconnectTimer?: NodeJS.Timeout;
  private buffer: Map<string, any[]> = new Map();

  constructor(config: YellowstoneConfig) {
    super();
    this.config = config;
    this.client = new YellowstoneClient(config.endpoint, undefined, {
      'grpc.keepalive_time_ms': 30000,
      'grpc.keepalive_timeout_ms': 5000,
      'grpc.keepalive_permit_without_calls': true,
      'grpc.http2.max_pings_without_data': 0,
    });

    if (config.redis) {
      this.redis = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db || 0,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true
      });
    }

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('error', (error) => {
      console.error('Yellowstone client error:', error);
      this.emit('error', error);
      this.handleReconnect();
    });

    this.client.on('close', () => {
      console.log('Yellowstone connection closed');
      this.isConnected = false;
      this.handleReconnect();
    });
  }

  async connect(): Promise<void> {
    try {
      if (this.redis) {
        await this.redis.connect();
        console.log('✅ Redis connected');
      }

      await this.setupSubscriptions();
      this.isConnected = true;
      console.log('✅ Yellowstone client connected');
      this.emit('connected');

    } catch (error) {
      console.error('❌ Failed to connect Yellowstone client:', error);
      throw error;
    }
  }

  private async setupSubscriptions(): Promise<void> {
    const request: SubscribeRequest = {
      accounts: {},
      slots: {},
      transactions: {},
      transactionsStatus: {},
      blocks: {},
      blocksMeta: {},
      entry: {},
      commitment: 1, // Confirmed
      accountsDataSlice: [],
      ping: undefined
    };

    // Subscribe to accounts
    if (this.config.subscriptions.accounts) {
      for (const account of this.config.subscriptions.accounts) {
        request.accounts[`account_${account}`] = {
          account: [account],
          owner: [],
          filters: []
        };
      }
    }

    // Subscribe to programs
    if (this.config.subscriptions.programs) {
      for (const program of this.config.subscriptions.programs) {
        request.accounts[`program_${program}`] = {
          account: [],
          owner: [program],
          filters: []
        };
      }
    }

    // Subscribe to slots
    if (this.config.subscriptions.slots) {
      request.slots['slots'] = {};
    }

    // Subscribe to transactions
    if (this.config.subscriptions.transactions) {
      request.transactions['transactions'] = {
        vote: false,
        failed: false,
        signature: undefined,
        accountInclude: [],
        accountExclude: [],
        accountRequired: []
      };
    }

    const stream = await this.client.subscribe();
    
    stream.on('data', (update: SubscribeUpdate) => {
      this.handleUpdate(update);
    });

    stream.on('error', (error) => {
      console.error('Yellowstone stream error:', error);
      this.emit('error', error);
    });

    stream.on('end', () => {
      console.log('Yellowstone stream ended');
      this.isConnected = false;
      this.handleReconnect();
    });

    await stream.write(request);
    console.log('📡 Yellowstone subscriptions established');
  }

  private handleUpdate(update: SubscribeUpdate): void {
    try {
      // Handle account updates
      if (update.account) {
        const accountUpdate: AccountUpdate = {
          pubkey: update.account.account?.pubkey || '',
          account: {
            lamports: Number(update.account.account?.lamports || 0),
            data: Buffer.from(update.account.account?.data || []),
            owner: update.account.account?.owner || '',
            executable: update.account.account?.executable || false,
            rentEpoch: Number(update.account.account?.rentEpoch || 0)
          },
          slot: Number(update.account.slot || 0),
          writeVersion: Number(update.account.writeVersion || 0)
        };

        this.bufferUpdate('account', accountUpdate);
        this.emit('account', accountUpdate);
        this.cacheUpdate('account', accountUpdate.pubkey, accountUpdate);
      }

      // Handle transaction updates
      if (update.transaction) {
        const txUpdate: TransactionUpdate = {
          signature: update.transaction.transaction?.signature || '',
          slot: Number(update.transaction.slot || 0),
          transaction: update.transaction.transaction,
          meta: update.transaction.meta
        };

        this.bufferUpdate('transaction', txUpdate);
        this.emit('transaction', txUpdate);
        this.cacheUpdate('transaction', txUpdate.signature, txUpdate);
      }

      // Handle slot updates
      if (update.slot) {
        const slotUpdate: SlotUpdate = {
          slot: Number(update.slot.slot || 0),
          parent: Number(update.slot.parent || 0),
          status: update.slot.status as any || 'processed'
        };

        this.emit('slot', slotUpdate);
        this.cacheUpdate('slot', slotUpdate.slot.toString(), slotUpdate);
      }

    } catch (error) {
      console.error('Error handling Yellowstone update:', error);
      this.emit('error', error);
    }
  }

  private bufferUpdate(type: string, update: any): void {
    const bufferSize = this.config.bufferSize || 1000;
    
    if (!this.buffer.has(type)) {
      this.buffer.set(type, []);
    }

    const buffer = this.buffer.get(type)!;
    buffer.push({
      ...update,
      timestamp: Date.now()
    });

    // Keep buffer size under limit
    if (buffer.length > bufferSize) {
      buffer.splice(0, buffer.length - bufferSize);
    }
  }

  private async cacheUpdate(type: string, key: string, data: any): Promise<void> {
    if (!this.redis) return;

    try {
      const cacheKey = `yellowstone:${type}:${key}`;
      const cacheData = JSON.stringify({
        ...data,
        cached_at: Date.now()
      });

      await this.redis.setex(cacheKey, 300, cacheData); // 5 minute TTL
    } catch (error) {
      console.warn('Redis cache error:', error);
    }
  }

  async getCachedData(type: string, key: string): Promise<any | null> {
    if (!this.redis) return null;

    try {
      const cacheKey = `yellowstone:${type}:${key}`;
      const cached = await this.redis.get(cacheKey);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.warn('Redis get error:', error);
      return null;
    }
  }

  getBufferedUpdates(type: string, since?: number): any[] {
    const buffer = this.buffer.get(type) || [];
    
    if (since) {
      return buffer.filter(update => update.timestamp >= since);
    }
    
    return [...buffer];
  }

  private handleReconnect(): void {
    if (this.reconnectTimer) return;

    const interval = this.config.reconnectInterval || 5000;
    
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = undefined;
      
      if (!this.isConnected) {
        console.log('🔄 Attempting to reconnect Yellowstone client...');
        try {
          await this.connect();
        } catch (error) {
          console.error('Reconnection failed:', error);
          this.handleReconnect();
        }
      }
    }, interval);
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    this.isConnected = false;
    
    if (this.redis) {
      await this.redis.disconnect();
    }

    // Close gRPC client
    this.client.close();
    console.log('✅ Yellowstone client disconnected');
  }

  isClientConnected(): boolean {
    return this.isConnected;
  }

  getConnectionStats(): any {
    return {
      connected: this.isConnected,
      subscriptions: this.subscriptions.size,
      bufferSizes: Object.fromEntries(
        Array.from(this.buffer.entries()).map(([key, value]) => [key, value.length])
      ),
      redisConnected: this.redis?.status === 'ready'
    };
  }
}

/**
 * Factory function to create Yellowstone client
 */
export function createYellowstoneClient(config: YellowstoneConfig): YellowstoneDataClient {
  return new YellowstoneDataClient(config);
}

/**
 * Default configuration for common use cases
 */
export const DEFAULT_YELLOWSTONE_CONFIG: Partial<YellowstoneConfig> = {
  bufferSize: 1000,
  reconnectInterval: 5000,
  subscriptions: {
    accounts: [],
    programs: [
      '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM
      'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',  // Orca Whirlpools
      'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',  // Meteora
      '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'   // Pump.fun
    ],
    transactions: true,
    slots: true
  }
};
