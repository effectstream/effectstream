import type {
  BatchBuildingOptions,
  BatchBuildingResult,
  BlockchainAdapter,
  BlockchainHash,
  BlockchainTransactionReceipt,
} from "./adapter.ts";
import { AdapterLogger } from "./adapter-logger.ts";
import type { DefaultBatcherInput } from "../core/types.ts";
import { fetchLatestBlockHash, waitForTxFinality } from "./near-signer.ts";
import {
  createAndSubmitIntent,
  type IntentMessage,
} from "./near-intent-solver.ts";

export interface NearIntentBatch {
  intents: IntentMessage[];
  signerAccountId: string;
}

export interface NearIntentAdapterConfig {
  rpcUrl: string;
  networkId: string;
  batcherAccountId: string;
  batcherPrivateKey: string;
  syncProtocolName: string;
  maxBatchSize?: number;
}

export class NearIntentAdapter
  implements BlockchainAdapter<NearIntentBatch>
{
  private readonly config: NearIntentAdapterConfig;
  private readonly logger: AdapterLogger;
  private ready = true;

  constructor(config: NearIntentAdapterConfig) {
    this.config = config;
    this.logger = new AdapterLogger("NearIntentAdapter");
  }

  async submitBatch(
    data: NearIntentBatch,
    _fee: string | bigint,
  ): Promise<BlockchainHash> {
    const result = await createAndSubmitIntent(data.intents, {
      accountId: data.signerAccountId,
      privateKey: this.config.batcherPrivateKey,
    });

    this.logger.log(
      `Intent submitted: ${result.intentHash}, status: ${result.status}`,
    );

    return result.settlementTxHash ?? result.intentHash;
  }

  estimateBatchFee(_data: NearIntentBatch): string {
    // Intents don't have a direct gas fee from the batcher's perspective;
    // the solver pays for execute_intents. Return "0".
    return "0";
  }

  buildBatchData(
    inputs: DefaultBatcherInput[],
    _options?: BatchBuildingOptions,
  ): BatchBuildingResult<NearIntentBatch> | null {
    if (inputs.length === 0) return null;

    const maxSize = this.config.maxBatchSize ?? 10;
    const selectedInputs = inputs.slice(0, maxSize);

    const intents: IntentMessage[] = selectedInputs.map((input) => {
      const parsed = JSON.parse(input.input);
      return {
        signerId: input.address,
        send: parsed.send ?? [],
        receive: parsed.receive ?? [],
        expirationNs: String(
          (Date.now() + 60_000) * 1_000_000,
        ),
      };
    });

    return {
      selectedInputs,
      data: {
        intents,
        signerAccountId: this.config.batcherAccountId,
      },
    };
  }

  async waitForTransactionReceipt(
    hash: BlockchainHash,
    timeout?: number,
  ): Promise<BlockchainTransactionReceipt> {
    return waitForTxFinality(
      this.config.rpcUrl,
      hash,
      this.config.batcherAccountId,
      timeout,
    );
  }

  getAccountAddress(): string {
    return this.config.batcherAccountId;
  }

  getChainName(): string {
    return `near-intents-${this.config.networkId}`;
  }

  isReady(): boolean {
    return this.ready;
  }

  async getBlockNumber(): Promise<bigint> {
    const block = await fetchLatestBlockHash(this.config.rpcUrl);
    return BigInt(block.height);
  }

  getSyncProtocolName(): string {
    return this.config.syncProtocolName;
  }

  // Intents use Ed25519 signatures — skip default EVM verification
  verifySignature(_input: DefaultBatcherInput): boolean {
    // TODO: implement Ed25519 verification when near-api-js is available
    return true;
  }
}
