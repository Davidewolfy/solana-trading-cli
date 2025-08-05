import axios from 'axios';
import { DexAdapter, QuoteParams, Quote, TradeParams, TradeResult, SimulationResult } from '../types';
import { spawn } from 'child_process';
import * as path from 'path';

/**
 * Jupiter Adapter for Unified Router
 * Implements the new DexAdapter interface
 */
export class JupiterUnifiedAdapter implements DexAdapter {
  name = 'jupiter' as const;
  private baseUrl = 'https://quote-api.jup.ag/v6';
  private executorPath: string;

  constructor(config: { executorPath?: string } = {}) {
    this.executorPath = config.executorPath || path.join(process.cwd(), 'exec-rs', 'target', 'release', 'exec-rs');
  }

  async quote(params: QuoteParams): Promise<Quote> {
    const startTime = Date.now();
    
    try {
      const response = await axios.get(`${this.baseUrl}/quote`, {
        params: {
          inputMint: params.inputMint,
          outputMint: params.outputMint,
          amount: params.amount,
          slippageBps: params.slippageBps,
          onlyDirectRoutes: false,
          asLegacyTransaction: false
        },
        timeout: 5000
      });

      const data = response.data;
      const latencyMs = Date.now() - startTime;

      return {
        dex: this.name,
        expectedOut: data.outAmount,
        priceImpact: parseFloat(data.priceImpactPct || '0'),
        routeInfo: {
          routePlan: data.routePlan,
          contextSlot: data.contextSlot,
          timeTaken: data.timeTaken,
          swapTransaction: data.swapTransaction
        },
        latencyMs,
        feesLamports: this.calculateFees(data),
        computeUnits: this.estimateComputeUnits(data),
        confidence: 0.9 // Jupiter is generally reliable
      };

    } catch (error) {
      throw new Error(`Jupiter quote failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async simulate(params: QuoteParams): Promise<SimulationResult> {
    try {
      // First get the quote to build transaction
      const quote = await this.quote(params);
      
      // Use executor to simulate
      const result = await this.executeCommand('simulate', {
        ...params,
        routeInfo: quote.routeInfo
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
        error: error instanceof Error ? error.message : 'Simulation failed'
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

      // Execute real trade
      const result = await this.executeCommand('swap', {
        ...params,
        routeInfo: quote.routeInfo,
        mode: params.mode || 'simple'
      });

      return {
        dex: this.name,
        signature: result.signature,
        receivedAmount: result.receivedAmount,
        slot: result.slot,
        success: result.success,
        error: result.error,
        idempotencyKey: params.idempotencyKey
      };

    } catch (error) {
      return {
        dex: this.name,
        success: false,
        error: error instanceof Error ? error.message : 'Trade failed',
        idempotencyKey: params.idempotencyKey
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/health`, { timeout: 3000 });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  private calculateFees(jupiterData: any): number {
    // Extract fees from Jupiter response
    // This is simplified - in reality you'd parse the route plan
    const platformFee = jupiterData.platformFee || 0;
    const routingFee = jupiterData.routingFee || 0;
    return platformFee + routingFee;
  }

  private estimateComputeUnits(jupiterData: any): number {
    // Estimate compute units based on route complexity
    const routePlan = jupiterData.routePlan || [];
    const baseUnits = 50000; // Base compute units
    const perSwapUnits = 30000; // Additional units per swap
    
    return baseUnits + (routePlan.length * perSwapUnits);
  }

  private async executeCommand(command: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const args = [
        '--cmd', command,
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
 * Factory function to create Jupiter unified adapter
 */
export function createJupiterUnifiedAdapter(config?: { executorPath?: string }): JupiterUnifiedAdapter {
  return new JupiterUnifiedAdapter(config);
}
