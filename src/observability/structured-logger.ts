import { EventEmitter } from 'events';
import * as winston from 'winston';
import { v4 as uuidv4 } from 'uuid';

/**
 * Structured Logger with trace_id support
 */

export interface LogContext {
  traceId?: string;
  userId?: string;
  sessionId?: string;
  operation?: string;
  tokenAddress?: string;
  dex?: string;
  amount?: number;
  [key: string]: any;
}

export interface TradeLogData {
  traceId: string;
  stage: 'signal' | 'decision' | 'build' | 'sign' | 'send' | 'confirm';
  tokenAddress: string;
  side: 'buy' | 'sell';
  amount: number;
  dex: string;
  executionMethod: string;
  timestamp: number;
  duration?: number;
  success?: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  tags: Record<string, string>;
  timestamp: number;
}

export class StructuredLogger extends EventEmitter {
  private logger: winston.Logger;
  private defaultContext: LogContext = {};

  constructor(config: {
    level?: string;
    service?: string;
    environment?: string;
    outputs?: ('console' | 'file' | 'elasticsearch')[];
  } = {}) {
    super();

    const { level = 'info', service = 'solana-trading', environment = 'development', outputs = ['console'] } = config;

    // Create winston transports based on outputs
    const transports: winston.transport[] = [];

    if (outputs.includes('console')) {
      transports.push(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
            return `${timestamp} [${level}]: ${message} ${metaStr}`;
          })
        )
      }));
    }

    if (outputs.includes('file')) {
      transports.push(new winston.transports.File({
        filename: 'logs/trading.log',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      }));
    }

    this.logger = winston.createLogger({
      level,
      defaultMeta: {
        service,
        environment,
        hostname: require('os').hostname(),
        pid: process.pid
      },
      transports
    });

    this.setupDefaultContext();
  }

  /**
   * Set default context for all logs
   */
  setDefaultContext(context: LogContext): void {
    this.defaultContext = { ...this.defaultContext, ...context };
  }

  /**
   * Generate new trace ID
   */
  generateTraceId(): string {
    return `trace_${Date.now()}_${uuidv4().substr(0, 8)}`;
  }

  /**
   * Log with context
   */
  log(level: string, message: string, context: LogContext = {}): void {
    const fullContext = {
      ...this.defaultContext,
      ...context,
      timestamp: Date.now()
    };

    this.logger.log(level, message, fullContext);
    this.emit('log', { level, message, context: fullContext });
  }

  /**
   * Info level log
   */
  info(message: string, context: LogContext = {}): void {
    this.log('info', message, context);
  }

  /**
   * Warning level log
   */
  warn(message: string, context: LogContext = {}): void {
    this.log('warn', message, context);
  }

  /**
   * Error level log
   */
  error(message: string, error?: Error, context: LogContext = {}): void {
    const errorContext = error ? {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    } : {};

    this.log('error', message, { ...context, ...errorContext });
  }

  /**
   * Debug level log
   */
  debug(message: string, context: LogContext = {}): void {
    this.log('debug', message, context);
  }

  /**
   * Log trade lifecycle event
   */
  logTrade(data: TradeLogData): void {
    const message = `Trade ${data.stage}: ${data.side} ${data.amount} ${data.tokenAddress} on ${data.dex}`;
    
    this.info(message, {
      traceId: data.traceId,
      operation: 'trade',
      stage: data.stage,
      tokenAddress: data.tokenAddress,
      side: data.side,
      amount: data.amount,
      dex: data.dex,
      executionMethod: data.executionMethod,
      duration: data.duration,
      success: data.success,
      error: data.error,
      metadata: data.metadata
    });

    this.emit('tradeLog', data);
  }

  /**
   * Log performance metric
   */
  logMetric(metric: PerformanceMetric): void {
    this.info(`Metric: ${metric.name} = ${metric.value} ${metric.unit}`, {
      operation: 'metric',
      metric: {
        name: metric.name,
        value: metric.value,
        unit: metric.unit,
        tags: metric.tags
      }
    });

    this.emit('metric', metric);
  }

  /**
   * Create child logger with additional context
   */
  child(context: LogContext): StructuredLogger {
    const childLogger = new StructuredLogger({});
    childLogger.logger = this.logger.child(context);
    childLogger.defaultContext = { ...this.defaultContext, ...context };
    return childLogger;
  }

  /**
   * Time a function execution
   */
  async time<T>(
    operation: string,
    fn: () => Promise<T>,
    context: LogContext = {}
  ): Promise<T> {
    const traceId = context.traceId || this.generateTraceId();
    const startTime = Date.now();

    this.debug(`Starting ${operation}`, { ...context, traceId, operation });

    try {
      const result = await fn();
      const duration = Date.now() - startTime;

      this.info(`Completed ${operation}`, {
        ...context,
        traceId,
        operation,
        duration,
        success: true
      });

      this.logMetric({
        name: `${operation}_duration`,
        value: duration,
        unit: 'ms',
        tags: { operation, success: 'true' },
        timestamp: Date.now()
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.error(`Failed ${operation}`, error as Error, {
        ...context,
        traceId,
        operation,
        duration,
        success: false
      });

      this.logMetric({
        name: `${operation}_duration`,
        value: duration,
        unit: 'ms',
        tags: { operation, success: 'false' },
        timestamp: Date.now()
      });

      throw error;
    }
  }

  private setupDefaultContext(): void {
    // Add process information
    this.defaultContext = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    };
  }
}

/**
 * Trade Logger - specialized logger for trade operations
 */
export class TradeLogger {
  private logger: StructuredLogger;
  private tradeId: string;
  private startTime: number;
  private stages: Map<string, number> = new Map();

  constructor(logger: StructuredLogger, tradeParams: {
    tokenAddress: string;
    side: 'buy' | 'sell';
    amount: number;
    dex: string;
  }) {
    this.logger = logger;
    this.tradeId = logger.generateTraceId();
    this.startTime = Date.now();

    // Log trade initiation
    this.logger.logTrade({
      traceId: this.tradeId,
      stage: 'signal',
      tokenAddress: tradeParams.tokenAddress,
      side: tradeParams.side,
      amount: tradeParams.amount,
      dex: tradeParams.dex,
      executionMethod: 'unknown',
      timestamp: this.startTime
    });
  }

  /**
   * Log trade stage
   */
  logStage(
    stage: 'decision' | 'build' | 'sign' | 'send' | 'confirm',
    success: boolean,
    metadata?: Record<string, any>,
    error?: string
  ): void {
    const now = Date.now();
    const stageDuration = this.stages.has(stage) ? now - this.stages.get(stage)! : undefined;
    this.stages.set(stage, now);

    this.logger.logTrade({
      traceId: this.tradeId,
      stage,
      tokenAddress: '',
      side: 'buy',
      amount: 0,
      dex: '',
      executionMethod: '',
      timestamp: now,
      duration: stageDuration,
      success,
      error,
      metadata
    });
  }

  /**
   * Get trade ID
   */
  getTradeId(): string {
    return this.tradeId;
  }

  /**
   * Get total trade duration
   */
  getTotalDuration(): number {
    return Date.now() - this.startTime;
  }
}

/**
 * Global logger instance
 */
export const logger = new StructuredLogger({
  level: process.env.LOG_LEVEL || 'info',
  service: 'solana-trading-cli',
  environment: process.env.NODE_ENV || 'development',
  outputs: ['console', 'file']
});

/**
 * Create trade logger
 */
export function createTradeLogger(tradeParams: {
  tokenAddress: string;
  side: 'buy' | 'sell';
  amount: number;
  dex: string;
}): TradeLogger {
  return new TradeLogger(logger, tradeParams);
}
