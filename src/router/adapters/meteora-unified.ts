import { DexAdapter, QuoteParams, Quote, TradeParams, TradeResult, SimulationResult } from '../types';
import { spawn } from 'child_process';
import * as path from 'path';

/**
 * Meteora Unified Adapter for Unified Router
 * Integrates with existing Meteora implementation
 */
export class MeteoraUnifiedAdapter implements DexAdapter {
  name = 'meteora' as const;
  private executorPath: string;

  constructor(config: { executorPath?: string } = {}) {
    this.executorPath = config.executorPath || path.join(process.cwd(), 'exec-rs', 'target', 'release', 'exec-rs');
  }

  async quote(params: QuoteParams): Promise<Quote> {
    const startTime = Date.now();
    
    try {
      // Use existing Meteora quote functionality
      const { getQuote } = await import('../../meteora/quote');
      
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
          pools: quoteResult.pools,
          route: quoteResult.route,
          poolType: quoteResult.poolType // DLMM, Stable, etc.
        },
        latencyMs,
        feesLamports: this.calculateFees(quoteResult),
        computeUnits: this.estimateComputeUnits(quoteResult),
        confidence: 0.82, // Meteora is reliable but newer
        hops: this.calculateHops(quoteResult),
        slippageEstimate: quoteResult.priceImpact || 0,
        liquidityScore: this.calculateLiquidityScore(quoteResult)
      };

    } catch (error) {
      throw new Error(`Meteora quote failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        dex: 'meteora'
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
        error: error instanceof Error ? error.message : 'Meteora simulation failed'
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

      // Execute real trade using existing Meteora swap
      const { swap } = await import('../../meteora/swap');
      
      const swapResult = await swap({
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        amount: params.amount,
        slippageBps: params.slippageBps,
        mode: params.mode || 'simple',
        pools: quote.routeInfo?.pools,
        poolType: quote.routeInfo?.poolType
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
        error: error instanceof Error ? error.message : 'Meteora trade failed',
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
    // Meteora has different fee structures:
    // - DLMM pools: dynamic fees based on volatility
    // - Stable pools: lower fees ~0.04%
    // - Standard pools: ~0.25%
    
    const poolType = quoteResult.poolType || 'standard';
    let feeRate = 0.0025; // Default 0.25%
    
    switch (poolType.toLowerCase()) {
      case 'dlmm':
        feeRate = 0.003; // ~0.3% average for DLMM
        break;
      case 'stable':
        feeRate = 0.0004; // 0.04% for stable pools
        break;
      case 'standard':
      default:
        feeRate = 0.0025; // 0.25% for standard
        break;
    }
    
    const tradingFee = parseFloat(quoteResult.outAmount || '0') * feeRate;
    const networkFee = 5000; // ~5000 lamports for transaction
    return Math.floor(tradingFee + networkFee);
  }

  private estimateComputeUnits(quoteResult: any): number {
    // Meteora compute units vary by pool type
    const poolType = quoteResult.poolType || 'standard';
    const hops = this.calculateHops(quoteResult);
    
    let baseUnits = 70000; // Base for standard pools
    
    switch (poolType.toLowerCase()) {
      case 'dlmm':
        baseUnits = 120000; // DLMM pools are more complex
        break;
      case 'stable':
        baseUnits = 60000; // Stable pools are simpler
        break;
      case 'standard':
      default:
        baseUnits = 70000;
        break;
    }
    
    return baseUnits * hops;
  }

  private calculateHops(quoteResult: any): number {
    // Count pools in the route
    return quoteResult.pools?.length || 1;
  }

  private calculateLiquidityScore(quoteResult: any): number {
    // Meteora liquidity scoring based on pool type and price impact
    const priceImpact = quoteResult.priceImpact || 0;
    const poolType = quoteResult.poolType || 'standard';
    const hops = this.calculateHops(quoteResult);
    
    let baseScore = 0.75; // Meteora baseline
    
    // Pool type adjustments
    switch (poolType.toLowerCase()) {
      case 'dlmm':
        baseScore += 0.1; // DLMM pools often have better liquidity
        break;
      case 'stable':
        baseScore += 0.05; // Stable pools are reliable
        break;
    }
    
    // Price impact adjustments
    if (priceImpact < 0.1) baseScore += 0.1;
    else if (priceImpact > 1.0) baseScore -= 0.2;
    else if (priceImpact > 0.5) baseScore -= 0.1;
    
    // Route complexity adjustments
    if (hops === 1) baseScore += 0.05;
    else if (hops > 2) baseScore -= 0.1;
    
    return Math.max(0.1, Math.min(0.9, baseScore));
  }

  private async executeCommand(command: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const args = [
        '--cmd', command,
        '--dex', 'meteora',
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
 * Factory function to create Meteora unified adapter
 */
export function createMeteoraUnifiedAdapter(config?: { executorPath?: string }): MeteoraUnifiedAdapter {
  return new MeteoraUnifiedAdapter(config);
}
