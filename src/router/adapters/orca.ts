import { Keypair, PublicKey } from "@solana/web3.js";
import { 
  RouterAdapter, 
  DEXType, 
  TradeSide, 
  TradeResult, 
  PriceQuote, 
  ExecutionMethod 
} from "../index";
import { buy as orcaBuy, sell as orcaSell } from "../../orca/buy_helper";
import { getCurrentPriceInSOL, getCurrentPriceInUSD } from "../../orca/fetch-price";
import { getSPLTokenBalance } from "../../helpers/check_balance";
import { connection } from "../../helpers/config";
import { fetchWhirlPoolId } from "../../orca/Pool";

/**
 * Orca DEX Adapter
 * Implements the RouterAdapter interface for Orca DEX
 */
export class OrcaAdapter implements RouterAdapter {
  readonly dexType = DEXType.ORCA;

  /**
   * Execute a buy trade on Orca
   */
  async buy(params: {
    tokenAddress: string;
    solAmount: number;
    slippage?: number;
    wallet?: Keypair;
    executionMethod?: ExecutionMethod;
  }): Promise<TradeResult> {
    try {
      // Orca buy function expects: token_address, buyAmountInSOL
      await orcaBuy(params.tokenAddress, params.solAmount);

      return {
        success: true,
        signature: "orca-buy-success", // Orca doesn't return signature directly
        dexUsed: DEXType.ORCA,
        executionMethodUsed: params.executionMethod || ExecutionMethod.SIMPLE,
        slippageUsed: params.slippage || 1 // Orca uses internal slippage handling
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Orca buy failed',
        dexUsed: DEXType.ORCA,
        executionMethodUsed: params.executionMethod || ExecutionMethod.SIMPLE,
        slippageUsed: params.slippage || 1
      };
    }
  }

  /**
   * Execute a sell trade on Orca
   */
  async sell(params: {
    tokenAddress: string;
    sellPercentage?: number;
    tokenAmount?: number;
    slippage?: number;
    wallet?: Keypair;
    executionMethod?: ExecutionMethod;
  }): Promise<TradeResult> {
    try {
      if (params.sellPercentage) {
        // Orca sell function expects: token_address, sell_percentage
        await orcaSell(params.tokenAddress, params.sellPercentage);
      } else if (params.tokenAmount) {
        // Convert token amount to percentage
        const wallet = params.wallet || require("../../helpers/config").wallet;
        const balance = await getSPLTokenBalance(
          connection, 
          new PublicKey(params.tokenAddress), 
          wallet.publicKey
        );
        const sellPercentage = (params.tokenAmount / balance) * 100;
        await orcaSell(params.tokenAddress, sellPercentage);
      } else {
        throw new Error('Either sellPercentage or tokenAmount must be provided');
      }

      return {
        success: true,
        signature: "orca-sell-success", // Orca doesn't return signature directly
        dexUsed: DEXType.ORCA,
        executionMethodUsed: params.executionMethod || ExecutionMethod.SIMPLE,
        slippageUsed: params.slippage || 1
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Orca sell failed',
        dexUsed: DEXType.ORCA,
        executionMethodUsed: params.executionMethod || ExecutionMethod.SIMPLE,
        slippageUsed: params.slippage || 1
      };
    }
  }

  /**
   * Get price quote from Orca
   */
  async getQuote(params: {
    tokenAddress: string;
    side: TradeSide;
    amount: number;
  }): Promise<PriceQuote> {
    try {
      // Get current price in SOL
      const priceInSOL = await getCurrentPriceInSOL(params.tokenAddress);
      
      let outputAmount: number;
      let priceImpact: number = 0; // Would need pool data for accurate price impact
      
      if (params.side === TradeSide.BUY) {
        // Buying tokens with SOL
        outputAmount = params.amount / priceInSOL;
      } else {
        // Selling tokens for SOL
        outputAmount = params.amount * priceInSOL;
      }

      return {
        dex: DEXType.ORCA,
        inputAmount: params.amount,
        outputAmount,
        priceImpact,
        estimatedSlippage: 1, // Default slippage estimate
        isValid: outputAmount > 0
      };

    } catch (error) {
      console.warn('Failed to get Orca quote:', error);
      return {
        dex: DEXType.ORCA,
        inputAmount: params.amount,
        outputAmount: 0,
        priceImpact: 100,
        estimatedSlippage: 100,
        isValid: false
      };
    }
  }

  /**
   * Check if Orca supports the token
   */
  async supportsToken(tokenAddress: string): Promise<boolean> {
    try {
      // Try to fetch whirlpool ID - if successful, token is supported
      const poolId = await fetchWhirlPoolId(tokenAddress);
      return poolId !== null && poolId !== undefined;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get current price in USD
   */
  async getCurrentPriceInUSD(tokenAddress: string): Promise<number> {
    return await getCurrentPriceInUSD(tokenAddress);
  }

  /**
   * Get current price in SOL
   */
  async getCurrentPriceInSOL(tokenAddress: string): Promise<number> {
    return await getCurrentPriceInSOL(tokenAddress);
  }

  /**
   * Get whirlpool ID for token
   */
  async getWhirlPoolId(tokenAddress: string): Promise<string | null> {
    try {
      return await fetchWhirlPoolId(tokenAddress);
    } catch (error) {
      return null;
    }
  }
}

/**
 * Factory function to create Orca adapter
 */
export function createOrcaAdapter(): OrcaAdapter {
  return new OrcaAdapter();
}
