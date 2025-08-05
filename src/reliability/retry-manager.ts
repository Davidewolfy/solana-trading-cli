import { EventEmitter } from 'events';

/**
 * Retry Manager with exponential backoff and jitter
 */

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;        // Base delay in ms
  maxDelay: number;         // Maximum delay in ms
  backoffMultiplier: number; // Exponential backoff multiplier
  jitter: boolean;          // Add random jitter to delays
  retryableErrors?: string[]; // Error types that should be retried
  onRetry?: (attempt: number, error: any) => void;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: any;
  attempts: number;
  totalTime: number;
}

export class RetryManager extends EventEmitter {
  constructor(private name: string) {
    super();
  }

  async execute<T>(
    operation: () => Promise<T>,
    config: RetryConfig
  ): Promise<T> {
    const startTime = Date.now();
    let lastError: any;
    let attempt = 0;

    while (attempt < config.maxAttempts) {
      attempt++;

      try {
        const result = await operation();
        
        if (attempt > 1) {
          this.emit('retrySuccess', {
            name: this.name,
            attempts: attempt,
            totalTime: Date.now() - startTime
          });
        }

        return result;
      } catch (error) {
        lastError = error;
        
        // Check if this error should be retried
        if (!this.shouldRetry(error, config)) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt >= config.maxAttempts) {
          break;
        }

        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt, config);
        
        this.emit('retryAttempt', {
          name: this.name,
          attempt,
          error: error.message || error,
          nextDelay: delay
        });

        // Call retry callback if provided
        if (config.onRetry) {
          config.onRetry(attempt, error);
        }

        // Wait before next attempt
        await this.sleep(delay);
      }
    }

    // All attempts failed
    this.emit('retryFailed', {
      name: this.name,
      attempts: attempt,
      totalTime: Date.now() - startTime,
      finalError: lastError
    });

    throw lastError;
  }

  private shouldRetry(error: any, config: RetryConfig): boolean {
    if (!config.retryableErrors || config.retryableErrors.length === 0) {
      return true; // Retry all errors by default
    }

    const errorMessage = error?.message || error?.toString() || '';
    return config.retryableErrors.some(retryableError => 
      errorMessage.toLowerCase().includes(retryableError.toLowerCase())
    );
  }

  private calculateDelay(attempt: number, config: RetryConfig): number {
    // Exponential backoff: baseDelay * (backoffMultiplier ^ (attempt - 1))
    let delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    
    // Cap at maximum delay
    delay = Math.min(delay, config.maxDelay);
    
    // Add jitter if enabled
    if (config.jitter) {
      // Add random jitter of ±25%
      const jitterRange = delay * 0.25;
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      delay += jitter;
    }
    
    return Math.max(0, Math.round(delay));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Deadline-aware retry wrapper
 */
export class DeadlineAwareRetry extends RetryManager {
  async executeWithDeadline<T>(
    operation: () => Promise<T>,
    config: RetryConfig,
    deadline: number // Absolute timestamp
  ): Promise<T> {
    const startTime = Date.now();
    
    // Adjust max attempts based on remaining time
    const remainingTime = deadline - startTime;
    if (remainingTime <= 0) {
      throw new Error('Deadline already passed');
    }

    // Estimate time per attempt and adjust max attempts
    const estimatedTimePerAttempt = config.baseDelay * 2; // Rough estimate
    const maxPossibleAttempts = Math.floor(remainingTime / estimatedTimePerAttempt);
    
    const adjustedConfig = {
      ...config,
      maxAttempts: Math.min(config.maxAttempts, Math.max(1, maxPossibleAttempts))
    };

    // Wrap operation with deadline check
    const deadlineAwareOperation = async (): Promise<T> => {
      if (Date.now() >= deadline) {
        throw new Error('Operation deadline exceeded');
      }
      return await operation();
    };

    return this.execute(deadlineAwareOperation, adjustedConfig);
  }
}

/**
 * Retry Manager Factory with common configurations
 */
export class RetryManagerFactory {
  static createRPCRetry(): RetryManager {
    return new RetryManager('rpc');
  }

  static createDEXRetry(): RetryManager {
    return new RetryManager('dex');
  }

  static createJupiterRetry(): RetryManager {
    return new RetryManager('jupiter');
  }

  static createDeadlineAwareRetry(name: string): DeadlineAwareRetry {
    return new DeadlineAwareRetry(name);
  }
}

/**
 * Default retry configurations
 */
export const DEFAULT_RETRY_CONFIGS = {
  rpc: {
    maxAttempts: 3,
    baseDelay: 1000,      // 1 second
    maxDelay: 10000,      // 10 seconds
    backoffMultiplier: 2,
    jitter: true,
    retryableErrors: [
      'timeout',
      'connection',
      'network',
      'rate limit',
      'server error',
      'service unavailable'
    ]
  },
  
  jupiter: {
    maxAttempts: 2,
    baseDelay: 500,       // 0.5 seconds
    maxDelay: 2000,       // 2 seconds
    backoffMultiplier: 2,
    jitter: true,
    retryableErrors: [
      'rate limit',
      'timeout',
      'service unavailable',
      'internal server error'
    ]
  },
  
  dex: {
    maxAttempts: 2,
    baseDelay: 1000,      // 1 second
    maxDelay: 3000,       // 3 seconds
    backoffMultiplier: 1.5,
    jitter: true,
    retryableErrors: [
      'slippage tolerance exceeded',
      'insufficient liquidity',
      'blockhash not found',
      'transaction expired'
    ]
  },
  
  critical: {
    maxAttempts: 5,
    baseDelay: 2000,      // 2 seconds
    maxDelay: 30000,      // 30 seconds
    backoffMultiplier: 2,
    jitter: true,
    retryableErrors: [
      'timeout',
      'connection',
      'network',
      'temporary'
    ]
  }
};
