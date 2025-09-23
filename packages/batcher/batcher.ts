import { CryptoManager } from "@paima/crypto";
import { AddressType, TypeboxHelpers } from "@paima/utils";
import { Value } from "@sinclair/typebox/value";
import { BatcherCoordinator } from "./coordinator.ts";
import { BatcherPool } from "./pool.ts";
import { BatcherStorage } from "./storage.ts";
import { DefaultBatcherInput } from "./types.ts";

export interface PaimaBatcherConfig {
  pollingIntervalMs: number;
}

export class PaimaBatcher<T extends DefaultBatcherInput = DefaultBatcherInput> {
  /** Namespace used for signature verification messages */
  namespace: string = "paima_batcher";
  /** Timer ID for the periodic coordinator polling */
  private pollingIntervalID?: number;
  /** In-memory pool for tracking inputs before they're processed by the coordinator */
  private pool: BatcherPool<T> = new BatcherPool<T>();
  constructor(
    private readonly coordinator: BatcherCoordinator,
    private readonly storage: BatcherStorage,
    private readonly config: PaimaBatcherConfig,
  ) {}
  async init(): Promise<void> {
    this.coordinator.setPool(this.pool);
    await this.storage.init();
    this.pollingIntervalID = setInterval(
      async () => {
        await this.pollCoordinator();
      },
      this.config.pollingIntervalMs,
    );
  }
  async batchInput(input: T): Promise<void> {
    const verifiedSignature = await this.verifyInputSignature(input);
    if (!verifiedSignature) {
      throw new Error("Invalid signature");
    }
    await this.addToPool(input);
    const { count, size } = await this.storage.getInputCountAndSize();
    console.log(
      `✅ Added input from ${input.address} to batch queue. Queue size: ${count} inputs, ${size} bytes`,
    );
  }
  /**
   * Add input to both storage and the in-memory pool
   * This ensures the input is persisted and also available for immediate coordinator processing
   */
  async addToPool(input: T): Promise<void> {
    await this.storage.addInput(input);
    this.pool.push(input);
  }
  async verifyInputSignature(
    input: T,
  ): Promise<boolean> {
    const message = this.createSignatureMessage(input);
    // TODO: Define a generic signature verifier for all the supported address types.
    return await CryptoManager.Evm().verifySignature(
      input.address,
      message,
      input.signature,
    );
  }

  async pollCoordinator(): Promise<void> {
    const isReady = this.coordinator.isReady();
    if (!isReady) return;
  }
  /**
   * Validate the input and return a boolean indicating if the input is valid.
   * Default is a placeholder to be overridden by the user extending the PaimaBatcher class.
   * @param input - The input to validate.
   * @returns A boolean promise indicating if the input is valid.
   */
  async validateInput(input: T): Promise<boolean> {
    return new Promise((resolve) => {
      resolve(!!input.signature.length && !!input.address.length);
    });
  }
  /**
   * Creates the message to be validated by verifyInputSignature against a signature and address.
   * @param input - The input to create a message for.
   * @returns A string message for the batcher.
   */
  private createSignatureMessage(input: T): string {
    let walletAddress;
    switch (input.addressType) {
      case AddressType.EVM:
        walletAddress = Value.Decode(TypeboxHelpers.Evm.Address, input.address);
        break;
      default:
        throw new Error("Invalid address type");
    }
    return (
      this.namespace +
      input.timestamp +
      walletAddress +
      input.input
    )
      .replace(/[^a-zA-Z0-9]/g, "-")
      .toLocaleLowerCase();
  }
}
