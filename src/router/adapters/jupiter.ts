import { Keypair, PublicKey } from "@solana/web3.js";
import { 
  RouterAdapter, 
  DEXType, 
  TradeSide, 
  TradeResult, 
  PriceQuote, 
  ExecutionMethod 
} from "../index";
import { buy as jupiterBuy, sell as jupiterSell } from "../../jupiter/swap";
import { getCurrentPriceInSOL, getCurrentPriceInUSD } from "../../jupiter/fetch-price";
import { getSPLTokenBalance } from "../../helpers/check_balance";
import { connection } from "../../helpers/config";

/**
 * Jupiter DEX Adapter
 * Implements the RouterAdapter interface for Jupiter aggregator
 */
export class JupiterAdapter implements RouterAdapter {
  readonly dexType = DEXType.JUPITER;

  /**
   * Execute a buy trade on Jupiter
   */
  async buy(params: {
    tokenAddress: string;
    solAmount: number;
    slippage?: number;
    wallet?: Keypair;
    executionMethod?: ExecutionMethod;
  }): Promise<TradeResult> {
    try {
      const slippage = params.slippage || 1; // Default 1% slippage
      
      // Jupiter buy function expects: tokenToBuy, amountTokenOut (in SOL), slippage
      await jupiterBuy(params.tokenAddress, params.solAmount, slippage);

      return {
        success: true,
        signature: "jupiter-buy-success", // Jupiter doesn't return signature directly
        dexUsed: DEXType.JUPITER,
        executionMethodUsed: params.executionMethod || ExecutionMethod.SIMPLE,
        slippageUsed: slippage
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Jupiter buy failed',
        dexUsed: DEXType.JUPITER,
        executionMethodUsed: params.executionMethod || ExecutionMethod.SIMPLE,
        slippageUsed: params.slippage || 1
      };
    }
  }

  /**
   * Execute a sell trade on Jupiter
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
      const slippage = params.slippage || 1; // Default 1% slippage
      const wallet = params.wallet || require("../../helpers/config").wallet;
      
      let amountToSell: number;

      if (params.tokenAmount) {
        amountToSell = params.tokenAmount;
      } else if (params.sellPercentage) {
        // Get current token balance
        const balance = await getSPLTokenBalance(
          connection, 
          new PublicKey(params.tokenAddress), 
          wallet.publicKey
        );
        amountToSell = balance * (params.sellPercentage / 100);
      } else {
        throw new Error('Either sellPercentage or tokenAmount must be provided');
      }

      // Jupiter sell function expects: tokenToSell, amountOfTokenToSell, slippage
      await jupiterSell(params.tokenAddress, amountToSell, slippage);

      return {
        success: true,
        signature: "jupiter-sell-success", // Jupiter doesn't return signature directly
        dexUsed: DEXType.JUPITER,
        executionMethodUsed: params.executionMethod || ExecutionMethod.SIMPLE,
        slippageUsed: slippage
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Jupiter sell failed',
        dexUsed: DEXType.JUPITER,
        executionMethodUsed: params.executionMethod || ExecutionMethod.SIMPLE,
        slippageUsed: params.slippage || 1
      };
    }
  }

  /**
   * Get price quote from Jupiter
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
      let priceImpact: number = 0; // Jupiter handles price impact internally
      
      if (params.side === TradeSide.BUY) {
        // Buying tokens with SOL
        outputAmount = params.amount / priceInSOL;
      } else {
        // Selling tokens for SOL
        outputAmount = params.amount * priceInSOL;
      }

      return {
        dex: DEXType.JUPITER,
        inputAmount: params.amount,
        outputAmount,
        priceImpact,
        estimatedSlippage: 1, // Default slippage estimate
        isValid: outputAmount > 0
      };

    } catch (error) {
      console.warn('Failed to get Jupiter quote:', error);
      return {
        dex: DEXType.JUPITER,
        inputAmount: params.amount,
        outputAmount: 0,
        priceImpact: 100,
        estimatedSlippage: 100,
        isValid: false
      };
    }
  }

  /**
   * Check if Jupiter supports the token
   * Jupiter is an aggregator, so it supports most tokens
   */
  async supportsToken(tokenAddress: string): Promise<boolean> {
    try {
      // Try to get price - if successful, token is supported
      await getCurrentPriceInSOL(tokenAddress);
      return true;
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
}

/**
 * Factory function to create Jupiter adapter
 */
export function createJupiterAdapter(): JupiterAdapter {
  return new JupiterAdapter();
}
