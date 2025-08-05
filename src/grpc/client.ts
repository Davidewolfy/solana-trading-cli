import { EventEmitter } from 'events';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import {
  StreamConfig,
  SubscribeRequest,
  SubscribeUpdate,
  StreamEvent,
  ConnectionStats,
  CommitmentLevel,
  DEFAULT_STREAM_CONFIG
} from './types';

/**
 * Yellowstone gRPC Client
 * Handles streaming data from Solana via gRPC with keepalive
 */
export class YellowstoneClient extends EventEmitter {
  private config: StreamConfig;
  private client: any;
  private stream: any;
  private stats: ConnectionStats;
  private pingInterval?: NodeJS.Timeout;
  private reconnectTimeout?: NodeJS.Timeout;
  private pingId = 0;

  constructor(config: Partial<StreamConfig> = {}) {
    super();
    this.config = { ...DEFAULT_STREAM_CONFIG, ...config };
    this.stats = {
      connected: false,
      reconnectAttempts: 0,
      totalMessages: 0,
      totalErrors: 0,
      uptime: 0
    };
  }

  /**
   * Connect to Yellowstone gRPC endpoint
   */
  async connect(): Promise<void> {
    try {
      console.log(`📡 Connecting to Yellowstone gRPC: ${this.config.endpoint}`);

      // Load actual proto definition
      const protoPath = path.join(__dirname, 'proto', 'geyser.proto');
      const packageDefinition = protoLoader.loadSync(protoPath, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
        includeDirs: [path.join(__dirname, 'proto')]
      });

      const proto = grpc.loadPackageDefinition(packageDefinition) as any;
      
      // Create gRPC client with keepalive settings
      this.client = new proto.geyser.Geyser(
        this.config.endpoint,
        this.createCredentials(),
        {
          'grpc.keepalive_time_ms': 30000,
          'grpc.keepalive_timeout_ms': 5000,
          'grpc.keepalive_permit_without_calls': true,
          'grpc.http2.max_pings_without_data': 0,
          'grpc.http2.min_time_between_pings_ms': 10000
        }
      );

      await this.startSubscription();
      
      this.stats.connected = true;
      this.stats.lastConnected = Date.now();
      this.stats.reconnectAttempts = 0;
      
      this.startPingInterval();
      
      console.log('✅ Yellowstone gRPC connected successfully');
      this.emit('connected');

    } catch (error) {
      console.error('❌ Failed to connect to Yellowstone gRPC:', error);
      this.handleConnectionError(error);
      throw error;
    }
  }

  /**
   * Start subscription with ping to keep connection alive
   */
  private async startSubscription(): Promise<void> {
    const subscribeRequest: SubscribeRequest = {
      commitment: CommitmentLevel.CONFIRMED,
      ping: { id: 0 } // Enable ping to keep LB happy
    };

    // Subscribe to program accounts if specified
    if (this.config.programs && this.config.programs.length > 0) {
      subscribeRequest.accounts = {};
      this.config.programs.forEach((program, index) => {
        subscribeRequest.accounts![`program_${index}`] = {
          owner: [program],
          account: [],
          filters: []
        };
      });
    }

    // Subscribe to specific accounts if specified
    if (this.config.accounts && this.config.accounts.length > 0) {
      if (!subscribeRequest.accounts) subscribeRequest.accounts = {};
      this.config.accounts.forEach((account, index) => {
        subscribeRequest.accounts![`account_${index}`] = {
          account: [account],
          owner: [],
          filters: []
        };
      });
    }

    // Subscribe to transactions for program monitoring
    subscribeRequest.transactions = {
      'program_transactions': {
        vote: false,
        failed: false,
        accountInclude: this.config.programs || [],
        accountExclude: [],
        accountRequired: []
      }
    };

    // Subscribe to slots for timing
    subscribeRequest.slots = {
      'slots': {
        filterByCommitment: true
      }
    };

    // Add accounts_data_slice for optimization
    if (this.config.accounts && this.config.accounts.length > 0) {
      subscribeRequest.accountsDataSlice = [
        { offset: 0, length: 32 }, // First 32 bytes (discriminator + key data)
        { offset: 64, length: 64 } // Common data fields
      ];
    }

    // Create bidirectional stream
    this.stream = this.client.subscribe();
    
    // Handle incoming messages
    this.stream.on('data', (update: SubscribeUpdate) => {
      this.handleUpdate(update);
    });

    this.stream.on('error', (error: Error) => {
      console.error('❌ Yellowstone stream error:', error);
      this.handleStreamError(error);
    });

    this.stream.on('end', () => {
      console.log('📡 Yellowstone stream ended');
      this.handleStreamEnd();
    });

    // Send subscription request
    this.stream.write(subscribeRequest);
    console.log('📝 Yellowstone subscription request sent');
  }

  /**
   * Handle incoming updates
   */
  private handleUpdate(update: SubscribeUpdate): void {
    this.stats.totalMessages++;

    try {
      if (update.ping) {
        // Handle ping response
        this.emit('ping', update.ping);
        return;
      }

      if (update.account) {
        const event: StreamEvent = {
          type: 'account',
          data: {
            pubkey: update.account.account?.pubkey,
            lamports: update.account.account?.lamports,
            owner: update.account.account?.owner,
            data: update.account.account?.data,
            slot: update.account.slot,
            writeVersion: update.account.writeVersion
          },
          timestamp: Date.now()
        };
        this.emit('account', event);
        this.emit('data', event);
      }

      if (update.transaction) {
        const event: StreamEvent = {
          type: 'transaction',
          data: {
            signature: update.transaction.transaction?.signature,
            slot: update.transaction.slot,
            transaction: update.transaction.transaction?.transaction,
            meta: update.transaction.transaction?.meta,
            isVote: update.transaction.transaction?.isVote
          },
          timestamp: Date.now()
        };
        this.emit('transaction', event);
        this.emit('data', event);
      }

      if (update.slot) {
        const event: StreamEvent = {
          type: 'slot',
          data: {
            slot: update.slot.slot,
            parent: update.slot.parent,
            status: update.slot.status
          },
          timestamp: Date.now()
        };
        this.emit('slot', event);
        this.emit('data', event);
      }

    } catch (error) {
      console.error('Error processing update:', error);
      this.stats.totalErrors++;
      this.emit('error', error);
    }
  }

  /**
   * Start ping interval to keep connection alive
   */
  private startPingInterval(): void {
    if (this.config.pingIntervalMs && this.config.pingIntervalMs > 0) {
      this.pingInterval = setInterval(() => {
        this.sendPing();
      }, this.config.pingIntervalMs);
    }
  }

  /**
   * Send ping to keep connection alive
   */
  private sendPing(): void {
    if (this.stream && this.stats.connected) {
      try {
        this.pingId++;
        this.stream.write({
          ping: { id: this.pingId }
        });
      } catch (error) {
        console.error('Failed to send ping:', error);
      }
    }
  }

  /**
   * Handle connection errors
   */
  private handleConnectionError(error: any): void {
    this.stats.connected = false;
    this.stats.lastDisconnected = Date.now();
    this.stats.totalErrors++;
    
    this.emit('error', error);
    this.scheduleReconnect();
  }

  /**
   * Handle stream errors
   */
  private handleStreamError(error: Error): void {
    this.stats.totalErrors++;
    this.emit('error', error);
    this.scheduleReconnect();
  }

  /**
   * Handle stream end
   */
  private handleStreamEnd(): void {
    this.stats.connected = false;
    this.stats.lastDisconnected = Date.now();
    this.emit('disconnected');
    this.scheduleReconnect();
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.stats.reconnectAttempts >= (this.config.maxReconnectAttempts || 10)) {
      console.error('❌ Max reconnection attempts reached');
      this.emit('maxReconnectAttemptsReached');
      return;
    }

    const delay = this.config.reconnectIntervalMs || 5000;
    console.log(`🔄 Scheduling reconnect in ${delay}ms (attempt ${this.stats.reconnectAttempts + 1})`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.stats.reconnectAttempts++;
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, delay);
  }

  /**
   * Disconnect from gRPC
   */
  async disconnect(): Promise<void> {
    console.log('🛑 Disconnecting from Yellowstone gRPC');
    
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }

    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }

    if (this.client) {
      this.client.close();
      this.client = null;
    }

    this.stats.connected = false;
    this.stats.lastDisconnected = Date.now();
    
    this.emit('disconnected');
    console.log('✅ Yellowstone gRPC disconnected');
  }

  /**
   * Get connection statistics
   */
  getStats(): ConnectionStats {
    return {
      ...this.stats,
      uptime: this.stats.lastConnected ? Date.now() - this.stats.lastConnected : 0
    };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.stats.connected;
  }

  private createCredentials(): grpc.ChannelCredentials {
    if (this.config.token) {
      // Use token-based authentication if provided
      const metadata = new grpc.Metadata();
      metadata.add('authorization', `Bearer ${this.config.token}`);
      return grpc.credentials.createSsl();
    }
    
    // Use SSL for secure connection
    return grpc.credentials.createSsl();
  }

  private createMockProtoDefinition(): any {
    // In production, you'd load actual proto files
    // This is a simplified mock for demonstration
    return {
      geyser: {
        Geyser: {
          service: {
            subscribe: {
              requestStream: true,
              responseStream: true
            }
          }
        }
      }
    };
  }
}

/**
 * Factory function to create Yellowstone client
 */
export function createYellowstoneClient(config?: Partial<StreamConfig>): YellowstoneClient {
  return new YellowstoneClient(config);
}
