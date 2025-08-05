import { DexAdapter, QuoteParams, Quote, TradeParams, TradeResult, SimulationResult } from '../types';
import { spawn } from 'child_process';
import * as path from 'path';

/**
 * Orca Unified Adapter for Unified Router
 * Integrates with existing Orca implementation
 */
export class OrcaUnifiedAdapter implements DexAdapter {
  name = 'orca' as const;
  private executorPath: string;

  constructor(config: { executorPath?: string } = {}) {
    this.executorPath = config.executorPath || path.join(process.cwd(), 'exec-rs', 'target', 'release', 'exec-rs');
  }

  async quote(params: QuoteParams): Promise<Quote> {
    const startTime = Date.now();
    
    try {
      // Use existing Orca quote functionality
      const { getQuote } = await import('../../orca/quote');
      
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
          whirlpools: quoteResult.whirlpools,
          route: quoteResult.route,
          tickArrays: quoteResult.tickArrays
        },
        latencyMs,
        feesLamports: this.calculateFees(quoteResult),
        computeUnits: this.estimateComputeUnits(quoteResult),
        confidence: 0.88, // Orca Whirlpools are very reliable
        hops: this.calculateHops(quoteResult),
        slippageEstimate: quoteResult.priceImpact || 0,
        liquidityScore: this.calculateLiquidityScore(quoteResult)
      };

    } catch (error) {
      throw new Error(`Orca quote failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        dex: 'orca'
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
        error: error instanceof Error ? error.message : 'Orca simulation failed'
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

      // Execute real trade using existing Orca swap
      const { swap } = await import('../../orca/swap');
      
      const swapResult = await swap({
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        amount: params.amount,
        slippageBps: params.slippageBps,
        mode: params.mode || 'simple',
        whirlpools: quote.routeInfo?.whirlpools
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
        error: error instanceof Error ? error.message : 'Orca trade failed',
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
    // Orca Whirlpools have variable fees (0.01%, 0.05%, 0.3%, 1%)
    // Estimate based on typical 0.3% fee tier
    const tradingFee = parseFloat(quoteResult.outAmount || '0') * 0.003;
    const networkFee = 5000; // ~5000 lamports for transaction
    return Math.floor(tradingFee + networkFee);
  }

  private estimateComputeUnits(quoteResult: any): number {
    // Orca Whirlpool swaps typically use 90-150k CU
    const baseUnits = 90000;
    const hopMultiplier = this.calculateHops(quoteResult);
    const tickArrayMultiplier = quoteResult.tickArrays?.length || 1;
    
    return baseUnits * hopMultiplier * Math.min(tickArrayMultiplier, 3);
  }

  private calculateHops(quoteResult: any): number {
    // Count whirlpools in the route
    return quoteResult.whirlpools?.length || 1;
  }

  private calculateLiquidityScore(quoteResult: any): number {
    // Orca Whirlpools generally have good liquidity
    // Score based on price impact and route complexity
    const priceImpact = quoteResult.priceImpact || 0;
    const hops = this.calculateHops(quoteResult);
    
    let baseScore = 0.8; // Orca baseline
    
    // Adjust for price impact
    if (priceImpact < 0.1) baseScore += 0.1;
    else if (priceImpact > 1.0) baseScore -= 0.2;
    else if (priceImpact > 0.5) baseScore -= 0.1;
    
    // Adjust for route complexity
    if (hops === 1) baseScore += 0.1;
    else if (hops > 2) baseScore -= 0.1;
    
    return Math.max(0.1, Math.min(0.95, baseScore));
  }

  private async executeCommand(command: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const args = [
        '--cmd', command,
        '--dex', 'orca',
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
 * Factory function to create Orca unified adapter
 */
export function createOrcaUnifiedAdapter(config?: { executorPath?: string }): OrcaUnifiedAdapter {
  return new OrcaUnifiedAdapter(config);
}
