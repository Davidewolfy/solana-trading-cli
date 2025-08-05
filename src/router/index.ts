import { Keypair } from "@solana/web3.js";

/**
 * Supported DEX types
 */
export enum DEXType {
  JUPITER = "jupiter",
  RAYDIUM = "raydium", 
  ORCA = "orca",
  METEORA = "meteora"
}

/**
 * Transaction execution methods
 */
export enum ExecutionMethod {
  SIMPLE = "simple",
  JITO = "jito",
  BLOXROUTE = "bloxroute"
}

/**
 * Trade side enum
 */
export enum TradeSide {
  BUY = "buy",
  SELL = "sell"
}

/**
 * Configuration for router operations
 */
export interface RouterConfig {
  /** Default DEX to use if not specified */
  defaultDEX: DEXType;
  /** Default slippage tolerance in percentage (e.g., 1 for 1%) */
  defaultSlippage: number;
  /** Default execution method */
  defaultExecutionMethod: ExecutionMethod;
  /** Wallet keypair for transactions */
  wallet: Keypair;
  /** Enable automatic DEX selection based on best price */
  autoSelectBestDEX?: boolean;
  /** Maximum slippage allowed for auto-selection */
  maxSlippage?: number;
}

/**
 * Trade parameters
 */
export interface TradeParams {
  /** Token address to trade */
  tokenAddress: string;
  /** Trade side (buy/sell) */
  side: TradeSide;
  /** Amount of SOL for buy operations */
  solAmount?: number;
  /** Percentage to sell for sell operations (0-100) */
  sellPercentage?: number;
  /** Token amount to sell (alternative to sellPercentage) */
  tokenAmount?: number;
  /** Slippage tolerance in percentage */
  slippage?: number;
  /** Specific DEX to use (overrides default) */
  dex?: DEXType;
  /** Execution method to use */
  executionMethod?: ExecutionMethod;
  /** Custom wallet (overrides default) */
  wallet?: Keypair;
}

/**
 * Trade result
 */
export interface TradeResult {
  /** Whether the trade was successful */
  success: boolean;
  /** Transaction signature */
  signature?: string;
  /** Error message if failed */
  error?: string;
  /** DEX used for the trade */
  dexUsed: DEXType;
  /** Execution method used */
  executionMethodUsed: ExecutionMethod;
  /** Actual slippage used */
  slippageUsed: number;
}

/**
 * Price quote from a DEX
 */
export interface PriceQuote {
  /** DEX that provided the quote */
  dex: DEXType;
  /** Input amount */
  inputAmount: number;
  /** Expected output amount */
  outputAmount: number;
  /** Price impact percentage */
  priceImpact: number;
  /** Estimated slippage */
  estimatedSlippage: number;
  /** Whether the quote is valid */
  isValid: boolean;
}

/**
 * Interface for DEX adapters
 */
export interface RouterAdapter {
  /** DEX type */
  readonly dexType: DEXType;
  
  /** Execute a buy trade */
  buy(params: {
    tokenAddress: string;
    solAmount: number;
    slippage?: number;
    wallet?: Keypair;
    executionMethod?: ExecutionMethod;
  }): Promise<TradeResult>;
  
  /** Execute a sell trade */
  sell(params: {
    tokenAddress: string;
    sellPercentage?: number;
    tokenAmount?: number;
    slippage?: number;
    wallet?: Keypair;
    executionMethod?: ExecutionMethod;
  }): Promise<TradeResult>;
  
  /** Get price quote */
  getQuote(params: {
    tokenAddress: string;
    side: TradeSide;
    amount: number;
  }): Promise<PriceQuote>;
  
  /** Check if DEX supports the token */
  supportsToken(tokenAddress: string): Promise<boolean>;
}

/**
 * Unified router for all DEX operations
 */
export class UnifiedRouter {
  private config: RouterConfig;
  private adapters: Map<DEXType, RouterAdapter> = new Map();

  constructor(config: RouterConfig) {
    this.config = config;
  }

  /**
   * Register a DEX adapter
   */
  registerAdapter(adapter: RouterAdapter): void {
    this.adapters.set(adapter.dexType, adapter);
  }

  /**
   * Execute a trade
   */
  async trade(params: TradeParams): Promise<TradeResult> {
    try {
      // Validate parameters
      this.validateTradeParams(params);

      // Determine DEX to use
      const dexToUse = params.dex || this.config.defaultDEX;
      
      // Auto-select best DEX if enabled
      const finalDEX = this.config.autoSelectBestDEX 
        ? await this.selectBestDEX(params)
        : dexToUse;

      // Get adapter
      const adapter = this.adapters.get(finalDEX);
      if (!adapter) {
        throw new Error(`No adapter registered for DEX: ${finalDEX}`);
      }

      // Execute trade
      const result = params.side === TradeSide.BUY 
        ? await this.executeBuy(adapter, params)
        : await this.executeSell(adapter, params);

      return result;

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        dexUsed: params.dex || this.config.defaultDEX,
        executionMethodUsed: params.executionMethod || this.config.defaultExecutionMethod,
        slippageUsed: params.slippage || this.config.defaultSlippage
      };
    }
  }

  /**
   * Get quotes from all available DEXs
   */
  async getAllQuotes(params: {
    tokenAddress: string;
    side: TradeSide;
    amount: number;
  }): Promise<PriceQuote[]> {
    const quotes: PriceQuote[] = [];
    
    for (const [dexType, adapter] of this.adapters) {
      try {
        const quote = await adapter.getQuote(params);
        quotes.push(quote);
      } catch (error) {
        console.warn(`Failed to get quote from ${dexType}:`, error);
        quotes.push({
          dex: dexType,
          inputAmount: params.amount,
          outputAmount: 0,
          priceImpact: 100,
          estimatedSlippage: 100,
          isValid: false
        });
      }
    }

    return quotes.sort((a, b) => b.outputAmount - a.outputAmount);
  }

  /**
   * Get the best available quote
   */
  async getBestQuote(params: {
    tokenAddress: string;
    side: TradeSide;
    amount: number;
  }): Promise<PriceQuote | null> {
    const quotes = await this.getAllQuotes(params);
    const validQuotes = quotes.filter(q => q.isValid);
    return validQuotes.length > 0 ? validQuotes[0] : null;
  }

  private async selectBestDEX(params: TradeParams): Promise<DEXType> {
    if (!params.solAmount && !params.tokenAmount && !params.sellPercentage) {
      return params.dex || this.config.defaultDEX;
    }

    const amount = params.side === TradeSide.BUY 
      ? params.solAmount || 0
      : params.tokenAmount || 0;

    const bestQuote = await this.getBestQuote({
      tokenAddress: params.tokenAddress,
      side: params.side,
      amount
    });

    return bestQuote?.dex || params.dex || this.config.defaultDEX;
  }

  private async executeBuy(adapter: RouterAdapter, params: TradeParams): Promise<TradeResult> {
    if (!params.solAmount) {
      throw new Error('solAmount is required for buy operations');
    }

    return await adapter.buy({
      tokenAddress: params.tokenAddress,
      solAmount: params.solAmount,
      slippage: params.slippage || this.config.defaultSlippage,
      wallet: params.wallet || this.config.wallet,
      executionMethod: params.executionMethod || this.config.defaultExecutionMethod
    });
  }

  private async executeSell(adapter: RouterAdapter, params: TradeParams): Promise<TradeResult> {
    if (!params.sellPercentage && !params.tokenAmount) {
      throw new Error('Either sellPercentage or tokenAmount is required for sell operations');
    }

    return await adapter.sell({
      tokenAddress: params.tokenAddress,
      sellPercentage: params.sellPercentage,
      tokenAmount: params.tokenAmount,
      slippage: params.slippage || this.config.defaultSlippage,
      wallet: params.wallet || this.config.wallet,
      executionMethod: params.executionMethod || this.config.defaultExecutionMethod
    });
  }

  private validateTradeParams(params: TradeParams): void {
    if (!params.tokenAddress) {
      throw new Error('tokenAddress is required');
    }

    if (params.side === TradeSide.BUY && !params.solAmount) {
      throw new Error('solAmount is required for buy operations');
    }

    if (params.side === TradeSide.SELL && !params.sellPercentage && !params.tokenAmount) {
      throw new Error('Either sellPercentage or tokenAmount is required for sell operations');
    }

    if (params.sellPercentage && (params.sellPercentage < 0 || params.sellPercentage > 100)) {
      throw new Error('sellPercentage must be between 0 and 100');
    }

    if (params.slippage && (params.slippage < 0 || params.slippage > 100)) {
      throw new Error('slippage must be between 0 and 100');
    }
  }
}

/**
 * Factory function to create a configured router
 */
export function createRouter(config: RouterConfig): UnifiedRouter {
  return new UnifiedRouter(config);
}

/**
 * Default router configuration
 */
export const DEFAULT_ROUTER_CONFIG: Partial<RouterConfig> = {
  defaultDEX: DEXType.JUPITER,
  defaultSlippage: 1,
  defaultExecutionMethod: ExecutionMethod.SIMPLE,
  autoSelectBestDEX: false,
  maxSlippage: 5
};

// Unified Router exports (new architecture)
export * from './unified-router';
export * from './scoring';
export * from './adapters/jupiter-unified';
export * from './adapters/raydium-unified';
export * from './adapters/orca-unified';
export * from './adapters/meteora-unified';

// Factory functions for unified router
export { createUnifiedRouter } from './unified-router';
export { createJupiterUnifiedAdapter } from './adapters/jupiter-unified';
export { createRaydiumUnifiedAdapter } from './adapters/raydium-unified';
export { createOrcaUnifiedAdapter } from './adapters/orca-unified';
export { createMeteoraUnifiedAdapter } from './adapters/meteora-unified';
