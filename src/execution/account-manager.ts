import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction, 
  SystemProgram,
  LAMPORTS_PER_SOL 
} from '@solana/web3.js';
import { 
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { EventEmitter } from 'events';

/**
 * Account Manager for pre-funded accounts and ATA management
 */

export interface AccountConfig {
  minBalance: number; // Minimum SOL balance to maintain
  targetBalance: number; // Target SOL balance to top up to
  tokens: string[]; // Token mints to pre-create ATAs for
  maxAge: number; // Max age before refreshing account info (ms)
}

export interface ManagedAccount {
  keypair: Keypair;
  publicKey: PublicKey;
  solBalance: number;
  tokenAccounts: Map<string, PublicKey>;
  lastUpdated: number;
  config: AccountConfig;
}

export interface TopUpRequest {
  account: PublicKey;
  amount: number;
  priority: 'low' | 'medium' | 'high';
  reason: string;
}

export class AccountManager extends EventEmitter {
  private connection: Connection;
  private masterWallet: Keypair;
  private accounts: Map<string, ManagedAccount> = new Map();
  private topUpQueue: TopUpRequest[] = [];
  private isProcessingTopUps = false;
  private monitoringInterval?: NodeJS.Timeout;

  constructor(connection: Connection, masterWallet: Keypair) {
    super();
    this.connection = connection;
    this.masterWallet = masterWallet;
    this.startMonitoring();
  }

  /**
   * Register a managed account
   */
  async registerAccount(
    keypair: Keypair, 
    config: AccountConfig,
    accountId?: string
  ): Promise<string> {
    const id = accountId || keypair.publicKey.toBase58();
    
    console.log(`📝 Registering managed account: ${id}`);
    
    const account: ManagedAccount = {
      keypair,
      publicKey: keypair.publicKey,
      solBalance: 0,
      tokenAccounts: new Map(),
      lastUpdated: 0,
      config
    };

    // Initial setup
    await this.refreshAccountInfo(account);
    await this.ensureTokenAccounts(account);
    await this.ensureMinimumBalance(account);

    this.accounts.set(id, account);
    
    console.log(`✅ Account ${id} registered with ${account.solBalance} SOL`);
    return id;
  }

  /**
   * Get account by ID
   */
  getAccount(accountId: string): ManagedAccount | null {
    return this.accounts.get(accountId) || null;
  }

  /**
   * Get account keypair for trading
   */
  getAccountKeypair(accountId: string): Keypair | null {
    const account = this.accounts.get(accountId);
    return account?.keypair || null;
  }

  /**
   * Ensure account has minimum balance and required token accounts
   */
  async prepareAccountForTrading(accountId: string, tokenMint?: string): Promise<boolean> {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    console.log(`🔧 Preparing account ${accountId} for trading`);

    // Refresh account info if stale
    if (Date.now() - account.lastUpdated > account.config.maxAge) {
      await this.refreshAccountInfo(account);
    }

    // Ensure minimum SOL balance
    const balanceOk = await this.ensureMinimumBalance(account);
    
    // Ensure token account exists if specified
    let tokenAccountOk = true;
    if (tokenMint) {
      tokenAccountOk = await this.ensureTokenAccount(account, tokenMint);
    }

    const ready = balanceOk && tokenAccountOk;
    console.log(`${ready ? '✅' : '❌'} Account ${accountId} ${ready ? 'ready' : 'not ready'} for trading`);
    
    return ready;
  }

  /**
   * Refresh account information from blockchain
   */
  private async refreshAccountInfo(account: ManagedAccount): Promise<void> {
    try {
      const balance = await this.connection.getBalance(account.publicKey);
      account.solBalance = balance / LAMPORTS_PER_SOL;
      account.lastUpdated = Date.now();
      
      // Refresh token account balances
      const tokenAccounts = await this.connection.getTokenAccountsByOwner(
        account.publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );

      // Update token account mapping
      for (const tokenAccount of tokenAccounts.value) {
        const accountInfo = await this.connection.getParsedAccountInfo(tokenAccount.pubkey);
        if (accountInfo.value?.data && 'parsed' in accountInfo.value.data) {
          const mint = accountInfo.value.data.parsed.info.mint;
          account.tokenAccounts.set(mint, tokenAccount.pubkey);
        }
      }

    } catch (error) {
      console.error(`Failed to refresh account info for ${account.publicKey.toBase58()}:`, error);
    }
  }

  /**
   * Ensure account has minimum SOL balance
   */
  private async ensureMinimumBalance(account: ManagedAccount): Promise<boolean> {
    if (account.solBalance >= account.config.minBalance) {
      return true;
    }

    const topUpAmount = account.config.targetBalance - account.solBalance;
    console.log(`💰 Account ${account.publicKey.toBase58()} needs ${topUpAmount} SOL top-up`);

    this.queueTopUp({
      account: account.publicKey,
      amount: topUpAmount,
      priority: account.solBalance < 0.01 ? 'high' : 'medium',
      reason: 'minimum_balance'
    });

    return false;
  }

  /**
   * Ensure all required token accounts exist
   */
  private async ensureTokenAccounts(account: ManagedAccount): Promise<void> {
    for (const tokenMint of account.config.tokens) {
      await this.ensureTokenAccount(account, tokenMint);
    }
  }

  /**
   * Ensure specific token account exists
   */
  private async ensureTokenAccount(account: ManagedAccount, tokenMint: string): Promise<boolean> {
    try {
      const mintPubkey = new PublicKey(tokenMint);
      const ataAddress = await getAssociatedTokenAddress(
        mintPubkey,
        account.publicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      // Check if ATA already exists
      if (account.tokenAccounts.has(tokenMint)) {
        return true;
      }

      // Check if ATA exists on-chain
      const accountInfo = await this.connection.getAccountInfo(ataAddress);
      if (accountInfo) {
        account.tokenAccounts.set(tokenMint, ataAddress);
        return true;
      }

      // Create ATA
      console.log(`🏗️ Creating ATA for ${tokenMint} on account ${account.publicKey.toBase58()}`);
      await this.createTokenAccount(account, tokenMint);
      
      return true;
    } catch (error) {
      console.error(`Failed to ensure token account for ${tokenMint}:`, error);
      return false;
    }
  }

  /**
   * Create associated token account
   */
  private async createTokenAccount(account: ManagedAccount, tokenMint: string): Promise<void> {
    const mintPubkey = new PublicKey(tokenMint);
    const ataAddress = await getAssociatedTokenAddress(
      mintPubkey,
      account.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const transaction = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        this.masterWallet.publicKey, // Payer
        ataAddress,
        account.publicKey, // Owner
        mintPubkey,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );

    const signature = await this.connection.sendTransaction(
      transaction,
      [this.masterWallet],
      { skipPreflight: false }
    );

    await this.connection.confirmTransaction(signature);
    account.tokenAccounts.set(tokenMint, ataAddress);
    
    console.log(`✅ Created ATA ${ataAddress.toBase58()} for ${tokenMint}`);
  }

  /**
   * Queue a top-up request
   */
  private queueTopUp(request: TopUpRequest): void {
    this.topUpQueue.push(request);
    this.topUpQueue.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    if (!this.isProcessingTopUps) {
      this.processTopUpQueue();
    }
  }

  /**
   * Process top-up queue
   */
  private async processTopUpQueue(): Promise<void> {
    if (this.isProcessingTopUps || this.topUpQueue.length === 0) {
      return;
    }

    this.isProcessingTopUps = true;

    while (this.topUpQueue.length > 0) {
      const request = this.topUpQueue.shift()!;
      
      try {
        await this.executeTopUp(request);
        this.emit('topUpCompleted', request);
      } catch (error) {
        console.error(`Failed to top up ${request.account.toBase58()}:`, error);
        this.emit('topUpFailed', { request, error });
      }

      // Small delay between top-ups
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.isProcessingTopUps = false;
  }

  /**
   * Execute a top-up transaction
   */
  private async executeTopUp(request: TopUpRequest): Promise<void> {
    console.log(`💸 Executing top-up: ${request.amount} SOL to ${request.account.toBase58()}`);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: this.masterWallet.publicKey,
        toPubkey: request.account,
        lamports: request.amount * LAMPORTS_PER_SOL
      })
    );

    const signature = await this.connection.sendTransaction(
      transaction,
      [this.masterWallet],
      { skipPreflight: false }
    );

    await this.connection.confirmTransaction(signature);
    
    console.log(`✅ Top-up completed: ${signature}`);
  }

  /**
   * Start monitoring accounts
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      for (const [id, account] of this.accounts) {
        try {
          await this.refreshAccountInfo(account);
          await this.ensureMinimumBalance(account);
        } catch (error) {
          console.error(`Monitoring error for account ${id}:`, error);
        }
      }
    }, 60000); // Check every minute
  }

  /**
   * Get account status summary
   */
  getAccountStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    for (const [id, account] of this.accounts) {
      status[id] = {
        publicKey: account.publicKey.toBase58(),
        solBalance: account.solBalance,
        tokenAccounts: account.tokenAccounts.size,
        lastUpdated: new Date(account.lastUpdated).toISOString(),
        needsTopUp: account.solBalance < account.config.minBalance
      };
    }
    
    return status;
  }

  /**
   * Cleanup and stop monitoring
   */
  async cleanup(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    // Wait for any pending top-ups to complete
    while (this.isProcessingTopUps) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

/**
 * Default account configuration
 */
export const DEFAULT_ACCOUNT_CONFIG: AccountConfig = {
  minBalance: 0.1,     // 0.1 SOL minimum
  targetBalance: 0.5,  // Top up to 0.5 SOL
  tokens: [
    'So11111111111111111111111111111111111111112', // WSOL
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'  // USDC
  ],
  maxAge: 30000 // 30 seconds
};
