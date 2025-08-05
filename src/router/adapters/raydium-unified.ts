import { DexAdapter, QuoteParams, Quote, TradeParams, TradeResult, SimulationResult } from '../types';
import { spawn } from 'child_process';
import * as path from 'path';

/**
 * Raydium Unified Adapter for Unified Router
 * Integrates with existing Raydium implementation
 */
export class RaydiumUnifiedAdapter implements DexAdapter {
  name = 'raydium' as const;
  private executorPath: string;

  constructor(config: { executorPath?: string } = {}) {
    this.executorPath = config.executorPath || path.join(process.cwd(), 'exec-rs', 'target', 'release', 'exec-rs');
  }

  async quote(params: QuoteParams): Promise<Quote> {
    const startTime = Date.now();
    
    try {
      // Use existing Raydium quote functionality
      const { getQuote } = await import('../../raydium/quote');
      
      const quoteResult = await getQuote({
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        amount: params.amount,
        slippageBps: params.slippageBps
      });

      const latencyMs = Date.now() - startTime;

      return {
        dex: this.name,
        expectedOut: quoteResult.outAmount,
        priceImpact: quoteResult.priceImpact || 0,
        routeInfo: {
          poolKeys: quoteResult.poolKeys,
          routePlan: quoteResult.routePlan,
          marketId: quoteResult.marketId
        },
        latencyMs,
        feesLamports: this.calculateFees(quoteResult),
        computeUnits: this.estimateComputeUnits(quoteResult),
        confidence: 0.85, // Raydium is generally reliable but less than Jupiter
        hops: this.calculateHops(quoteResult),
        slippageEstimate: quoteResult.priceImpact || 0,
        liquidityScore: this.calculateLiquidityScore(quoteResult)
      };

    } catch (error) {
      throw new Error(`Raydium quote failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async simulate(params: QuoteParams): Promise<SimulationResult> {
    try {
      // Get quote first
      const quote = await this.quote(params);
      
      // Use executor to simulate
      const result = await this.executeCommand('simulate', {
        ...params,
        routeInfo: quote.routeInfo,
        dex: 'raydium'
      });

      return {
        success: result.success,
        logs: result.logs,
        expectedOut: result.expectedOut,
        computeUnitsUsed: result.computeUnitsUsed,
        error: result.error
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Raydium simulation failed'
      };
    }
  }

  async trade(params: TradeParams): Promise<TradeResult> {
    try {
      // Get fresh quote
      const quote = await this.quote(params);
      
      if (params.dryRun) {
        const simulation = await this.simulate(params);
        return {
          dex: this.name,
          simulated: true,
          receivedAmount: simulation.expectedOut,
          success: simulation.success,
          error: simulation.error,
          idempotencyKey: params.idempotencyKey
        };
      }

      // Execute real trade using existing Raydium swap
      const { swap } = await import('../../raydium/swap');
      
      const swapResult = await swap({
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        amount: params.amount,
        slippageBps: params.slippageBps,
        mode: params.mode || 'simple',
        poolKeys: quote.routeInfo?.poolKeys
      });

      return {
        dex: this.name,
        signature: swapResult.signature,
        receivedAmount: swapResult.receivedAmount,
        slot: swapResult.slot,
        success: swapResult.success,
        error: swapResult.error,
        idempotencyKey: params.idempotencyKey
      };

    } catch (error) {
      return {
        dex: this.name,
        success: false,
        error: error instanceof Error ? error.message : 'Raydium trade failed',
        idempotencyKey: params.idempotencyKey
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Test with a small quote
      await this.quote({
        inputMint: 'So11111111111111111111111111111111111111112', // WSOL
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        amount: '1000000', // 0.001 SOL
        slippageBps: 50
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  private calculateFees(quoteResult: any): number {
    // Raydium typically has 0.25% trading fee
    const tradingFee = parseFloat(quoteResult.outAmount || '0') * 0.0025;
    const networkFee = 5000; // ~5000 lamports for transaction
    return Math.floor(tradingFee + networkFee);
  }

  private estimateComputeUnits(quoteResult: any): number {
    // Raydium swaps typically use 80-120k CU
    const baseUnits = 80000;
    const complexityMultiplier = quoteResult.routePlan?.length || 1;
    return baseUnits * complexityMultiplier;
  }

  private calculateHops(quoteResult: any): number {
    // Direct pool = 1 hop, routed = more hops
    return quoteResult.routePlan?.length || 1;
  }

  private calculateLiquidityScore(quoteResult: any): number {
    // Score based on pool liquidity and market depth
    // This is simplified - in reality you'd check pool reserves
    const priceImpact = quoteResult.priceImpact || 0;
    
    if (priceImpact < 0.1) return 0.9; // Very liquid
    if (priceImpact < 0.5) return 0.7; // Good liquidity
    if (priceImpact < 1.0) return 0.5; // Moderate liquidity
    if (priceImpact < 2.0) return 0.3; // Low liquidity
    return 0.1; // Very low liquidity
  }

  private async executeCommand(command: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const args = [
        '--cmd', command,
        '--dex', 'raydium',
        '--input-mint', params.inputMint,
        '--output-mint', params.outputMint,
        '--amount', params.amount,
        '--slippage-bps', params.slippageBps.toString()
      ];

      if (params.mode) {
        args.push('--mode', params.mode);
      }

      if (params.wallet) {
        args.push('--wallet', params.wallet);
      }

      if (params.idempotencyKey) {
        args.push('--idempotency-key', params.idempotencyKey);
      }

      if (params.routeInfo) {
        args.push('--route-info', JSON.stringify(params.routeInfo));
      }

      const child = spawn(this.executorPath, args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (error) {
            reject(new Error(`Failed to parse executor output: ${stdout}`));
          }
        } else {
          reject(new Error(`Executor failed with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to spawn executor: ${error.message}`));
      });
    });
  }
}

/**
 * Factory function to create Raydium unified adapter
 */
export function createRaydiumUnifiedAdapter(config?: { executorPath?: string }): RaydiumUnifiedAdapter {
  return new RaydiumUnifiedAdapter(config);
}
