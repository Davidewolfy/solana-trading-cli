import { Keypair, PublicKey } from "@solana/web3.js";
import { 
  RouterAdapter, 
  DEXType, 
  TradeSide, 
  TradeResult, 
  PriceQuote, 
  ExecutionMethod 
} from "../index";
import { buy as meteoraBuy, sell as meteoraSell } from "../../meteora/buy_helper";
import { getCurrentPriceInSOL, getCurrentPriceInUSD } from "../../meteora/fetch-price";
import { getSPLTokenBalance } from "../../helpers/check_balance";
import { connection } from "../../helpers/config";
import { fetchDLMMPoolId } from "../../meteora/Pool";

/**
 * Meteora DEX Adapter
 * Implements the RouterAdapter interface for Meteora DEX
 */
export class MeteoraAdapter implements RouterAdapter {
  readonly dexType = DEXType.METEORA;

  /**
   * Execute a buy trade on Meteora
   */
  async buy(params: {
    tokenAddress: string;
    solAmount: number;
    slippage?: number;
    wallet?: Keypair;
    executionMethod?: ExecutionMethod;
  }): Promise<TradeResult> {
    try {
      // Meteora buy function expects: token_address, buyAmountInSOL
      await meteoraBuy(params.tokenAddress, params.solAmount);

      return {
        success: true,
        signature: "meteora-buy-success", // Meteora doesn't return signature directly
        dexUsed: DEXType.METEORA,
        executionMethodUsed: params.executionMethod || ExecutionMethod.SIMPLE,
        slippageUsed: params.slippage || 1 // Meteora uses internal slippage handling
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Meteora buy failed',
        dexUsed: DEXType.METEORA,
        executionMethodUsed: params.executionMethod || ExecutionMethod.SIMPLE,
        slippageUsed: params.slippage || 1
      };
    }
  }

  /**
   * Execute a sell trade on Meteora
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
        // Meteora sell function expects: token_address, sell_percentage
        await meteoraSell(params.tokenAddress, params.sellPercentage);
      } else if (params.tokenAmount) {
        // Convert token amount to percentage
        const wallet = params.wallet || require("../../helpers/config").wallet;
        const balance = await getSPLTokenBalance(
          connection, 
          new PublicKey(params.tokenAddress), 
          wallet.publicKey
        );
        const sellPercentage = (params.tokenAmount / balance) * 100;
        await meteoraSell(params.tokenAddress, sellPercentage);
      } else {
        throw new Error('Either sellPercentage or tokenAmount must be provided');
      }

      return {
        success: true,
        signature: "meteora-sell-success", // Meteora doesn't return signature directly
        dexUsed: DEXType.METEORA,
        executionMethodUsed: params.executionMethod || ExecutionMethod.SIMPLE,
        slippageUsed: params.slippage || 1
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Meteora sell failed',
        dexUsed: DEXType.METEORA,
        executionMethodUsed: params.executionMethod || ExecutionMethod.SIMPLE,
        slippageUsed: params.slippage || 1
      };
    }
  }

  /**
   * Get price quote from Meteora
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
        dex: DEXType.METEORA,
        inputAmount: params.amount,
        outputAmount,
        priceImpact,
        estimatedSlippage: 1, // Default slippage estimate
        isValid: outputAmount > 0
      };

    } catch (error) {
      console.warn('Failed to get Meteora quote:', error);
      return {
        dex: DEXType.METEORA,
        inputAmount: params.amount,
        outputAmount: 0,
        priceImpact: 100,
        estimatedSlippage: 100,
        isValid: false
      };
    }
  }

  /**
   * Check if Meteora supports the token
   */
  async supportsToken(tokenAddress: string): Promise<boolean> {
    try {
      // Try to fetch DLMM pool ID - if successful, token is supported
      const poolId = await fetchDLMMPoolId(tokenAddress);
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
   * Get DLMM pool ID for token
   */
  async getDLMMPoolId(tokenAddress: string): Promise<string | null> {
    try {
      return await fetchDLMMPoolId(tokenAddress);
    } catch (error) {
      return null;
    }
  }
}

/**
 * Factory function to create Meteora adapter
 */
export function createMeteoraAdapter(): MeteoraAdapter {
  return new MeteoraAdapter();
}
