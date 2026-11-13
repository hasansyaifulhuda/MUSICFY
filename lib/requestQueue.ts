import os from 'os';

/**
 * Enterprise Priority Request Queue with In-Flight SingleFlight Deduplication
 * Manages concurrent child processes (yt-dlp, ffmpeg) on the server to prevent CPU/RAM saturation,
 * IP throttling, and YouTube rate-limiting.
 */

export enum QueuePriority {
  LOW = 1,
  BACKGROUND = 3,
  DOWNLOAD = 5,
  STREAM = 10,
}

interface QueuedTask<T> {
  id: string;
  resourceKey: string;
  priority: number;
  enqueuedAt: number;
  timeoutMs: number;
  fn: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
  timer?: NodeJS.Timeout;
}

export interface RequestQueueStats {
  running: number;
  queued: number;
  concurrencyLimit: number;
  totalCompleted: number;
  totalFailed: number;
  avgWaitTimeMs: number;
}

export class RequestQueue {
  private queue: QueuedTask<any>[] = [];
  private runningCount = 0;
  private inFlightMap = new Map<string, Promise<any>>();
  private readonly maxConcurrent: number;
  private totalCompleted = 0;
  private totalFailed = 0;
  private totalWaitTimeMs = 0;

  constructor(maxConcurrent?: number) {
    const envConcurrent = parseInt(process.env.MAX_CONCURRENT_YTDLP || '', 10);
    if (!isNaN(envConcurrent) && envConcurrent > 0) {
      this.maxConcurrent = envConcurrent;
    } else if (typeof maxConcurrent === 'number' && maxConcurrent > 0) {
      this.maxConcurrent = maxConcurrent;
    } else {
      // Calculate high-performance default scaled to VPS CPU count (e.g. 8 to 24 concurrent processes)
      const cpuCount = (typeof os.cpus === 'function' && os.cpus()?.length) || 4;
      this.maxConcurrent = Math.max(8, cpuCount * 3);
    }
  }

  /**
   * Enqueues an asynchronous task with priority and deduplication.
   * If an identical resourceKey is already in-flight, it coalesces and shares the result.
   */
  public enqueue<T>(
    resourceKey: string,
    fn: () => Promise<T>,
    options?: {
      priority?: QueuePriority | number;
      timeoutMs?: number;
    }
  ): Promise<T> {
    // 1. SingleFlight Coalescing: If task for resourceKey is actively running, share the promise
    if (resourceKey && this.inFlightMap.has(resourceKey)) {
      return this.inFlightMap.get(resourceKey)!;
    }

    const priority = options?.priority ?? QueuePriority.STREAM;
    const timeoutMs = options?.timeoutMs ?? 120000; // 2 minutes queue wait timeout default

    const taskPromise = new Promise<T>((resolve, reject) => {
      const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      
      const task: QueuedTask<T> = {
        id: taskId,
        resourceKey,
        priority,
        enqueuedAt: Date.now(),
        timeoutMs,
        fn,
        resolve,
        reject,
      };

      if (timeoutMs > 0) {
        task.timer = setTimeout(() => {
          this.removeTask(taskId);
          const err = new Error(`Request in queue timed out after ${timeoutMs}ms (key: ${resourceKey})`);
          (err as any).code = 'ETIMEDOUT';
          reject(err);
        }, timeoutMs);
      }

      // Insert based on priority (highest priority first, FIFO within same priority)
      let inserted = false;
      for (let i = 0; i < this.queue.length; i++) {
        if (task.priority > this.queue[i].priority) {
          this.queue.splice(i, 0, task);
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        this.queue.push(task);
      }

      this.processNext();
    });

    if (resourceKey) {
      this.inFlightMap.set(resourceKey, taskPromise);
      taskPromise.finally(() => {
        this.inFlightMap.delete(resourceKey);
      });
    }

    return taskPromise;
  }

  private processNext(): void {
    if (this.runningCount >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    if (task.timer) {
      clearTimeout(task.timer);
    }

    const waitTime = Date.now() - task.enqueuedAt;
    this.totalWaitTimeMs += waitTime;
    this.runningCount++;

    task.fn()
      .then((res) => {
        this.totalCompleted++;
        task.resolve(res);
      })
      .catch((err) => {
        this.totalFailed++;
        task.reject(err);
      })
      .finally(() => {
        this.runningCount--;
        this.processNext();
      });
  }

  private removeTask(taskId: string): void {
    const idx = this.queue.findIndex((t) => t.id === taskId);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
    }
  }

  public getStats(): RequestQueueStats {
    const totalProcessed = this.totalCompleted + this.totalFailed;
    return {
      running: this.runningCount,
      queued: this.queue.length,
      concurrencyLimit: this.maxConcurrent,
      totalCompleted: this.totalCompleted,
      totalFailed: this.totalFailed,
      avgWaitTimeMs: totalProcessed > 0 ? Math.round(this.totalWaitTimeMs / totalProcessed) : 0,
    };
  }
}

// Global shared request queues for streaming & downloads
export const streamQueue = new RequestQueue();
export const downloadQueue = new RequestQueue();

