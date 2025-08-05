import axios from 'axios';
import { DataSource, PriceData, QuoteData, QuoteParams } from '../data-aggregator';

/**
 * Jupiter data source implementation
 */
export class JupiterDataSource implements DataSource {
  id = 'jupiter';
  name = 'Jupiter Aggregator';
  priority = 1; // Highest priority
  timeout = 5000;
  enabled = true;

  private baseUrl = 'https://quote-api.jup.ag/v6';
  private priceUrl = 'https://price.jup.ag/v4';

  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/health`, { timeout: 3000 });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  async getPrice(tokenAddress: string): Promise<PriceData> {
    try {
      const response = await axios.get(`${this.priceUrl}/price`, {
        params: { ids: tokenAddress },
        timeout: this.timeout
      });

      const priceInfo = response.data.data[tokenAddress];
      if (!priceInfo) {
        throw new Error(`Price not found for token ${tokenAddress}`);
      }

      return {
        price: priceInfo.price,
        source: this.id,
        timestamp: Date.now(),
        confidence: 0.9, // Jupiter is generally reliable
        volume24h: priceInfo.volume24h,
        liquidity: priceInfo.liquidity
      };
    } catch (error) {
      throw new Error(`Jupiter price fetch failed: ${error}`);
    }
  }

  async getQuote(params: QuoteParams): Promise<QuoteData> {
    try {
      const response = await axios.get(`${this.baseUrl}/quote`, {
        params: {
          inputMint: params.inputMint,
          outputMint: params.outputMint,
          amount: params.amount,
          slippageBps: Math.round(params.slippage * 100), // Convert to basis points
          onlyDirectRoutes: false,
          asLegacyTransaction: false
        },
        timeout: this.timeout
      });

      const quote = response.data;

      return {
        inputAmount: parseInt(quote.inAmount),
        outputAmount: parseInt(quote.outAmount),
        priceImpact: parseFloat(quote.priceImpactPct || '0'),
        route: quote.routePlan || [],
        source: this.id,
        timestamp: Date.now(),
        confidence: 0.9
      };
    } catch (error) {
      throw new Error(`Jupiter quote fetch failed: ${error}`);
    }
  }
}

export function createJupiterSource(): JupiterDataSource {
  return new JupiterDataSource();
}
