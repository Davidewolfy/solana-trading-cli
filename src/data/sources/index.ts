export * from './jupiter-source';
export * from './raydium-source';

import { DataAggregator, DEFAULT_VALIDATION_CONFIG } from '../data-aggregator';
import { createJupiterSource } from './jupiter-source';
import { createRaydiumSource } from './raydium-source';

/**
 * Factory function to create a configured data aggregator with all sources
 */
export function createDataAggregator(redisConfig?: { host: string; port: number; password?: string }): DataAggregator {
  const aggregator = new DataAggregator(DEFAULT_VALIDATION_CONFIG, redisConfig);
  
  // Register all available sources
  aggregator.registerSource(createJupiterSource());
  aggregator.registerSource(createRaydiumSource());
  
  return aggregator;
}
