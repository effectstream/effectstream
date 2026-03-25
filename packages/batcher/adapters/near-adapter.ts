import type {
  BatchBuildingOptions,
  BatchBuildingResult,
  BlockchainAdapter,
  BlockchainHash,
  BlockchainTransactionReceipt,
} from "./adapter.ts";
import { AdapterLogger } from "./adapter-logger.ts";
import type { DefaultBatcherInput } from "../core/types.ts";
import {
  broadcastTransaction,
  fetchLatestBlockHash,
  waitForTxFinality,
} from "./near-signer.ts";

export interface NearBatchPayload {
  contractAccountId: string;
  methodName: string;
  args: Record<string, unknown>;
  gas: string;
  deposit: string;
}

export interface NearAdapterConfig {
  rpcUrl: string;
  networkId: string;
  batcherAccountId: string;
  batcherPrivateKey: string;
  contractAccountId: string;
  contractMethod: string;
  syncProtocolName: string;
  maxBatchSize?: number;
  gasPerCall?: string;
  attachedDeposit?: string;
}

const DEFAULT_GAS = "300000000000000"; // 300 TGas
const DEFAULT_DEPOSIT = "0";

export class NearAdapter implements BlockchainAdapter<NearBatchPayload> {
  private readonly config: NearAdapterConfig;
  private readonly logger: AdapterLogger;
  private ready = true;

  constructor(config: NearAdapterConfig) {
    this.config = config;
    this.logger = new AdapterLogger("NearAdapter");
  }

  async submitBatch(
    data: NearBatchPayload,
    _fee: string | bigint,
  ): Promise<BlockchainHash> {
    // Build the FunctionCall action as a JSON-RPC send_tx
    // In production, this would use near-api-js for proper signing
    // For now, use the signer utilities with broadcast_tx_commit
    const argsBase64 = Buffer.from(JSON.stringify(data.args)).toString("base64");

    // Construct raw transaction payload
    const txPayload = JSON.stringify({
      signer_id: this.config.batcherAccountId,
      receiver_id: data.contractAccountId,
      actions: [
        {
          type: "FunctionCall",
          params: {
            method_name: data.methodName,
            args: argsBase64,
            gas: data.gas,
            deposit: data.deposit,
          },
        },
      ],
    });

    const result = await broadcastTransaction(this.config.rpcUrl, txPayload);
    this.logger.log(`Submitted batch tx: ${result.hash}`);
    return result.hash;
  }

  estimateBatchFee(_data: NearBatchPayload): string {
    // NEAR gas is prepaid; the attached gas is the "fee"
    return this.config.gasPerCall ?? DEFAULT_GAS;
  }

  buildBatchData(
    inputs: DefaultBatcherInput[],
    _options?: BatchBuildingOptions,
  ): BatchBuildingResult<NearBatchPayload> | null {
    if (inputs.length === 0) return null;

    const maxSize = this.config.maxBatchSize ?? 50;
    const selectedInputs = inputs.slice(0, maxSize);

    const batchArgs = selectedInputs.map((input) => ({
      address: input.address,
      input: input.input,
      signature: input.signature ?? "",
      timestamp: input.timestamp,
    }));

    return {
      selectedInputs,
      data: {
        contractAccountId: this.config.contractAccountId,
        methodName: this.config.contractMethod,
        args: { batch: batchArgs },
        gas: this.config.gasPerCall ?? DEFAULT_GAS,
        deposit: this.config.attachedDeposit ?? DEFAULT_DEPOSIT,
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
    return `near-${this.config.networkId}`;
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
}
