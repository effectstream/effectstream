//
// Ring buffer implementation for storing the latest logs
// This provides O(1) insertion and maintains a fixed size efficiently
//
export class RingBuffer<T> {
  private buffer: T[];
  private head: number = 0;
  private tail: number = 0;
  private size: number = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;

    if (this.size < this.capacity) {
      this.size++;
    } else {
      // Buffer is full, move head forward (overwrite oldest)
      this.head = (this.head + 1) % this.capacity;
    }
  }

  toArray(): T[] {
    if (this.size === 0) return [];

    const result: T[] = [];
    let current = this.head;

    for (let i = 0; i < this.size; i++) {
      result.push(this.buffer[current]);
      current = (current + 1) % this.capacity;
    }

    return result;
  }

  clear(): void {
    this.head = 0;
    this.tail = 0;
    this.size = 0;
  }

  getSize(): number {
    return this.size;
  }
}
