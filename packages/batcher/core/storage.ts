import type { DefaultBatcherInput } from "./types.ts";
import { mkdirSync } from "node:fs";
import { mkdir, readFile, writeFile, rm, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { isNotFoundError } from "@effectstream/utils/runtime";
import * as fs from "node:fs";

/**
 * Simple async mutex. At most one holder at a time; additional callers
 * queue in FIFO order.
 */
class Mutex {
  private locked = false;
  private queue: (() => void)[] = [];

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }
}

// Custom logger for debugging
function debugLog(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  try {
    fs.appendFileSync("batcher-debug.log", logMessage);
  } catch (e) {
    // Ignore if we can't write
  }
  console.log(message);
}

/**
 * Interface for batcher storage operations
 */
export interface BatcherStorage<
  T extends DefaultBatcherInput = DefaultBatcherInput,
> {
  /**
   * Initialize the storage (create directories, tables, etc.)
   */
  init(): Promise<void>;

  /**
   * Add a new input to storage
   */
  addInput(input: T, target: string): Promise<void>;

  /**
   * Get all pending inputs
   */
  getAllInputs(): Promise<T[]>;

  /**
   * Remove specific processed inputs from storage (after successful processing)
   * This ensures we remove exactly the inputs that were processed, not just the first N
   */
  removeProcessedInputs(processedInputs: T[], target: string): Promise<void>;

  /**
   * Get the count of pending inputs
   */
  getInputCountAndSize(): Promise<{ count: number; size: number }>;

  /**
   * Get all pending inputs for a specific target (efficient filtering)
   * @param target - The target adapter name
   * @param defaultTarget - The default target to use when input.target is not specified
   */
  getInputsByTarget(target: string, defaultTarget: string): Promise<T[]>;

  /**
   * Increment the retry count for the given inputs.
   * Inputs whose retry count reaches or exceeds maxRetries are removed from storage.
   */
  incrementRetryCount(inputs: T[], target: string, maxRetries: number): Promise<void>;

  /**
   * Clear all inputs (useful for testing)
   */
  clearAllInputs(): Promise<void>;
}

/**
 * File-based storage implementation using JSONL format
 */
export class FileStorage<T extends DefaultBatcherInput = DefaultBatcherInput>
  implements BatcherStorage<T> {
  private readonly filePath: string;
  private readonly dataDirectory: string;
  private readonly mutex = new Mutex();

  constructor(dataDirectory: string = "./batcher-data") {
    mkdirSync(dataDirectory, { recursive: true });
    this.dataDirectory = dataDirectory;
    this.filePath = `${dataDirectory}/pending-inputs.jsonl`;
  }

  /**
   * Write content to the storage file atomically.
   * Writes to a temp file first, then renames (atomic on POSIX).
   */
  private async atomicWrite(content: string): Promise<void> {
    const tmpPath = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(tmpPath, content);
    await rename(tmpPath, this.filePath);
  }

  async init(): Promise<void> {
    try {
      await mkdir(this.dataDirectory, { recursive: true });
    } catch (error) {
      console.error("Error creating data directory:", error);
      throw new Error(`Failed to initialize storage: ${error}`);
    }
  }

  async addInput(input: T): Promise<void> {
    await this.mutex.run(async () => {
      try {
        const existing = await this.readFileContent();
        await this.atomicWrite(existing + JSON.stringify(input) + "\n");
      } catch (error) {
        console.error("Error adding input to storage:", error);
        throw new Error(`Failed to add input: ${error}`);
      }
    });
  }

  async getAllInputs(): Promise<T[]> {
    try {
      const content = await readFile(this.filePath, "utf-8");
      const lines = content.trim().split("\n").filter((line) => line.trim());
      return lines.flatMap((line) => {
        try {
          return [JSON.parse(line) as T];
        } catch {
          console.warn("⚠️ Skipping corrupt line in storage:", line);
          return [];
        }
      });
    } catch (error) {
      if (isNotFoundError(error)) {
        // File doesn't exist yet, return empty array
        return [];
      }
      console.error("Error reading inputs from storage:", error);
      throw new Error(`Failed to read inputs: ${error}`);
    }
  }

  /**
   * Read the raw file content, returning empty string if file doesn't exist.
   */
  private async readFileContent(): Promise<string> {
    try {
      return await readFile(this.filePath, "utf-8");
    } catch (error) {
      if (isNotFoundError(error)) return "";
      throw error;
    }
  }

  async removeProcessedInputs(
    processedInputs: T[],
    target: string,
  ): Promise<void> {
    await this.mutex.run(async () => {
      try {
        debugLog(`[Storage] Removing ${processedInputs.length} inputs for target ${target}`);
        // Create a set of keys for the processed inputs for fast lookup
        const processedKeys = new Set(processedInputs.map((input) => {
          const key = this.createInputKey(input, target);
          debugLog(`[Storage] Key to remove: ${key.substring(0, 100)}...`);
          return key;
        }));

        // Read all current inputs
        const allInputs = await this.getAllInputs();
        debugLog(`[Storage] Total inputs in storage: ${allInputs.length}`);

        // Filter out the processed inputs
        const remainingInputs = allInputs.filter((input) => {
          const key = this.createInputKey(input, target);
          const shouldRemove = processedKeys.has(key);
          if (shouldRemove) {
            debugLog(`[Storage] Found match to remove: ${key.substring(0, 100)}...`);
          }
          return !shouldRemove;
        });

        debugLog(`[Storage] Remaining inputs: ${remainingInputs.length}`);

        // Write the remaining inputs back to the file atomically
        const content = remainingInputs.map((input) => JSON.stringify(input))
          .join("\n");
        await this.atomicWrite(
          content + (remainingInputs.length > 0 ? "\n" : ""),
        );

        const removedCount = allInputs.length - remainingInputs.length;
        if (removedCount !== processedInputs.length) {
          // When storage is empty this is normal for concurrent adapters:
          // a parallel batch already removed these inputs.
          if (allInputs.length === 0) {
            debugLog(
              `[Storage] Inputs already removed (concurrent batch). Expected ${processedInputs.length}, storage was empty.`,
            );
          } else {
            console.warn(
              `⚠️ Expected to remove ${processedInputs.length} inputs, but removed ${removedCount}. Some inputs may have been processed already.`,
            );
          }
        }
      } catch (error) {
        console.error("Error removing processed inputs:", error);
        throw new Error(`Failed to remove processed inputs: ${error}`);
      }
    });
  }

  /**
   * Create a unique key for a DefaultBatcherInput for comparison
   */
  private createInputKey(input: T, target: string): string {
    return [
      input.addressType,
      target,
      input.address,
      input.timestamp,
      input.signature ?? "",
      input.input,
    ].join("|");
  }

  async getInputCountAndSize(): Promise<{ count: number; size: number }> {
    try {
      const inputs = await this.getAllInputs();
      const size = inputs.reduce(
        (acc, input) => acc + JSON.stringify(input).length,
        0,
      );
      return { count: inputs.length, size };
    } catch (error) {
      console.error("Error getting input count:", error);
      throw new Error(`Failed to get input count: ${error}`);
    }
  }

  async getInputsByTarget(target: string, defaultTarget: string): Promise<T[]> {
    try {
      const allInputs = await this.getAllInputs();
      return allInputs.filter((input) =>
        (input.target || defaultTarget) === target
      );
    } catch (error) {
      console.error("Error getting inputs by target:", error);
      throw new Error(`Failed to get inputs by target: ${error}`);
    }
  }

  async incrementRetryCount(
    inputs: T[],
    target: string,
    maxRetries: number,
  ): Promise<void> {
    if (inputs.length === 0) return;
    await this.mutex.run(async () => {
      try {
        const allInputs = await this.getAllInputs();
        const keySet = new Set(inputs.map((i) => this.createInputKey(i, target)));
        const updated: T[] = [];
        for (const input of allInputs) {
          const key = this.createInputKey(input, target);
          if (!keySet.has(key)) {
            updated.push(input);
            continue;
          }
          const newRetryCount = (input.retryCount ?? 0) + 1;
          if (newRetryCount >= maxRetries) {
            // Always-visible: deleting a user's input must never be silent.
            console.warn(
              `[Storage] DROPPING input after ${newRetryCount} failed retries ` +
                `(address=${input.address}, target=${target}): ${key.substring(0, 100)}...`,
            );
            continue; // drop it from storage
          }
          updated.push({ ...input, retryCount: newRetryCount });
        }
        const content = updated.map((i) => JSON.stringify(i)).join("\n");
        await this.atomicWrite(
          content + (updated.length > 0 ? "\n" : ""),
        );
      } catch (error) {
        console.error("Error incrementing retry counts:", error);
        throw new Error(`Failed to increment retry counts: ${error}`);
      }
    });
  }

  async clearAllInputs(): Promise<void> {
    try {
      await rm(this.filePath);
    } catch (error) {
      if (!isNotFoundError(error)) {
        console.error("Error clearing inputs:", error);
        throw new Error(`Failed to clear inputs: ${error}`);
      }
      // File doesn't exist, which means it's already cleared
    }
  }
}

/**
 * TODO: database storage implementation.
 * This could be implemented with PostgreSQL,
 * Perhaps passing the connection string as an argument.
 */
export class DatabaseStorage<
  T extends DefaultBatcherInput = DefaultBatcherInput,
> implements BatcherStorage<T> {
  constructor(private connectionString: string) {}

  // TODO: Implement database storage
  init(): Promise<void> {
    throw new Error("DatabaseStorage not implemented yet");
  }
  addInput(input: T): Promise<void> {
    throw new Error("DatabaseStorage not implemented yet");
  }
  getAllInputs(): Promise<T[]> {
    throw new Error("DatabaseStorage not implemented yet");
  }
  removeProcessedInputs(
    processedInputs: T[],
  ): Promise<void> {
    throw new Error("DatabaseStorage not implemented yet");
  }
  getInputCountAndSize(): Promise<{ count: number; size: number }> {
    throw new Error("DatabaseStorage not implemented yet");
  }
  getInputsByTarget(target: string, defaultTarget: string): Promise<T[]> {
    throw new Error("DatabaseStorage not implemented yet");
  }
  incrementRetryCount(_inputs: T[], _target: string, _maxRetries: number): Promise<void> {
    throw new Error("DatabaseStorage not implemented yet");
  }
  clearAllInputs(): Promise<void> {
    throw new Error("DatabaseStorage not implemented yet");
  }
}
