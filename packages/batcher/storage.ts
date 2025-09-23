import type { BatchedSubunit } from "@paima/concise";

/**
 * Interface for batcher storage operations
 */
export interface BatcherStorage {
  /**
   * Initialize the storage (create directories, tables, etc.)
   */
  init(): Promise<void>;

  /**
   * Add a new input to storage
   */
  addInput(input: BatchedSubunit): Promise<void>;

  /**
   * Get all pending inputs
   */
  getAllInputs(): Promise<BatchedSubunit[]>;

  /**
   * Remove specific processed inputs from storage (after successful processing)
   * This ensures we remove exactly the inputs that were processed, not just the first N
   */
  removeProcessedInputs(processedInputs: BatchedSubunit[]): Promise<void>;

  /**
   * Get the count of pending inputs
   */
  getInputCountAndSize(): Promise<{ count: number; size: number }>;

  /**
   * Clear all inputs (useful for testing)
   */
  clearAllInputs(): Promise<void>;
}

/**
 * File-based storage implementation using JSONL format
 */
export class FileStorage implements BatcherStorage {
  private readonly filePath: string;
  private readonly dataDirectory: string;

  constructor(dataDirectory: string = "./batcher-data") {
    Deno.mkdirSync(dataDirectory, { recursive: true });
    this.dataDirectory = dataDirectory;
    this.filePath = `${dataDirectory}/pending-inputs.jsonl`;
  }

  async init(): Promise<void> {
    try {
      await Deno.mkdir(this.dataDirectory, { recursive: true });
    } catch (error) {
      console.error("Error creating data directory:", error);
      throw new Error(`Failed to initialize storage: ${error}`);
    }
  }

  async addInput(input: BatchedSubunit): Promise<void> {
    try {
      await Deno.writeFile(
        this.filePath,
        new TextEncoder().encode(JSON.stringify(input) + "\n"),
        { append: true },
      );
    } catch (error) {
      console.error("Error adding input to storage:", error);
      throw new Error(`Failed to add input: ${error}`);
    }
  }

  async getAllInputs(): Promise<BatchedSubunit[]> {
    try {
      const content = new TextDecoder().decode(
        await Deno.readFile(this.filePath),
      );
      const lines = content.trim().split("\n").filter((line) => line.trim());
      return lines.map((line) => JSON.parse(line));
    } catch (error) {
      if ((error as any).name === "NotFound") {
        // File doesn't exist yet, return empty array
        return [];
      }
      console.error("Error reading inputs from storage:", error);
      throw new Error(`Failed to read inputs: ${error}`);
    }
  }

  async removeProcessedInputs(
    processedInputs: BatchedSubunit[],
  ): Promise<void> {
    try {
      // Create a set of keys for the processed inputs for fast lookup
      const processedKeys = new Set(processedInputs.map(this.createInputKey));

      // Read all current inputs
      const allInputs = await this.getAllInputs();

      // Filter out the processed inputs
      const remainingInputs = allInputs.filter((input) =>
        !processedKeys.has(this.createInputKey(input))
      );

      // Write the remaining inputs back to the file
      const content = remainingInputs.map((input) => JSON.stringify(input))
        .join("\n");
      await Deno.writeFile(
        this.filePath,
        new TextEncoder().encode(
          content + (remainingInputs.length > 0 ? "\n" : ""),
        ),
      );

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
    return `${input.userAddress}-${input.conciseInput}-${input.millisecondTimestamp}-${input.userSignature}`;
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

  async clearAllInputs(): Promise<void> {
    try {
      await Deno.remove(this.filePath);
    } catch (error) {
      if ((error as any).name !== "NotFound") {
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

  // TODO: Implement database storage
  init(): Promise<void> {
    throw new Error("DatabaseStorage not implemented yet");
  }
  addInput(input: BatchedSubunit): Promise<void> {
    throw new Error("DatabaseStorage not implemented yet");
  }
  getAllInputs(): Promise<BatchedSubunit[]> {
    throw new Error("DatabaseStorage not implemented yet");
  }
  removeProcessedInputs(
    processedInputs: BatchedSubunit[],
  ): Promise<void> {
    throw new Error("DatabaseStorage not implemented yet");
  }
  getInputCountAndSize(): Promise<{ count: number; size: number }> {
    throw new Error("DatabaseStorage not implemented yet");
  }
  clearAllInputs(): Promise<void> {
    throw new Error("DatabaseStorage not implemented yet");
  }
}
