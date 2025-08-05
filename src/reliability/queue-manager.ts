import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

/**
 * Priority Queue Manager for trade execution
 */

export enum TaskPriority {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  URGENT = 4,
  CRITICAL = 5
}

export enum TaskStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface QueueTask<T = any> {
  id: string;
  type: string;
  priority: TaskPriority;
  payload: T;
  status: TaskStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  attempts: number;
  maxAttempts: number;
  deadline?: number;
  result?: any;
  error?: any;
  metadata?: Record<string, any>;
}

export interface QueueConfig {
  maxConcurrency: number;
  maxQueueSize: number;
  defaultTimeout: number;
  retryDelay: number;
  enableDeadlineChecks: boolean;
}

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  totalProcessed: number;
  averageProcessingTime: number;
  queueSize: number;
  concurrency: number;
}

export class QueueManager<T = any> extends EventEmitter {
  private queue: QueueTask<T>[] = [];
  private processing: Map<string, QueueTask<T>> = new Map();
  private completed: QueueTask<T>[] = [];
  private failed: QueueTask<T>[] = [];
  private config: QueueConfig;
  private isRunning = false;
  private processingTimes: number[] = [];

  constructor(config: QueueConfig) {
    super();
    this.config = config;
  }

  /**
   * Add task to queue
   */
  async addTask(
    type: string,
    payload: T,
    options: {
      priority?: TaskPriority;
      maxAttempts?: number;
      deadline?: number;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<string> {
    if (this.queue.length >= this.config.maxQueueSize) {
      throw new Error('Queue is full');
    }

    const task: QueueTask<T> = {
      id: uuidv4(),
      type,
      priority: options.priority || TaskPriority.MEDIUM,
      payload,
      status: TaskStatus.PENDING,
      createdAt: Date.now(),
      attempts: 0,
      maxAttempts: options.maxAttempts || 3,
      deadline: options.deadline,
      metadata: options.metadata
    };

    // Insert task in priority order
    this.insertTaskByPriority(task);
    
    this.emit('taskAdded', task);
    
    // Start processing if not already running
    if (!this.isRunning) {
      this.start();
    }

    return task.id;
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): QueueTask<T> | null {
    // Check processing tasks
    const processingTask = this.processing.get(taskId);
    if (processingTask) return processingTask;

    // Check queue
    const queuedTask = this.queue.find(task => task.id === taskId);
    if (queuedTask) return queuedTask;

    // Check completed
    const completedTask = this.completed.find(task => task.id === taskId);
    if (completedTask) return completedTask;

    // Check failed
    const failedTask = this.failed.find(task => task.id === taskId);
    if (failedTask) return failedTask;

    return null;
  }

  /**
   * Cancel task
   */
  cancelTask(taskId: string): boolean {
    // Remove from queue if pending
    const queueIndex = this.queue.findIndex(task => task.id === taskId);
    if (queueIndex !== -1) {
      const task = this.queue.splice(queueIndex, 1)[0];
      task.status = TaskStatus.CANCELLED;
      task.completedAt = Date.now();
      this.failed.push(task);
      this.emit('taskCancelled', task);
      return true;
    }

    // Can't cancel if already processing or completed
    return false;
  }

  /**
   * Start queue processing
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.processQueue();
    this.emit('queueStarted');
  }

  /**
   * Stop queue processing
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    
    // Wait for current tasks to complete
    while (this.processing.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    this.emit('queueStopped');
  }

  /**
   * Process queue
   */
  private async processQueue(): Promise<void> {
    while (this.isRunning) {
      // Check if we can process more tasks
      if (this.processing.size >= this.config.maxConcurrency || this.queue.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }

      // Get next task
      const task = this.queue.shift();
      if (!task) continue;

      // Check deadline
      if (this.config.enableDeadlineChecks && task.deadline && Date.now() > task.deadline) {
        task.status = TaskStatus.FAILED;
        task.error = 'Task deadline exceeded';
        task.completedAt = Date.now();
        this.failed.push(task);
        this.emit('taskFailed', task);
        continue;
      }

      // Start processing
      this.processTask(task);
    }
  }

  /**
   * Process individual task
   */
  private async processTask(task: QueueTask<T>): Promise<void> {
    task.status = TaskStatus.PROCESSING;
    task.startedAt = Date.now();
    task.attempts++;
    
    this.processing.set(task.id, task);
    this.emit('taskStarted', task);

    try {
      // Execute task
      const result = await this.executeTask(task);
      
      // Task completed successfully
      task.status = TaskStatus.COMPLETED;
      task.result = result;
      task.completedAt = Date.now();
      
      this.processing.delete(task.id);
      this.completed.push(task);
      
      // Track processing time
      if (task.startedAt) {
        const processingTime = task.completedAt - task.startedAt;
        this.processingTimes.push(processingTime);
        
        // Keep only last 100 processing times
        if (this.processingTimes.length > 100) {
          this.processingTimes.shift();
        }
      }
      
      this.emit('taskCompleted', task);

    } catch (error) {
      task.error = error;
      
      // Check if we should retry
      if (task.attempts < task.maxAttempts) {
        // Retry task
        task.status = TaskStatus.PENDING;
        this.processing.delete(task.id);
        
        // Add delay before retry
        setTimeout(() => {
          this.insertTaskByPriority(task);
        }, this.config.retryDelay);
        
        this.emit('taskRetry', task);
      } else {
        // Task failed permanently
        task.status = TaskStatus.FAILED;
        task.completedAt = Date.now();
        
        this.processing.delete(task.id);
        this.failed.push(task);
        
        this.emit('taskFailed', task);
      }
    }
  }

  /**
   * Execute task - to be overridden by subclasses
   */
  protected async executeTask(task: QueueTask<T>): Promise<any> {
    throw new Error('executeTask must be implemented by subclass');
  }

  /**
   * Insert task in priority order
   */
  private insertTaskByPriority(task: QueueTask<T>): void {
    let insertIndex = this.queue.length;
    
    // Find insertion point based on priority and creation time
    for (let i = 0; i < this.queue.length; i++) {
      const existingTask = this.queue[i];
      
      if (task.priority > existingTask.priority || 
          (task.priority === existingTask.priority && task.createdAt < existingTask.createdAt)) {
        insertIndex = i;
        break;
      }
    }
    
    this.queue.splice(insertIndex, 0, task);
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    const totalProcessed = this.completed.length + this.failed.length;
    const averageProcessingTime = this.processingTimes.length > 0 
      ? this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length
      : 0;

    return {
      pending: this.queue.length,
      processing: this.processing.size,
      completed: this.completed.length,
      failed: this.failed.length,
      totalProcessed,
      averageProcessingTime,
      queueSize: this.queue.length + this.processing.size,
      concurrency: this.processing.size
    };
  }

  /**
   * Clear completed and failed tasks
   */
  cleanup(olderThan?: number): void {
    const cutoff = olderThan || (Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    
    this.completed = this.completed.filter(task => 
      (task.completedAt || task.createdAt) > cutoff
    );
    
    this.failed = this.failed.filter(task => 
      (task.completedAt || task.createdAt) > cutoff
    );
  }

  /**
   * Get tasks by status
   */
  getTasksByStatus(status: TaskStatus): QueueTask<T>[] {
    switch (status) {
      case TaskStatus.PENDING:
        return [...this.queue];
      case TaskStatus.PROCESSING:
        return Array.from(this.processing.values());
      case TaskStatus.COMPLETED:
        return [...this.completed];
      case TaskStatus.FAILED:
      case TaskStatus.CANCELLED:
        return [...this.failed];
      default:
        return [];
    }
  }
}

/**
 * Default queue configuration
 */
export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxConcurrency: 3,
  maxQueueSize: 1000,
  defaultTimeout: 30000,    // 30 seconds
  retryDelay: 5000,         // 5 seconds
  enableDeadlineChecks: true
};
