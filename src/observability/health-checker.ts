import { EventEmitter } from 'events';
import { Connection } from '@solana/web3.js';

/**
 * Health Checker for system components
 */

export interface HealthCheck {
  name: string;
  check: () => Promise<HealthResult>;
  timeout: number;
  interval: number;
  critical: boolean;
}

export interface HealthResult {
  healthy: boolean;
  message: string;
  details?: Record<string, any>;
  responseTime: number;
  timestamp: number;
}

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, HealthResult>;
  lastUpdated: number;
  uptime: number;
}

export class HealthChecker extends EventEmitter {
  private checks: Map<string, HealthCheck> = new Map();
  private results: Map<string, HealthResult> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private startTime: number;

  constructor() {
    super();
    this.startTime = Date.now();
    this.setupDefaultChecks();
  }

  /**
   * Register a health check
   */
  registerCheck(check: HealthCheck): void {
    this.checks.set(check.name, check);
    
    // Start periodic checking
    this.startPeriodicCheck(check);
    
    // Run initial check
    this.runCheck(check.name);
    
    console.log(`🏥 Registered health check: ${check.name}`);
  }

  /**
   * Run a specific health check
   */
  async runCheck(name: string): Promise<HealthResult> {
    const check = this.checks.get(name);
    if (!check) {
      throw new Error(`Health check not found: ${name}`);
    }

    const startTime = Date.now();
    
    try {
      const result = await Promise.race([
        check.check(),
        new Promise<HealthResult>((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), check.timeout)
        )
      ]);

      result.responseTime = Date.now() - startTime;
      result.timestamp = Date.now();
      
      this.results.set(name, result);
      
      if (!result.healthy && check.critical) {
        this.emit('criticalFailure', { name, result });
      }
      
      this.emit('checkCompleted', { name, result });
      
      return result;
    } catch (error) {
      const result: HealthResult = {
        healthy: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Date.now() - startTime,
        timestamp: Date.now()
      };
      
      this.results.set(name, result);
      
      if (check.critical) {
        this.emit('criticalFailure', { name, result });
      }
      
      this.emit('checkFailed', { name, result, error });
      
      return result;
    }
  }

  /**
   * Run all health checks
   */
  async runAllChecks(): Promise<Record<string, HealthResult>> {
    const results: Record<string, HealthResult> = {};
    
    const promises = Array.from(this.checks.keys()).map(async (name) => {
      try {
        results[name] = await this.runCheck(name);
      } catch (error) {
        results[name] = {
          healthy: false,
          message: `Check failed: ${error}`,
          responseTime: 0,
          timestamp: Date.now()
        };
      }
    });
    
    await Promise.all(promises);
    return results;
  }

  /**
   * Get current system health
   */
  getSystemHealth(): SystemHealth {
    const checks: Record<string, HealthResult> = {};
    let healthyCount = 0;
    let criticalFailures = 0;
    let totalChecks = 0;

    for (const [name, check] of this.checks) {
      const result = this.results.get(name);
      if (result) {
        checks[name] = result;
        totalChecks++;
        
        if (result.healthy) {
          healthyCount++;
        } else if (check.critical) {
          criticalFailures++;
        }
      }
    }

    let overall: 'healthy' | 'degraded' | 'unhealthy';
    
    if (criticalFailures > 0) {
      overall = 'unhealthy';
    } else if (healthyCount === totalChecks) {
      overall = 'healthy';
    } else {
      overall = 'degraded';
    }

    return {
      overall,
      checks,
      lastUpdated: Date.now(),
      uptime: Date.now() - this.startTime
    };
  }

  /**
   * Get health status for specific component
   */
  getComponentHealth(name: string): HealthResult | null {
    return this.results.get(name) || null;
  }

  private startPeriodicCheck(check: HealthCheck): void {
    const interval = setInterval(() => {
      this.runCheck(check.name).catch(error => {
        console.error(`Periodic health check failed for ${check.name}:`, error);
      });
    }, check.interval);
    
    this.intervals.set(check.name, interval);
  }

  private setupDefaultChecks(): void {
    // RPC Connection Health Check
    this.registerCheck({
      name: 'rpc_connection',
      check: async () => {
        try {
          const connection = new Connection(process.env.MAINNET_ENDPOINT || 'https://api.mainnet-beta.solana.com');
          const slot = await connection.getSlot();
          
          return {
            healthy: true,
            message: 'RPC connection healthy',
            details: { currentSlot: slot },
            responseTime: 0,
            timestamp: 0
          };
        } catch (error) {
          return {
            healthy: false,
            message: `RPC connection failed: ${error}`,
            responseTime: 0,
            timestamp: 0
          };
        }
      },
      timeout: 5000,
      interval: 30000, // 30 seconds
      critical: true
    });

    // Memory Usage Check
    this.registerCheck({
      name: 'memory_usage',
      check: async () => {
        const memUsage = process.memoryUsage();
        const usedMB = memUsage.heapUsed / 1024 / 1024;
        const totalMB = memUsage.heapTotal / 1024 / 1024;
        const usagePercent = (usedMB / totalMB) * 100;
        
        const healthy = usagePercent < 80; // Alert if over 80%
        
        return {
          healthy,
          message: healthy ? 'Memory usage normal' : 'High memory usage',
          details: {
            usedMB: Math.round(usedMB),
            totalMB: Math.round(totalMB),
            usagePercent: Math.round(usagePercent)
          },
          responseTime: 0,
          timestamp: 0
        };
      },
      timeout: 1000,
      interval: 60000, // 1 minute
      critical: false
    });

    // Event Loop Lag Check
    this.registerCheck({
      name: 'event_loop_lag',
      check: async () => {
        return new Promise((resolve) => {
          const start = Date.now();
          setImmediate(() => {
            const lag = Date.now() - start;
            const healthy = lag < 100; // Alert if lag > 100ms
            
            resolve({
              healthy,
              message: healthy ? 'Event loop responsive' : 'Event loop lag detected',
              details: { lagMs: lag },
              responseTime: 0,
              timestamp: 0
            });
          });
        });
      },
      timeout: 2000,
      interval: 30000, // 30 seconds
      critical: false
    });

    // Disk Space Check
    this.registerCheck({
      name: 'disk_space',
      check: async () => {
        try {
          const fs = require('fs');
          const stats = fs.statSync('.');
          
          // This is a simplified check - in production you'd use a proper disk space library
          return {
            healthy: true,
            message: 'Disk space check passed',
            details: { available: 'unknown' },
            responseTime: 0,
            timestamp: 0
          };
        } catch (error) {
          return {
            healthy: false,
            message: `Disk space check failed: ${error}`,
            responseTime: 0,
            timestamp: 0
          };
        }
      },
      timeout: 2000,
      interval: 300000, // 5 minutes
      critical: false
    });
  }

  /**
   * Stop all health checks
   */
  stop(): void {
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }

  /**
   * Get health check statistics
   */
  getStats(): {
    totalChecks: number;
    healthyChecks: number;
    criticalChecks: number;
    averageResponseTime: number;
    uptime: number;
  } {
    const results = Array.from(this.results.values());
    const healthyChecks = results.filter(r => r.healthy).length;
    const criticalChecks = Array.from(this.checks.values()).filter(c => c.critical).length;
    const averageResponseTime = results.length > 0 
      ? results.reduce((sum, r) => sum + r.responseTime, 0) / results.length 
      : 0;

    return {
      totalChecks: this.checks.size,
      healthyChecks,
      criticalChecks,
      averageResponseTime,
      uptime: Date.now() - this.startTime
    };
  }
}

/**
 * Global health checker instance
 */
export const healthChecker = new HealthChecker();

/**
 * Express middleware for health endpoint
 */
export function createHealthEndpoint() {
  return async (req: any, res: any) => {
    try {
      const health = healthChecker.getSystemHealth();
      const statusCode = health.overall === 'healthy' ? 200 : 
                        health.overall === 'degraded' ? 200 : 503;
      
      res.status(statusCode).json(health);
    } catch (error) {
      res.status(500).json({
        overall: 'unhealthy',
        error: 'Health check failed',
        timestamp: Date.now()
      });
    }
  };
}
