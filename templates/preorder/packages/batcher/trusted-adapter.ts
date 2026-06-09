import type {
  BlockchainAdapter,
  BatchBuildingOptions,
  BatchBuildingResult,
  DefaultBatcherInput,
} from "@effectstream/batcher-sdk";

type ValidationResult = { valid: boolean; error?: string };

/**
 * Wraps an adapter so the batcher accepts node-originated jobs that carry no
 * per-user signature. The sync node <-> batcher channel is internal (localhost)
 * and trusted, so `verifySignature()` returns true — without it the batcher core
 * rejects unsigned inputs ("requires either a signature or a custom
 * verifySignature implementation"). All other behaviour delegates to the inner
 * adapter (e.g. EvmContractAdapter performing the actual mint).
 */
export class TrustedAdapter<T> implements BlockchainAdapter<T> {
  constructor(private readonly inner: BlockchainAdapter<T>) {}

  verifySignature(input: DefaultBatcherInput): boolean | Promise<boolean> {
    return this.inner.verifySignature?.(input) ?? true;
  }

  validateInput(input: DefaultBatcherInput): ValidationResult | Promise<ValidationResult> {
    return this.inner.validateInput ? this.inner.validateInput(input) : { valid: true };
  }

  submitBatch(data: T, fee: string | bigint) {
    return this.inner.submitBatch(data, fee);
  }

  estimateBatchFee(data: T) {
    return this.inner.estimateBatchFee(data);
  }

  buildBatchData(
    inputs: DefaultBatcherInput[],
    options?: BatchBuildingOptions,
  ): BatchBuildingResult<T> | null {
    return this.inner.buildBatchData(inputs, options);
  }

  waitForTransactionReceipt(hash: string, timeout?: number) {
    return this.inner.waitForTransactionReceipt(hash, timeout);
  }

  getAccountAddress() {
    return this.inner.getAccountAddress();
  }

  getChainName() {
    return this.inner.getChainName();
  }

  isReady() {
    return this.inner.isReady();
  }

  getBlockNumber() {
    return this.inner.getBlockNumber();
  }

  getSyncProtocolName() {
    return this.inner.getSyncProtocolName?.() ?? this.inner.getChainName();
  }
}
