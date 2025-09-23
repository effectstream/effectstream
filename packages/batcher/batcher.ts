import { CryptoManager } from "@paima/crypto";
import { AddressType, TypeboxHelpers } from "@paima/utils";
import { Value } from "@sinclair/typebox/value";
import { BatcherCoordinator } from "./coordinator.ts";
import { BatcherPool } from "./pool.ts";
import { BatcherStorage } from "./storage.ts";
import { DefaultBatcherInput } from "./types.ts";

export class PaimaBatcher<T extends DefaultBatcherInput = DefaultBatcherInput> {
  namespace: string = "paima_batcher";
  constructor(
    private readonly coordinator: BatcherCoordinator,
    private readonly storage: BatcherStorage,
  ) {}
  async init(): Promise<void> {
    this.coordinator.setPool(new BatcherPool<T>());
    await this.storage.init();
  }
  async verifyInputSignature(input: T): Promise<boolean> {
    const message = this.createMessageForBatcher(input);
    // TODO: Define a generic signature verifier for all the supported address types.
    return await CryptoManager.Evm().verifySignature(
      input.address,
      input.signature,
      message,
    );
  }
  createMessageForBatcher(input: T): string {
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
