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
// File logging is opt-in: appendFileSync blocks the event loop on every line,
// which is a throughput tax when several adapters share one process.
const FILE_LOGGING_ENABLED = process.env.BATCHER_DEBUG_LOG === "1";

function debugLog(message: string) {
  if (FILE_LOGGING_ENABLED) {
    const timestamp = new Date().toISOString();
    try {
      fs.appendFileSync("batcher-debug.log", `[${timestamp}] ${message}\n`);
    } catch {
      // Ignore if we can't write
    }
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
   * Initialize the storage (create directories, tables, etc.).
   *
   * `defaultTarget`, when given, is the target unaddressed input routes to.
   * Implementations that persist a per-row target should use it to stamp rows
   * written before targets were recorded — see `FileStorage.init`.
   */
  init(defaultTarget?: string): Promise<void>;

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

  async init(defaultTarget?: string): Promise<void> {
    try {
      await mkdir(this.dataDirectory, { recursive: true });
    } catch (error) {
      console.error("Error creating data directory:", error);
      throw new Error(`Failed to initialize storage: ${error}`);
    }
    if (defaultTarget !== undefined) {
      await this.stampLegacyRows(defaultTarget);
    }
  }

  /**
   * One-time migration: give rows written before targets were recorded the
   * target they actually belong to.
   *
   * `createInputKey` falls back to the target currently being processed for a
   * row that has none, so an untargeted row is read as belonging to whoever is
   * asking. A queue carried across an upgrade can therefore have another
   * product's identical row match — and remove or retry-charge — the legacy
   * default-target row. Rewriting them once, under the mutex, ends that.
   */
  private async stampLegacyRows(defaultTarget: string): Promise<void> {
    await this.mutex.run(async () => {
      let content: string;
      try {
        content = await this.readFileContent();
      } catch {
        return; // no queue file yet
      }
      const lines = content.split("\n").filter((line) => line.trim());
      if (lines.length === 0) return;

      let stamped = 0;
      const migrated = lines.map((line) => {
        try {
          const row = JSON.parse(line) as T;
          if (row.target !== undefined) return line;
          stamped += 1;
          return JSON.stringify({ ...row, target: defaultTarget });
        } catch {
          return line; // leave unparseable lines exactly as found
        }
      });
      if (stamped === 0) return;

      await this.atomicWrite(migrated.join("\n") + "\n");
      console.log(
        `[Storage] Stamped ${stamped} legacy input(s) with target "${defaultTarget}" ` +
          `(rows written before per-row targets were recorded).`,
      );
    });
  }

  async addInput(input: T, target?: string): Promise<void> {
    await this.mutex.run(async () => {
      try {
        const existing = await this.readFileContent();
        // Stamp the RESOLVED target onto the row. An input that arrived without
        // one was routed to the default target, and if it is stored targetless
        // then `createInputKey`'s fallback lets whichever product is currently
        // being processed adopt it — so an identical row belonging to another
        // product matches it and gets removed or retry-charged. A row's identity
        // must not depend on who is reading it.
        const row = input.target === undefined && target !== undefined
          ? { ...input, target }
          : input;
        await this.atomicWrite(existing + JSON.stringify(row) + "\n");
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
   * Create a unique key for a DefaultBatcherInput for comparison.
   *
   * The key must use the INPUT's own target. Using the caller's target for
   * every row makes it cancel out of the comparison, so in a multi-product
   * batcher a byte-identical payload submitted to two targets would be treated
   * as one row — and removing/retry-charging one product's input would hit the
   * other product's copy.
   *
   * The `?? target` fallback exists only for rows written before `addInput`
   * started stamping the resolved target. It is deliberately the LAST resort:
   * while it applies, such a row takes on the identity of whichever product is
   * reading it, which is the very collision this key exists to prevent. New
   * rows are always stamped, so the fallback stops applying once a pre-existing
   * queue has drained.
   */
  private createInputKey(input: T, target: string): string {
    return [
      input.addressType,
      input.target ?? target,
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
  init(_defaultTarget?: string): Promise<void> {
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
