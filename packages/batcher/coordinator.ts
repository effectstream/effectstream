import { BatcherPool } from "./pool.ts";
import { DefaultBatcherInput } from "./types.ts";

export abstract class BatcherCoordinator<T = DefaultBatcherInput> {
  protected pool: BatcherPool<T> | undefined;
  constructor() {}
  setPool(pool: BatcherPool<T>): void {
    this.pool = pool;
  }
  resetPool(newPool: BatcherPool<T>): void {
    this.pool = newPool;
  }
  abstract isReady(): boolean;
}

/**
 * Coordinator that checks if the pool is ready to be processed based on a time window.
 */
export class SchedulerCoordinator<T = DefaultBatcherInput>
  extends BatcherCoordinator<T> {
  /**
   * @param timeWindow - The time between each scheduled batch in seconds.
   */
  constructor(
    protected timeWindow: number,
  ) {
    super();
    this.timeWindow = timeWindow;
  }
  isReady(): boolean {
    if (!this.pool) {
      throw new Error("Pool not set");
    }
    return this.pool.timeSinceCreated >= this.timeWindow;
  }
}

/**
 * Coordinator that checks if the pool is ready to be processed based on a size window.
 * This means that if the pool size is reached, the pool is sent.
 */
export class SizeCoordinator<T = DefaultBatcherInput>
  extends BatcherCoordinator<T> {
  /**
   * @param targetSize - The target size of the pool.
   * @param pool - The pool of inputs.
   */
  constructor(protected targetSize: number) {
    super();
    this.targetSize = targetSize;
  }
  isReady(): boolean {
    if (!this.pool) {
      throw new Error("Pool not set");
    }
    return this.pool.length >= this.targetSize;
  }
}

/**
 * Coordinator that checks if the pool is ready to be processed based on a value window.
 */
export class ValueCoordinator<T = DefaultBatcherInput>
  extends BatcherCoordinator<T> {
  /**
   * @param targetValue - The target value of the pool.
   * @param valueCallback - The callback to get the value of each item in the pool.
   * @param pool - The pool of inputs.
   */
  constructor(
    protected targetValue: number,
    protected valueCallback: (item: T) => number,
  ) {
    super();
    this.targetValue = targetValue;
    this.valueCallback = valueCallback;
  }
  isReady(): boolean {
    if (!this.pool) {
      throw new Error("Pool not set");
    }
    const poolValue = this.pool.mapToValue(this.valueCallback);
    return poolValue >= this.targetValue;
  }
}

/**
 * Coordinator that sends the pool every X seconds. But if a size threshold is reached, it sends the pool immediately.
 */
export class TimeOrSizeCoordinator<T = DefaultBatcherInput>
  extends BatcherCoordinator<T> {
  /**
   * @param timeWindow - The time window in seconds. Every "timeWindow" seconds, the pool is sent.
   * @param targetSize - The target size of the pool. Sends triggers if the pool size is reached.
   * @param pool - The pool of inputs.
   */
  constructor(
    protected timeWindow: number,
    protected targetSize: number,
  ) {
    super();
    this.timeWindow = timeWindow;
    this.targetSize = targetSize;
  }
  isReady(): boolean {
    if (!this.pool) {
      throw new Error("Pool not set");
    }
    return this.pool.timeSinceCreated >= this.timeWindow ||
      this.pool.length >= this.targetSize;
  }
}
