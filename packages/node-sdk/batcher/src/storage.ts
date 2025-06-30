import type { BatchedSubunit } from "@paima/concise";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { type Operation, until } from "npm:effection";

/**
 * Interface for batcher storage operations
 */
export interface BatcherStorage {
  /**
   * Initialize the storage (create directories, tables, etc.)
   */
  init(): Operation<void>;

  /**
   * Add a new input to storage
   */
  addInput(input: BatchedSubunit): Operation<void>;

  /**
   * Get all pending inputs
   */
  getAllInputs(): Operation<BatchedSubunit[]>;

  /**
   * Remove specific processed inputs from storage (after successful processing)
   * This ensures we remove exactly the inputs that were processed, not just the first N
   */
  removeProcessedInputs(processedInputs: BatchedSubunit[]): Operation<void>;

  /**
   * Get the count of pending inputs
   */
  getInputCountAndSize(): Operation<{ count: number; size: number }>;

  /**
   * Clear all inputs (useful for testing)
   */
  clearAllInputs(): Operation<void>;
}

/**
 * File-based storage implementation using JSONL format
 */
export class FileStorage implements BatcherStorage {
  private readonly filePath: string;
  private readonly dataDirectory: string;

  constructor(dataDirectory: string = "./batcher-data") {
    this.dataDirectory = dataDirectory;
    this.filePath = join(dataDirectory, "pending-inputs.jsonl");
  }

  *init(): Operation<void> {
    try {
      yield* until(fs.mkdir(this.dataDirectory, { recursive: true }));
    } catch (error) {
      console.error("Error creating data directory:", error);
      throw new Error(`Failed to initialize storage: ${error}`);
    }
  }

  *addInput(input: BatchedSubunit): Operation<void> {
    try {
      yield* until(fs.appendFile(this.filePath, JSON.stringify(input) + "\n"));
    } catch (error) {
      console.error("Error adding input to storage:", error);
      throw new Error(`Failed to add input: ${error}`);
    }
  }

  *getAllInputs(): Operation<BatchedSubunit[]> {
    try {
      const content = yield* until(fs.readFile(this.filePath, "utf-8"));
      const lines = content.trim().split("\n").filter((line) => line.trim());
      return lines.map((line) => JSON.parse(line));
    } catch (error) {
      if ((error as any).code === "ENOENT") {
        // File doesn't exist yet, return empty array
        return [];
      }
      console.error("Error reading inputs from storage:", error);
      throw new Error(`Failed to read inputs: ${error}`);
    }
  }

  *removeProcessedInputs(
    processedInputs: BatchedSubunit[],
  ): Operation<void> {
    try {
      // Create a set of keys for the processed inputs for fast lookup
      const processedKeys = new Set(processedInputs.map(this.createInputKey));

      // Read all current inputs
      const allInputs = yield* this.getAllInputs();

      // Filter out the processed inputs
      const remainingInputs = allInputs.filter((input) =>
        !processedKeys.has(this.createInputKey(input))
      );

      // Write the remaining inputs back to the file
      const content = remainingInputs.map((input) => JSON.stringify(input))
        .join("\n");
      yield* until(fs.writeFile(
        this.filePath,
        content + (remainingInputs.length > 0 ? "\n" : ""),
      ));

      const removedCount = allInputs.length - remainingInputs.length;
      if (removedCount !== processedInputs.length) {
        console.warn(
          `⚠️ Expected to remove ${processedInputs.length} inputs, but removed ${removedCount}. Some inputs may have been processed already.`,
        );
      }
    } catch (error) {
      console.error("Error removing processed inputs:", error);
      throw new Error(`Failed to remove processed inputs: ${error}`);
    }
  }

  /**
   * Create a unique key for a BatchedSubunit for comparison
   */
  private createInputKey(input: BatchedSubunit): string {
    return `${input.userAddress}-${input.gameInput}-${input.millisecondTimestamp}-${input.userSignature}`;
  }

  *getInputCountAndSize(): Operation<{ count: number; size: number }> {
    try {
      const inputs = yield* this.getAllInputs();
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

  *clearAllInputs(): Operation<void> {
    try {
      yield* until(fs.unlink(this.filePath));
    } catch (error) {
      if ((error as any).code !== "ENOENT") {
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
export class DatabaseStorage implements BatcherStorage {
  constructor(private connectionString: string) {}

  *init(): Operation<void> {
    throw new Error("DatabaseStorage not implemented yet");
  }
  *addInput(input: BatchedSubunit): Operation<void> {
    throw new Error("DatabaseStorage not implemented yet");
  }
  *getAllInputs(): Operation<BatchedSubunit[]> {
    throw new Error("DatabaseStorage not implemented yet");
  }
  *removeProcessedInputs(
    processedInputs: BatchedSubunit[],
  ): Operation<void> {
    throw new Error("DatabaseStorage not implemented yet");
  }
  *getInputCountAndSize(): Operation<{ count: number; size: number }> {
    throw new Error("DatabaseStorage not implemented yet");
  }
  *clearAllInputs(): Operation<void> {
    throw new Error("DatabaseStorage not implemented yet");
  }
}
