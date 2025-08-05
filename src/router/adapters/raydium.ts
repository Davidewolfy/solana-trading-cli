import { Keypair, PublicKey } from "@solana/web3.js";
import { 
  RouterAdapter, 
  DEXType, 
  TradeSide, 
  TradeResult, 
  PriceQuote, 
  ExecutionMethod 
} from "../index";
import { buy as raydiumBuy, sell as raydiumSell } from "../../raydium/buy_helper";
import { getCurrentPriceInSOL, getCurrentPriceInUSD } from "../../raydium/fetch-price";
import { getSPLTokenBalance } from "../../helpers/check_balance";
import { connection } from "../../helpers/config";
import { fetchAMMPoolId } from "../../raydium/Pool";

/**
 * Raydium DEX Adapter
 * Implements the RouterAdapter interface for Raydium DEX
 */
export class RaydiumAdapter implements RouterAdapter {
  readonly dexType = DEXType.RAYDIUM;

  /**
   * Execute a buy trade on Raydium
   */
  async buy(params: {
    tokenAddress: string;
    solAmount: number;
    slippage?: number;
    wallet?: Keypair;
    executionMethod?: ExecutionMethod;
  }): Promise<TradeResult> {
    try {
      const wallet = params.wallet || require("../../helpers/config").wallet;
      
      // Raydium buy function expects: side, address, no_of_sol, payer
      await raydiumBuy("buy", params.tokenAddress, params.solAmount, wallet);

      return {
        success: true,
        signature: "raydium-buy-success", // Raydium doesn't return signature directly
        dexUsed: DEXType.RAYDIUM,
        executionMethodUsed: params.executionMethod || ExecutionMethod.SIMPLE,
        slippageUsed: params.slippage || 1 // Raydium uses internal slippage handling
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Raydium buy failed',
        dexUsed: DEXType.RAYDIUM,
        executionMethodUsed: params.executionMethod || ExecutionMethod.SIMPLE,
        slippageUsed: params.slippage || 1
      };
    }
  }

  /**
   * Execute a sell trade on Raydium
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
      const wallet = params.wallet || require("../../helpers/config").wallet;
      
      if (params.sellPercentage) {
        // Raydium sell function expects: side, address, sell_percentage, payer
        await raydiumSell("sell", params.tokenAddress, params.sellPercentage, wallet);
      } else if (params.tokenAmount) {
        // Convert token amount to percentage
        const balance = await getSPLTokenBalance(
          connection, 
          new PublicKey(params.tokenAddress), 
          wallet.publicKey
        );
        const sellPercentage = (params.tokenAmount / balance) * 100;
        await raydiumSell("sell", params.tokenAddress, sellPercentage, wallet);
      } else {
        throw new Error('Either sellPercentage or tokenAmount must be provided');
      }

      return {
        success: true,
        signature: "raydium-sell-success", // Raydium doesn't return signature directly
        dexUsed: DEXType.RAYDIUM,
        executionMethodUsed: params.executionMethod || ExecutionMethod.SIMPLE,
        slippageUsed: params.slippage || 1
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Raydium sell failed',
        dexUsed: DEXType.RAYDIUM,
        executionMethodUsed: params.executionMethod || ExecutionMethod.SIMPLE,
        slippageUsed: params.slippage || 1
      };
    }
  }

  /**
   * Get price quote from Raydium
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
        dex: DEXType.RAYDIUM,
        inputAmount: params.amount,
        outputAmount,
        priceImpact,
        estimatedSlippage: 1, // Default slippage estimate
        isValid: outputAmount > 0
      };

    } catch (error) {
      console.warn('Failed to get Raydium quote:', error);
      return {
        dex: DEXType.RAYDIUM,
        inputAmount: params.amount,
        outputAmount: 0,
        priceImpact: 100,
        estimatedSlippage: 100,
        isValid: false
      };
    }
  }

  /**
   * Check if Raydium supports the token
   */
  async supportsToken(tokenAddress: string): Promise<boolean> {
    try {
      // Try to fetch pool ID - if successful, token is supported
      const poolId = await fetchAMMPoolId(tokenAddress);
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
   * Get pool ID for token
   */
  async getPoolId(tokenAddress: string): Promise<string | null> {
    try {
      return await fetchAMMPoolId(tokenAddress);
    } catch (error) {
      return null;
    }
  }
}

/**
 * Factory function to create Raydium adapter
 */
export function createRaydiumAdapter(): RaydiumAdapter {
  return new RaydiumAdapter();
}
