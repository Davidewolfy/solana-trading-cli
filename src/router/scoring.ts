import { Quote, ScoringWeights, DEFAULT_SCORING_WEIGHTS } from './types';

/**
 * Quote Scoring System
 * Evaluates quotes based on multiple factors to select the best route
 */

export interface QuoteScore {
  quote: Quote;
  score: number;
  breakdown: {
    expectedOut: number;
    priceImpact: number;
    fees: number;
    latency: number;
    confidence: number;
    hops: number;
    computeUnits: number;
    liquidity: number;
    total: number;
  };
}

/**
 * Score a single quote based on weighted factors
 */
export function scoreQuote(
  quote: Quote, 
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS,
  baseline?: { maxOut: number; minLatency: number; minFees: number }
): QuoteScore {
  // Normalize values for scoring (0-1 scale)
  const normalizedOut = baseline?.maxOut 
    ? parseFloat(quote.expectedOut) / baseline.maxOut 
    : 1;
  
  const normalizedPriceImpact = Math.max(0, 1 - (quote.priceImpact / 100)); // Lower impact = higher score
  
  const normalizedFees = baseline?.minFees && quote.feesLamports
    ? Math.max(0, 1 - ((quote.feesLamports - baseline.minFees) / baseline.minFees))
    : 0.5; // Default neutral score if no fee info
  
  const normalizedLatency = baseline?.minLatency && quote.latencyMs
    ? Math.max(0, 1 - ((quote.latencyMs - baseline.minLatency) / baseline.minLatency))
    : 0.5; // Default neutral score if no latency info
  
  const normalizedConfidence = quote.confidence;

  const normalizedHops = Math.max(0, 1 - ((quote.hops - 1) / 4)); // 1 hop = 1.0, 5+ hops = 0

  const normalizedComputeUnits = baseline?.maxOut && quote.computeUnits
    ? Math.max(0, 1 - (quote.computeUnits / 400000)) // Normalize against 400k CU limit
    : 0.5;

  const normalizedLiquidity = quote.liquidityScore;

  // Calculate weighted scores
  const breakdown = {
    expectedOut: normalizedOut * weights.expectedOut,
    priceImpact: normalizedPriceImpact * Math.abs(weights.priceImpact),
    fees: normalizedFees * Math.abs(weights.fees),
    latency: normalizedLatency * Math.abs(weights.latency),
    confidence: normalizedConfidence * weights.confidence,
    hops: normalizedHops * Math.abs(weights.hops),
    computeUnits: normalizedComputeUnits * Math.abs(weights.computeUnits),
    liquidity: normalizedLiquidity * weights.liquidity,
    total: 0
  };

  breakdown.total = Object.values(breakdown).reduce((sum, val) => sum + val, 0) - breakdown.total;

  return {
    quote,
    score: breakdown.total,
    breakdown
  };
}

/**
 * Score multiple quotes and return sorted by best score
 */
export function scoreQuotes(
  quotes: Quote[], 
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS
): QuoteScore[] {
  if (quotes.length === 0) return [];

  // Calculate baseline values for normalization
  const baseline = {
    maxOut: Math.max(...quotes.map(q => parseFloat(q.expectedOut))),
    minLatency: Math.min(...quotes.filter(q => q.latencyMs).map(q => q.latencyMs!)),
    minFees: Math.min(...quotes.filter(q => q.feesLamports).map(q => q.feesLamports!))
  };

  // Score all quotes
  const scoredQuotes = quotes.map(quote => scoreQuote(quote, weights, baseline));

  // Sort by score (highest first)
  return scoredQuotes.sort((a, b) => b.score - a.score);
}

/**
 * Get the best quote from a list
 */
export function getBestQuote(
  quotes: Quote[], 
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS
): Quote | null {
  const scored = scoreQuotes(quotes, weights);
  return scored.length > 0 ? scored[0].quote : null;
}

/**
 * Filter quotes by minimum quality thresholds
 */
export function filterQuotesByQuality(
  quotes: Quote[],
  thresholds: {
    minExpectedOut?: string;
    maxPriceImpact?: number;
    maxLatency?: number;
    minConfidence?: number;
  }
): Quote[] {
  return quotes.filter(quote => {
    // Check minimum expected output
    if (thresholds.minExpectedOut && 
        parseFloat(quote.expectedOut) < parseFloat(thresholds.minExpectedOut)) {
      return false;
    }

    // Check maximum price impact
    if (thresholds.maxPriceImpact && quote.priceImpact > thresholds.maxPriceImpact) {
      return false;
    }

    // Check maximum latency
    if (thresholds.maxLatency && quote.latencyMs && quote.latencyMs > thresholds.maxLatency) {
      return false;
    }

    // Check minimum confidence
    if (thresholds.minConfidence && quote.confidence < thresholds.minConfidence) {
      return false;
    }

    return true;
  });
}

/**
 * Compare two quotes and return the better one
 */
export function compareQuotes(
  quoteA: Quote, 
  quoteB: Quote, 
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS
): Quote {
  const scoreA = scoreQuote(quoteA, weights);
  const scoreB = scoreQuote(quoteB, weights);
  
  return scoreA.score >= scoreB.score ? quoteA : quoteB;
}

/**
 * Calculate quote efficiency score (output per unit of cost)
 */
export function calculateEfficiency(quote: Quote): number {
  const output = parseFloat(quote.expectedOut);
  const totalCost = (quote.feesLamports || 0) + (quote.priceImpact * output / 100);
  
  return totalCost > 0 ? output / totalCost : output;
}

/**
 * Get quote statistics for analysis
 */
export function getQuoteStats(quotes: Quote[]): {
  count: number;
  avgExpectedOut: number;
  avgPriceImpact: number;
  avgLatency: number;
  avgConfidence: number;
  bestDex: string;
  spread: number; // Difference between best and worst output
} {
  if (quotes.length === 0) {
    return {
      count: 0,
      avgExpectedOut: 0,
      avgPriceImpact: 0,
      avgLatency: 0,
      avgConfidence: 0,
      bestDex: '',
      spread: 0
    };
  }

  const outputs = quotes.map(q => parseFloat(q.expectedOut));
  const impacts = quotes.map(q => q.priceImpact);
  const latencies = quotes.filter(q => q.latencyMs).map(q => q.latencyMs!);
  const confidences = quotes.map(q => q.confidence);

  const maxOutput = Math.max(...outputs);
  const minOutput = Math.min(...outputs);
  
  const bestQuote = quotes.find(q => parseFloat(q.expectedOut) === maxOutput);

  return {
    count: quotes.length,
    avgExpectedOut: outputs.reduce((sum, val) => sum + val, 0) / outputs.length,
    avgPriceImpact: impacts.reduce((sum, val) => sum + val, 0) / impacts.length,
    avgLatency: latencies.length > 0 ? latencies.reduce((sum, val) => sum + val, 0) / latencies.length : 0,
    avgConfidence: confidences.reduce((sum, val) => sum + val, 0) / confidences.length,
    bestDex: bestQuote?.dex || '',
    spread: ((maxOutput - minOutput) / maxOutput) * 100
  };
}
