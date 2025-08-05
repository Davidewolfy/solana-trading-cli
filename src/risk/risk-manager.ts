import { EventEmitter } from 'events';
import { PublicKey } from '@solana/web3.js';

/**
 * Risk Management System with hard limits and kill switch
 */

export interface RiskLimits {
  // Position limits
  maxPositionSize: number;        // Max position size in USD
  maxDailyVolume: number;         // Max daily trading volume in USD
  maxDailyTrades: number;         // Max number of trades per day
  
  // Loss limits
  maxDailyLoss: number;           // Max daily loss in USD
  maxDrawdown: number;            // Max drawdown percentage
  stopLossThreshold: number;      // Stop loss threshold percentage
  
  // Concentration limits
  maxTokenConcentration: number;  // Max % of portfolio in single token
  maxDEXConcentration: number;    // Max % of volume through single DEX
  
  // Operational limits
  maxSlippage: number;            // Max allowed slippage percentage
  minLiquidity: number;           // Min required liquidity in USD
  maxGasPrice: number;            // Max gas price in microlamports
}

export interface RiskMetrics {
  currentPositions: Map<string, number>;
  dailyVolume: number;
  dailyTrades: number;
  dailyPnL: number;
  currentDrawdown: number;
  portfolioValue: number;
  lastResetTime: number;
}

export interface RiskViolation {
  type: string;
  severity: 'warning' | 'critical';
  message: string;
  currentValue: number;
  limit: number;
  timestamp: number;
}

export enum KillSwitchReason {
  MANUAL = 'manual',
  DAILY_LOSS_LIMIT = 'daily_loss_limit',
  DRAWDOWN_LIMIT = 'drawdown_limit',
  POSITION_LIMIT = 'position_limit',
  SYSTEM_ERROR = 'system_error',
  EXTERNAL_SIGNAL = 'external_signal'
}

export class RiskManager extends EventEmitter {
  private limits: RiskLimits;
  private metrics: RiskMetrics;
  private killSwitchActive = false;
  private killSwitchReason?: KillSwitchReason;
  private violations: RiskViolation[] = [];
  private monitoringInterval?: NodeJS.Timeout;

  constructor(limits: RiskLimits) {
    super();
    this.limits = limits;
    this.metrics = {
      currentPositions: new Map(),
      dailyVolume: 0,
      dailyTrades: 0,
      dailyPnL: 0,
      currentDrawdown: 0,
      portfolioValue: 0,
      lastResetTime: Date.now()
    };
    
    this.startMonitoring();
  }

  /**
   * Check if trade is allowed
   */
  async checkTradeAllowed(params: {
    tokenAddress: string;
    side: 'buy' | 'sell';
    amount: number;
    estimatedValue: number;
    slippage: number;
    dex: string;
  }): Promise<{ allowed: boolean; violations: RiskViolation[] }> {
    const violations: RiskViolation[] = [];

    // Check kill switch
    if (this.killSwitchActive) {
      violations.push({
        type: 'kill_switch',
        severity: 'critical',
        message: `Kill switch active: ${this.killSwitchReason}`,
        currentValue: 1,
        limit: 0,
        timestamp: Date.now()
      });
    }

    // Check daily limits
    this.checkDailyLimits(params, violations);
    
    // Check position limits
    this.checkPositionLimits(params, violations);
    
    // Check slippage limits
    this.checkSlippageLimits(params, violations);
    
    // Check concentration limits
    this.checkConcentrationLimits(params, violations);

    const criticalViolations = violations.filter(v => v.severity === 'critical');
    const allowed = criticalViolations.length === 0 && !this.killSwitchActive;

    // Store violations
    this.violations.push(...violations);
    
    // Emit events for violations
    violations.forEach(violation => {
      this.emit('riskViolation', violation);
      if (violation.severity === 'critical') {
        this.emit('criticalRiskViolation', violation);
      }
    });

    return { allowed, violations };
  }

  /**
   * Record trade execution
   */
  recordTrade(params: {
    tokenAddress: string;
    side: 'buy' | 'sell';
    amount: number;
    value: number;
    pnl?: number;
    dex: string;
  }): void {
    // Update daily metrics
    this.metrics.dailyVolume += params.value;
    this.metrics.dailyTrades += 1;
    
    if (params.pnl !== undefined) {
      this.metrics.dailyPnL += params.pnl;
    }

    // Update position
    const currentPosition = this.metrics.currentPositions.get(params.tokenAddress) || 0;
    const newPosition = params.side === 'buy' 
      ? currentPosition + params.amount 
      : currentPosition - params.amount;
    
    if (newPosition === 0) {
      this.metrics.currentPositions.delete(params.tokenAddress);
    } else {
      this.metrics.currentPositions.set(params.tokenAddress, newPosition);
    }

    // Check for automatic kill switch triggers
    this.checkAutoKillSwitch();
    
    this.emit('tradeRecorded', params);
  }

  /**
   * Activate kill switch
   */
  activateKillSwitch(reason: KillSwitchReason, message?: string): void {
    if (this.killSwitchActive) return;

    this.killSwitchActive = true;
    this.killSwitchReason = reason;
    
    console.error(`🚨 KILL SWITCH ACTIVATED: ${reason} - ${message || 'No additional details'}`);
    
    this.emit('killSwitchActivated', {
      reason,
      message,
      timestamp: Date.now(),
      metrics: { ...this.metrics }
    });
  }

  /**
   * Deactivate kill switch (manual override)
   */
  deactivateKillSwitch(override = false): boolean {
    if (!override && this.killSwitchReason !== KillSwitchReason.MANUAL) {
      console.warn('⚠️ Cannot deactivate kill switch - not manually activated');
      return false;
    }

    this.killSwitchActive = false;
    this.killSwitchReason = undefined;
    
    console.log('✅ Kill switch deactivated');
    this.emit('killSwitchDeactivated', { timestamp: Date.now() });
    
    return true;
  }

  private checkDailyLimits(params: any, violations: RiskViolation[]): void {
    // Check daily volume limit
    if (this.metrics.dailyVolume + params.estimatedValue > this.limits.maxDailyVolume) {
      violations.push({
        type: 'daily_volume_limit',
        severity: 'critical',
        message: 'Daily volume limit exceeded',
        currentValue: this.metrics.dailyVolume + params.estimatedValue,
        limit: this.limits.maxDailyVolume,
        timestamp: Date.now()
      });
    }

    // Check daily trades limit
    if (this.metrics.dailyTrades >= this.limits.maxDailyTrades) {
      violations.push({
        type: 'daily_trades_limit',
        severity: 'critical',
        message: 'Daily trades limit exceeded',
        currentValue: this.metrics.dailyTrades + 1,
        limit: this.limits.maxDailyTrades,
        timestamp: Date.now()
      });
    }

    // Check daily loss limit
    if (this.metrics.dailyPnL < -this.limits.maxDailyLoss) {
      violations.push({
        type: 'daily_loss_limit',
        severity: 'critical',
        message: 'Daily loss limit exceeded',
        currentValue: Math.abs(this.metrics.dailyPnL),
        limit: this.limits.maxDailyLoss,
        timestamp: Date.now()
      });
    }
  }

  private checkPositionLimits(params: any, violations: RiskViolation[]): void {
    // Check max position size
    if (params.estimatedValue > this.limits.maxPositionSize) {
      violations.push({
        type: 'position_size_limit',
        severity: 'critical',
        message: 'Position size limit exceeded',
        currentValue: params.estimatedValue,
        limit: this.limits.maxPositionSize,
        timestamp: Date.now()
      });
    }
  }

  private checkSlippageLimits(params: any, violations: RiskViolation[]): void {
    if (params.slippage > this.limits.maxSlippage) {
      violations.push({
        type: 'slippage_limit',
        severity: 'critical',
        message: 'Slippage limit exceeded',
        currentValue: params.slippage,
        limit: this.limits.maxSlippage,
        timestamp: Date.now()
      });
    }
  }

  private checkConcentrationLimits(params: any, violations: RiskViolation[]): void {
    // Token concentration check
    const currentPosition = this.metrics.currentPositions.get(params.tokenAddress) || 0;
    const newPositionValue = (currentPosition + (params.side === 'buy' ? params.amount : -params.amount)) * params.estimatedValue / params.amount;
    const concentrationPercent = (newPositionValue / this.metrics.portfolioValue) * 100;
    
    if (concentrationPercent > this.limits.maxTokenConcentration) {
      violations.push({
        type: 'token_concentration_limit',
        severity: 'warning',
        message: 'Token concentration limit exceeded',
        currentValue: concentrationPercent,
        limit: this.limits.maxTokenConcentration,
        timestamp: Date.now()
      });
    }
  }

  private checkAutoKillSwitch(): void {
    // Check daily loss limit
    if (this.metrics.dailyPnL < -this.limits.maxDailyLoss) {
      this.activateKillSwitch(KillSwitchReason.DAILY_LOSS_LIMIT, 
        `Daily loss: $${Math.abs(this.metrics.dailyPnL).toFixed(2)}`);
      return;
    }

    // Check drawdown limit
    if (this.metrics.currentDrawdown > this.limits.maxDrawdown) {
      this.activateKillSwitch(KillSwitchReason.DRAWDOWN_LIMIT, 
        `Drawdown: ${this.metrics.currentDrawdown.toFixed(2)}%`);
      return;
    }
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.resetDailyMetricsIfNeeded();
      this.cleanupOldViolations();
    }, 60000); // Check every minute
  }

  private resetDailyMetricsIfNeeded(): void {
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;
    
    if (now - this.metrics.lastResetTime > dayInMs) {
      this.metrics.dailyVolume = 0;
      this.metrics.dailyTrades = 0;
      this.metrics.dailyPnL = 0;
      this.metrics.lastResetTime = now;
      
      this.emit('dailyMetricsReset', { timestamp: now });
    }
  }

  private cleanupOldViolations(): void {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    this.violations = this.violations.filter(v => v.timestamp > cutoff);
  }

  /**
   * Get current risk status
   */
  getRiskStatus(): {
    killSwitchActive: boolean;
    killSwitchReason?: KillSwitchReason;
    metrics: RiskMetrics;
    recentViolations: RiskViolation[];
    utilizationPercent: Record<string, number>;
  } {
    const utilizationPercent = {
      dailyVolume: (this.metrics.dailyVolume / this.limits.maxDailyVolume) * 100,
      dailyTrades: (this.metrics.dailyTrades / this.limits.maxDailyTrades) * 100,
      dailyLoss: Math.abs(this.metrics.dailyPnL) / this.limits.maxDailyLoss * 100,
      drawdown: (this.metrics.currentDrawdown / this.limits.maxDrawdown) * 100
    };

    return {
      killSwitchActive: this.killSwitchActive,
      killSwitchReason: this.killSwitchReason,
      metrics: { ...this.metrics },
      recentViolations: this.violations.slice(-10), // Last 10 violations
      utilizationPercent
    };
  }

  /**
   * Update portfolio value for concentration calculations
   */
  updatePortfolioValue(value: number): void {
    this.metrics.portfolioValue = value;
  }

  /**
   * Update current drawdown
   */
  updateDrawdown(drawdownPercent: number): void {
    this.metrics.currentDrawdown = drawdownPercent;
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
  }
}

/**
 * Default risk limits configuration
 */
export const DEFAULT_RISK_LIMITS: RiskLimits = {
  maxPositionSize: 10000,        // $10,000
  maxDailyVolume: 50000,         // $50,000
  maxDailyTrades: 100,           // 100 trades
  maxDailyLoss: 5000,            // $5,000
  maxDrawdown: 20,               // 20%
  stopLossThreshold: 10,         // 10%
  maxTokenConcentration: 25,     // 25%
  maxDEXConcentration: 60,       // 60%
  maxSlippage: 5,                // 5%
  minLiquidity: 10000,           // $10,000
  maxGasPrice: 10000             // 10,000 microlamports
};
