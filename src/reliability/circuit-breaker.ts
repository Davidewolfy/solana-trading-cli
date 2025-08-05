import { EventEmitter } from 'events';

/**
 * Circuit Breaker implementation for service reliability
 */

export enum CircuitState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Failing, reject requests
  HALF_OPEN = 'half_open' // Testing if service recovered
}

export interface CircuitBreakerConfig {
  failureThreshold: number;    // Number of failures before opening
  successThreshold: number;    // Number of successes to close from half-open
  timeout: number;            // Time to wait before trying half-open (ms)
  monitoringPeriod: number;   // Period to track failures (ms)
  expectedErrors?: string[];  // Error types that should trip the breaker
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  requests: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  nextAttempt?: number;
}

export class CircuitBreaker extends EventEmitter {
  private config: CircuitBreakerConfig;
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private requests: number = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private nextAttempt?: number;
  private recentFailures: number[] = [];

  constructor(private name: string, config: CircuitBreakerConfig) {
    super();
    this.config = config;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < (this.nextAttempt || 0)) {
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
      // Try to transition to half-open
      this.state = CircuitState.HALF_OPEN;
      this.emit('stateChange', { name: this.name, state: this.state });
    }

    this.requests++;

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  private onSuccess(): void {
    this.successes++;
    this.lastSuccessTime = Date.now();
    this.cleanupOldFailures();

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.successes >= this.config.successThreshold) {
        this.reset();
      }
    } else if (this.state === CircuitState.OPEN) {
      // Shouldn't happen, but reset if it does
      this.reset();
    }
  }

  private onFailure(error: any): void {
    const now = Date.now();
    this.failures++;
    this.lastFailureTime = now;
    this.recentFailures.push(now);
    this.cleanupOldFailures();

    // Check if this error should trip the breaker
    if (this.shouldTripBreaker(error)) {
      if (this.state === CircuitState.HALF_OPEN) {
        this.open();
      } else if (this.state === CircuitState.CLOSED && this.recentFailures.length >= this.config.failureThreshold) {
        this.open();
      }
    }
  }

  private shouldTripBreaker(error: any): boolean {
    if (!this.config.expectedErrors || this.config.expectedErrors.length === 0) {
      return true; // All errors trip the breaker
    }

    const errorMessage = error?.message || error?.toString() || '';
    return this.config.expectedErrors.some(expectedError => 
      errorMessage.includes(expectedError)
    );
  }

  private open(): void {
    this.state = CircuitState.OPEN;
    this.nextAttempt = Date.now() + this.config.timeout;
    this.emit('stateChange', { name: this.name, state: this.state });
    this.emit('circuitOpened', { name: this.name, failures: this.failures });
  }

  private reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.recentFailures = [];
    this.nextAttempt = undefined;
    this.emit('stateChange', { name: this.name, state: this.state });
    this.emit('circuitClosed', { name: this.name });
  }

  private cleanupOldFailures(): void {
    const cutoff = Date.now() - this.config.monitoringPeriod;
    this.recentFailures = this.recentFailures.filter(time => time > cutoff);
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      requests: this.requests,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextAttempt: this.nextAttempt
    };
  }

  isOpen(): boolean {
    return this.state === CircuitState.OPEN && Date.now() < (this.nextAttempt || 0);
  }

  forceOpen(): void {
    this.open();
  }

  forceClose(): void {
    this.reset();
  }
}

/**
 * Circuit Breaker Manager for multiple services
 */
export class CircuitBreakerManager {
  private breakers: Map<string, CircuitBreaker> = new Map();

  createBreaker(name: string, config: CircuitBreakerConfig): CircuitBreaker {
    const breaker = new CircuitBreaker(name, config);
    
    breaker.on('stateChange', (event) => {
      console.log(`🔌 Circuit breaker ${event.name} state changed to ${event.state}`);
    });

    breaker.on('circuitOpened', (event) => {
      console.warn(`⚠️ Circuit breaker ${event.name} OPENED after ${event.failures} failures`);
    });

    breaker.on('circuitClosed', (event) => {
      console.log(`✅ Circuit breaker ${event.name} CLOSED - service recovered`);
    });

    this.breakers.set(name, breaker);
    return breaker;
  }

  getBreaker(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  getHealthySevices(): string[] {
    return Array.from(this.breakers.entries())
      .filter(([_, breaker]) => !breaker.isOpen())
      .map(([name, _]) => name);
  }

  getUnhealthyServices(): string[] {
    return Array.from(this.breakers.entries())
      .filter(([_, breaker]) => breaker.isOpen())
      .map(([name, _]) => name);
  }
}

/**
 * Default circuit breaker configurations for different services
 */
export const DEFAULT_CIRCUIT_CONFIGS = {
  rpc: {
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 30000, // 30 seconds
    monitoringPeriod: 60000, // 1 minute
    expectedErrors: ['timeout', 'connection', 'network']
  },
  jupiter: {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 15000, // 15 seconds
    monitoringPeriod: 30000, // 30 seconds
    expectedErrors: ['rate limit', 'service unavailable']
  },
  dex: {
    failureThreshold: 4,
    successThreshold: 2,
    timeout: 20000, // 20 seconds
    monitoringPeriod: 45000, // 45 seconds
    expectedErrors: ['slippage', 'insufficient liquidity']
  }
};
