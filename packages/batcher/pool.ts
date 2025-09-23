import { DefaultBatcherInput } from "./types.ts";

export class BatcherPool<T = DefaultBatcherInput> extends Array<T> {
  // A custom attribute, initialized in the constructor
  public readonly createdAt: number;

  constructor(...items: T[]) {
    super(...items);
    this.createdAt = Date.now();
  }

  /** A custom "get" attribute that returns the time since the pool was created
   * @returns The time since the pool was created in seconds
   */
  get timeSinceCreated(): number {
    const seconds = Math.floor((Date.now() - this.createdAt) / 1000);
    return seconds;
  }

  /** Clears the pool (probably wont be used in the batcher) */
  public clear(): void {
    // 'this.length' is an inherited property from Array and when redefined to 0 it will clear the pool
    this.length = 0;
  }

  /** Converts the pool to an array */
  public toArray(): T[] {
    return Array.from(this);
  }

  /** Maps the pool to a value */
  public mapToValue(callback: (item: T) => number): number {
    return this.reduce((acc, item) => acc + callback(item), 0);
  }
}
