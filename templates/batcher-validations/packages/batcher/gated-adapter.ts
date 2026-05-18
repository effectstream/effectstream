import type {
  BlockchainAdapter,
  BatchBuildingOptions,
  BatchBuildingResult,
} from "@effectstream/batcher-sdk";
import type { DefaultBatcherInput } from "@effectstream/batcher-sdk";

type ValidationResult = { valid: boolean; error?: string };

export class GatedAdapter implements BlockchainAdapter<string> {
  constructor(
    private readonly inner: BlockchainAdapter<string>,
    private readonly gateUrl: string = "http://localhost:9999/api/gate",
  ) {}

  async validateInput(
    _input: DefaultBatcherInput,
  ): Promise<ValidationResult> {
    try {
      const res = await fetch(this.gateUrl);
      const data = (await res.json()) as { accepting: boolean };
      if (!data.accepting) {
        return { valid: false, error: "Gate is closed — inputs are currently disabled" };
      }
    } catch {
      return { valid: false, error: "Could not reach gate API" };
    }
    if (this.inner.validateInput) {
      return this.inner.validateInput(_input);
    }
    return { valid: true };
  }

  submitBatch(data: string, fee: string | bigint) {
    return this.inner.submitBatch(data, fee);
  }

  estimateBatchFee(data: string) {
    return this.inner.estimateBatchFee(data);
  }

  buildBatchData(inputs: DefaultBatcherInput[], options?: BatchBuildingOptions): BatchBuildingResult<string> | null {
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

  verifySignature(input: DefaultBatcherInput) {
    return this.inner.verifySignature?.(input) ?? true;
  }
}
