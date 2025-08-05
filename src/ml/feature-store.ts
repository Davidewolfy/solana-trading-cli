/**
 * Feature Store for ML Trading Signals
 * 
 * Handles OHLCV, order book, funding data ingestion and feature engineering
 * Stores in Parquet with time partitioning for efficient querying
 */

import * as fs from 'fs';
import * as path from 'path';

export interface OHLCVData {
  timestamp: number;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: 'cex' | 'dex';
  exchange: string;
}

export interface OrderBookData {
  timestamp: number;
  symbol: string;
  bids: Array<[number, number]>; // [price, size]
  asks: Array<[number, number]>;
  imbalance: number; // (bid_vol - ask_vol) / (bid_vol + ask_vol)
  spread_bps: number;
  depth_1pct: number; // liquidity within 1% of mid
}

export interface FundingData {
  timestamp: number;
  symbol: string;
  funding_rate: number;
  predicted_rate: number;
  open_interest: number;
  perp_basis_bps: number; // (perp_price - spot_price) / spot_price * 10000
}

export interface FeatureVector {
  timestamp: number;
  symbol: string;
  
  // Price features
  momentum_5m: number;
  momentum_15m: number;
  momentum_60m: number;
  
  // Volatility regime
  vol_regime: 'low' | 'medium' | 'high';
  vol_zscore: number;
  
  // Order book features
  ob_imbalance: number;
  spread_zscore: number;
  depth_ratio: number;
  
  // Funding features
  funding_zscore: number;
  perp_basis_zscore: number;
  oi_change_1h: number;
  
  // Labels (for training)
  return_15m?: number; // Future return for labeling
  label_direction?: -1 | 0 | 1; // Strong down, neutral, strong up
  label_magnitude?: 'small' | 'medium' | 'large';
}

export class FeatureStore {
  private dataPath: string;
  private cache = new Map<string, any[]>();
  
  constructor(dataPath = './data/features') {
    this.dataPath = dataPath;
    this.ensureDirectories();
  }

  /**
   * Ingest OHLCV data with validation
   */
  async ingestOHLCV(data: OHLCVData[]): Promise<void> {
    console.log(`📊 Ingesting ${data.length} OHLCV records`);
    
    // Validate data
    const validated = this.validateOHLCV(data);
    
    // Partition by date
    const partitions = this.partitionByDate(validated, 'ohlcv');
    
    // Store each partition
    for (const [partition, records] of partitions) {
      await this.storePartition('ohlcv', partition, records);
    }
    
    console.log(`✅ Stored OHLCV data in ${partitions.size} partitions`);
  }

  /**
   * Ingest order book data
   */
  async ingestOrderBook(data: OrderBookData[]): Promise<void> {
    console.log(`📈 Ingesting ${data.length} order book records`);
    
    const validated = this.validateOrderBook(data);
    const partitions = this.partitionByDate(validated, 'orderbook');
    
    for (const [partition, records] of partitions) {
      await this.storePartition('orderbook', partition, records);
    }
    
    console.log(`✅ Stored order book data in ${partitions.size} partitions`);
  }

  /**
   * Ingest funding data
   */
  async ingestFunding(data: FundingData[]): Promise<void> {
    console.log(`💰 Ingesting ${data.length} funding records`);
    
    const validated = this.validateFunding(data);
    const partitions = this.partitionByDate(validated, 'funding');
    
    for (const [partition, records] of partitions) {
      await this.storePartition('funding', partition, records);
    }
    
    console.log(`✅ Stored funding data in ${partitions.size} partitions`);
  }

  /**
   * Generate features from raw data
   */
  async generateFeatures(
    symbol: string,
    startTime: number,
    endTime: number
  ): Promise<FeatureVector[]> {
    console.log(`🔧 Generating features for ${symbol} from ${new Date(startTime)} to ${new Date(endTime)}`);
    
    // Load raw data
    const ohlcv = await this.loadOHLCV(symbol, startTime, endTime);
    const orderbook = await this.loadOrderBook(symbol, startTime, endTime);
    const funding = await this.loadFunding(symbol, startTime, endTime);
    
    if (ohlcv.length === 0) {
      console.warn(`⚠️ No OHLCV data found for ${symbol}`);
      return [];
    }
    
    const features: FeatureVector[] = [];
    
    for (let i = 60; i < ohlcv.length; i++) { // Need 60 periods for features
      const current = ohlcv[i];
      const feature = await this.computeFeatureVector(
        current,
        ohlcv.slice(i - 60, i + 1),
        orderbook,
        funding
      );
      
      if (feature) {
        features.push(feature);
      }
    }
    
    console.log(`✅ Generated ${features.length} feature vectors`);
    return features;
  }

  /**
   * Add labels for supervised learning
   */
  async addLabels(
    features: FeatureVector[],
    lookAheadMinutes = 15
  ): Promise<FeatureVector[]> {
    console.log(`🏷️ Adding labels with ${lookAheadMinutes}m look-ahead`);
    
    const labeled = features.map((feature, i) => {
      // Find future price for labeling
      const futureTime = feature.timestamp + (lookAheadMinutes * 60 * 1000);
      const futureFeature = features.find(f => 
        f.symbol === feature.symbol && 
        Math.abs(f.timestamp - futureTime) < 60000 // Within 1 minute
      );
      
      if (!futureFeature) {
        return feature; // No future data available
      }
      
      // Calculate return
      const currentPrice = this.getPriceFromTimestamp(feature.timestamp, feature.symbol);
      const futurePrice = this.getPriceFromTimestamp(futureFeature.timestamp, feature.symbol);
      
      if (!currentPrice || !futurePrice) {
        return feature;
      }
      
      const return15m = (futurePrice - currentPrice) / currentPrice;
      
      // Create labels
      let label_direction: -1 | 0 | 1 = 0;
      let label_magnitude: 'small' | 'medium' | 'large' = 'small';
      
      const absReturn = Math.abs(return15m);
      
      // Direction
      if (return15m > 0.002) label_direction = 1; // > 0.2%
      else if (return15m < -0.002) label_direction = -1; // < -0.2%
      
      // Magnitude
      if (absReturn > 0.01) label_magnitude = 'large'; // > 1%
      else if (absReturn > 0.005) label_magnitude = 'medium'; // > 0.5%
      
      return {
        ...feature,
        return_15m: return15m,
        label_direction,
        label_magnitude
      };
    });
    
    const labeledCount = labeled.filter(f => f.return_15m !== undefined).length;
    console.log(`✅ Added labels to ${labeledCount}/${features.length} features`);
    
    return labeled;
  }

  private async computeFeatureVector(
    current: OHLCVData,
    ohlcvWindow: OHLCVData[],
    orderbook: OrderBookData[],
    funding: FundingData[]
  ): Promise<FeatureVector | null> {
    try {
      // Price momentum features
      const prices = ohlcvWindow.map(d => d.close);
      const momentum_5m = this.calculateMomentum(prices, 5);
      const momentum_15m = this.calculateMomentum(prices, 15);
      const momentum_60m = this.calculateMomentum(prices, 60);
      
      // Volatility features
      const returns = this.calculateReturns(prices);
      const vol_zscore = this.calculateZScore(returns.slice(-20)); // 20-period volatility
      const vol_regime = this.classifyVolatilityRegime(vol_zscore);
      
      // Order book features (find closest in time)
      const closestOB = this.findClosestData(orderbook, current.timestamp);
      const ob_imbalance = closestOB?.imbalance || 0;
      const spread_zscore = closestOB ? this.calculateSpreadZScore(closestOB.spread_bps) : 0;
      const depth_ratio = closestOB?.depth_1pct || 0;
      
      // Funding features
      const closestFunding = this.findClosestData(funding, current.timestamp);
      const funding_zscore = closestFunding ? this.calculateFundingZScore(closestFunding.funding_rate) : 0;
      const perp_basis_zscore = closestFunding ? this.calculateZScore([closestFunding.perp_basis_bps]) : 0;
      const oi_change_1h = closestFunding ? this.calculateOIChange(closestFunding, funding) : 0;
      
      return {
        timestamp: current.timestamp,
        symbol: current.symbol,
        momentum_5m,
        momentum_15m,
        momentum_60m,
        vol_regime,
        vol_zscore,
        ob_imbalance,
        spread_zscore,
        depth_ratio,
        funding_zscore,
        perp_basis_zscore,
        oi_change_1h
      };
      
    } catch (error) {
      console.error('Error computing feature vector:', error);
      return null;
    }
  }

  private calculateMomentum(prices: number[], periods: number): number {
    if (prices.length < periods + 1) return 0;
    const current = prices[prices.length - 1];
    const past = prices[prices.length - 1 - periods];
    return (current - past) / past;
  }

  private calculateReturns(prices: number[]): number[] {
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    return returns;
  }

  private calculateZScore(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);
    return std === 0 ? 0 : (values[values.length - 1] - mean) / std;
  }

  private classifyVolatilityRegime(zscore: number): 'low' | 'medium' | 'high' {
    if (Math.abs(zscore) < 0.5) return 'low';
    if (Math.abs(zscore) < 1.5) return 'medium';
    return 'high';
  }

  private findClosestData<T extends { timestamp: number }>(
    data: T[],
    targetTime: number
  ): T | null {
    if (data.length === 0) return null;
    
    let closest = data[0];
    let minDiff = Math.abs(data[0].timestamp - targetTime);
    
    for (const item of data) {
      const diff = Math.abs(item.timestamp - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = item;
      }
    }
    
    return minDiff < 300000 ? closest : null; // Within 5 minutes
  }

  private calculateSpreadZScore(spread: number): number {
    // Simplified - in practice, maintain rolling window of spreads
    return spread > 10 ? 1 : (spread > 5 ? 0.5 : 0);
  }

  private calculateFundingZScore(rate: number): number {
    // Simplified - in practice, maintain rolling window of funding rates
    return Math.abs(rate) > 0.01 ? (rate > 0 ? 1 : -1) : 0;
  }

  private calculateOIChange(current: FundingData, history: FundingData[]): number {
    const oneHourAgo = current.timestamp - 3600000;
    const pastOI = history.find(f => 
      f.symbol === current.symbol && 
      Math.abs(f.timestamp - oneHourAgo) < 300000
    );
    
    if (!pastOI) return 0;
    return (current.open_interest - pastOI.open_interest) / pastOI.open_interest;
  }

  private validateOHLCV(data: OHLCVData[]): OHLCVData[] {
    return data.filter(d => 
      d.timestamp > 0 &&
      d.open > 0 && d.high > 0 && d.low > 0 && d.close > 0 &&
      d.high >= Math.max(d.open, d.close) &&
      d.low <= Math.min(d.open, d.close) &&
      d.volume >= 0
    );
  }

  private validateOrderBook(data: OrderBookData[]): OrderBookData[] {
    return data.filter(d =>
      d.timestamp > 0 &&
      d.bids.length > 0 && d.asks.length > 0 &&
      d.bids[0][0] < d.asks[0][0] && // bid < ask
      Math.abs(d.imbalance) <= 1 &&
      d.spread_bps >= 0
    );
  }

  private validateFunding(data: FundingData[]): FundingData[] {
    return data.filter(d =>
      d.timestamp > 0 &&
      Math.abs(d.funding_rate) < 0.1 && // Reasonable funding rate
      d.open_interest >= 0
    );
  }

  private partitionByDate<T extends { timestamp: number }>(
    data: T[],
    type: string
  ): Map<string, T[]> {
    const partitions = new Map<string, T[]>();
    
    for (const record of data) {
      const date = new Date(record.timestamp);
      const partition = `${type}_${date.getFullYear()}_${String(date.getMonth() + 1).padStart(2, '0')}_${String(date.getDate()).padStart(2, '0')}`;
      
      if (!partitions.has(partition)) {
        partitions.set(partition, []);
      }
      partitions.get(partition)!.push(record);
    }
    
    return partitions;
  }

  private async storePartition(type: string, partition: string, data: any[]): Promise<void> {
    const partitionPath = path.join(this.dataPath, type, partition);
    await fs.promises.mkdir(path.dirname(partitionPath), { recursive: true });
    
    // In production, use proper Parquet library
    // For now, store as JSON
    await fs.promises.writeFile(
      `${partitionPath}.json`,
      JSON.stringify(data, null, 2)
    );
  }

  private async loadOHLCV(symbol: string, startTime: number, endTime: number): Promise<OHLCVData[]> {
    // Simplified loader - in production, query Parquet files efficiently
    return [];
  }

  private async loadOrderBook(symbol: string, startTime: number, endTime: number): Promise<OrderBookData[]> {
    return [];
  }

  private async loadFunding(symbol: string, startTime: number, endTime: number): Promise<FundingData[]> {
    return [];
  }

  private getPriceFromTimestamp(timestamp: number, symbol: string): number | null {
    // Simplified - in practice, query OHLCV data
    return null;
  }

  private ensureDirectories(): void {
    const dirs = ['ohlcv', 'orderbook', 'funding', 'features'];
    for (const dir of dirs) {
      const fullPath = path.join(this.dataPath, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    }
  }
}

export function createFeatureStore(dataPath?: string): FeatureStore {
  return new FeatureStore(dataPath);
}
