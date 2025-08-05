/**
 * Unified Router Types
 * Common interfaces for all DEX adapters
 */

export type ExecutionMode = 'simple' | 'jito' | 'bloxroute';

export type DEXName = 'jupiter' | 'raydium' | 'orca' | 'meteora';

export interface QuoteParams {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;
}

export interface Quote {
  dex: DEXName;
  expectedOut: string;
  priceImpact: number;
  routeInfo?: unknown;
  latencyMs?: number;
  feesLamports?: number;
  computeUnits?: number;
  confidence: number; // 0-1 score
  hops: number; // Number of hops in the route
  slippageEstimate: number; // Estimated slippage %
  liquidityScore: number; // 0-1 liquidity confidence
}

export interface TradeParams extends QuoteParams {
  mode?: ExecutionMode;
  idempotencyKey?: string;
  dryRun?: boolean;
  wallet?: string; // Path to wallet file
}

export interface TradeResult {
  dex: DEXName;
  signature?: string;
  receivedAmount?: string;
  slot?: number;
  simulated?: boolean;
  success: boolean;
  error?: string;
  idempotencyKey?: string;
}

export interface SimulationResult {
  success: boolean;
  logs?: string[];
  expectedOut?: string;
  computeUnitsUsed?: number;
  error?: string;
}

export interface DexAdapter {
  name: DEXName;
  
  /**
   * Get quote for a trade
   */
  quote(params: QuoteParams): Promise<Quote>;
  
  /**
   * Simulate trade without execution
   */
  simulate?(params: QuoteParams): Promise<SimulationResult>;
  
  /**
   * Execute trade
   */
  trade(params: TradeParams): Promise<TradeResult>;
  
  /**
   * Health check for the adapter
   */
  healthCheck?(): Promise<boolean>;
}

export interface RouterConfig {
  defaultDex: DEXName;
  timeoutMs: number;
  maxRetries: number;
  enableParallelQuotes: boolean;
  scoringWeights: ScoringWeights;
}

export interface ScoringWeights {
  expectedOut: number;    // Weight for output amount
  priceImpact: number;    // Weight for price impact (negative)
  fees: number;           // Weight for fees (negative)
  latency: number;        // Weight for latency (negative)
  confidence: number;     // Weight for adapter confidence
  hops: number;           // Weight for route complexity (negative)
  computeUnits: number;   // Weight for compute cost (negative)
  liquidity: number;      // Weight for liquidity depth
}

export interface RouterStats {
  totalQuotes: number;
  totalTrades: number;
  successRate: number;
  averageLatency: number;
  dexUsage: Record<DEXName, number>;
  lastUpdated: number;
}

export const DEFAULT_ROUTER_CONFIG: RouterConfig = {
  defaultDex: 'jupiter',
  timeoutMs: 5000,
  maxRetries: 2,
  enableParallelQuotes: true,
  scoringWeights: {
    expectedOut: 0.4,
    priceImpact: -0.2,
    fees: -0.15,
    latency: -0.15,
    confidence: 0.1
  }
};

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  expectedOut: 0.35,
  priceImpact: -0.2,
  fees: -0.15,
  latency: -0.1,
  confidence: 0.1,
  hops: -0.05,
  computeUnits: -0.05,
  liquidity: 0.1
};
