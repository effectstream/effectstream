import type {
  Abi,
  AbiFunction,
  Account,
  Chain,
  Hash,
  PublicClient,
  WalletClient,
} from "viem";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as chains from "viem/chains";

import type {
  BatchBuildingOptions,
  BatchBuildingResult,
  BlockchainAdapter,
  BlockchainHash,
  BlockchainTransactionReceipt,
  ValidationResult,
} from "./adapter.ts";
import type { DefaultBatcherInput } from "../core/types.ts";
import {
  EvmBatchBuilderLogic,
  type EvmBatchPayload,
  parseEvmBatcherInput,
} from "../batch-data-builder/evm-builder-logic.ts";

export interface HardhatArtifact {
  contractName: string;
  abi: Abi;
  bytecode?: `0x${string}`;
  deployedBytecode?: `0x${string}`;
}

export interface EvmContractAdapterConfig {
  contractAddress: `0x${string}`;
  privateKey: `0x${string}`;
  syncProtocolName: string;
  artifact: HardhatArtifact;
  chain?: Chain;
  rpcUrl?: string;
  maxBatchSize?: number;
}

type NormalizedPayload = {
  method: string;
  args: unknown[];
  value?: bigint;
};

function isViewFunction(fn: AbiFunction): boolean {
  return fn.stateMutability === "view" || fn.stateMutability === "pure";
}

export class EvmContractAdapter
  implements BlockchainAdapter<EvmBatchPayload | null> {
  private readonly contractAddress: `0x${string}`;
  private readonly syncProtocolName: string;
  private readonly abi: Abi;
  private readonly account: Account;
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient;
  private readonly maxBatchSize: number;

  private readonly builder = new EvmBatchBuilderLogic();

  constructor(config: EvmContractAdapterConfig) {
    this.contractAddress = config.contractAddress;
    this.syncProtocolName = config.syncProtocolName;
    this.abi = config.artifact.abi;
    this.maxBatchSize = config.maxBatchSize ?? 10000;

    this.account = privateKeyToAccount(config.privateKey);

    const transport = http(config.rpcUrl);
    const chain = config.chain ?? chains.hardhat;

    this.publicClient = createPublicClient({
      chain,
      transport,
    });

    this.walletClient = createWalletClient({
      account: this.account,
      chain,
      transport,
    });
  }

  getSyncProtocolName(): string {
    return this.syncProtocolName;
  }

  getAccountAddress(): string {
    return this.account.address;
  }

  getChainName(): string {
    return this.publicClient.chain?.name ?? "EVM Chain";
  }

  isReady(): boolean {
    return Boolean(this.publicClient && this.walletClient);
  }

  async getBlockNumber(): Promise<bigint> {
    return await this.publicClient.getBlockNumber();
  }

  buildBatchData(
    inputs: DefaultBatcherInput[],
    _options?: BatchBuildingOptions,
  ): BatchBuildingResult<EvmBatchPayload | null> | null {
    const options = { maxSize: this.maxBatchSize };
    return this.builder.buildBatchData(inputs, options);
  }

  async estimateBatchFee(
    data: EvmBatchPayload | null,
  ): Promise<string | bigint> {
    if (!data || data.payloads.length === 0) {
      return 0n;
    }

    const payload = this.normalizePayload(data.payloads[0]);
    const fn = this.findMatchingFunction(payload.method, payload.args);

    if (isViewFunction(fn)) return 0n;

    const gas = await this.publicClient.estimateContractGas({
      account: this.account,
      address: this.contractAddress,
      abi: this.abi,
      functionName: payload.method,
      args: payload.args as any[],
      value: payload.value,
    });

    const fees = await this.publicClient.estimateFeesPerGas();
    const gasPrice = fees.maxFeePerGas ?? fees.gasPrice ?? 0n;
    return gas * gasPrice;
  }

  async submitBatch(
    data: EvmBatchPayload | null,
    _fee?: string | bigint,
  ): Promise<BlockchainHash> {
    if (!data || data.payloads.length === 0) {
      throw new Error("EVM batch payload contained no invocations");
    }

    if (data.payloads.length > 1) {
      console.warn(
        `EvmContractAdapter received ${data.payloads.length} invocations. Only the first will be processed.`,
      );
    }

    const payload = this.normalizePayload(data.payloads[0]);
    console.log(
      `[EvmAdapter] Submitting payload for ${this.contractAddress} ::`,
      payload,
    );
    const fn = this.findMatchingFunction(payload.method, payload.args);

    if (isViewFunction(fn)) {
      const result = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: this.abi,
        functionName: payload.method,
        args: payload.args as any[],
      });
      console.log(
        `[EvmAdapter] Pure/view call result for ${payload.method}:`,
        result,
      );
      return `query:${payload.method}:${JSON.stringify(result)}`;
    }

    console.log(
      "[EvmAdapter] Calling impure method",
      payload.method,
      "with args",
      payload.args,
      "value",
      payload.value,
    );
    const hash = await this.walletClient.writeContract({
      account: this.account,
      address: this.contractAddress,
      abi: this.abi,
      functionName: payload.method,
      args: payload.args as any[],
      value: payload.value,
      chain: this.walletClient.chain,
    });
    console.log("[EvmAdapter] Submitted tx hash:", hash);

    return hash;
  }

  async waitForTransactionReceipt(
    hash: BlockchainHash,
    timeout?: number,
  ): Promise<BlockchainTransactionReceipt> {
    console.log(`[EvmAdapter] Waiting for receipt: ${hash}`);
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: hash as Hash,
      timeout,
    });
    console.log(
      `[EvmAdapter] Receipt confirmed for ${hash}:`,
      receipt.status,
      "block",
      receipt.blockNumber,
    );

    return {
      hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === "success" ? 1 : 0,
      _viemReceipt: receipt,
    };
  }

  async validateInput(
    input: DefaultBatcherInput,
  ): Promise<ValidationResult> {
    try {
      const payload = parseEvmBatcherInput(input);
      const normalized: NormalizedPayload = {
        method: payload.method,
        args: payload.args,
        value: payload.value !== undefined ? BigInt(payload.value) : undefined,
      };

      const fn = this.findMatchingFunction(
        normalized.method,
        normalized.args,
      );

      if (normalized.value !== undefined && fn.stateMutability === "nonpayable") {
        return {
          valid: false,
          error: `Function "${normalized.method}" is nonpayable but value was provided`,
        };
      }

      // Attempt encoding to verify argument shapes
      encodeFunctionData({
        abi: this.abi,
        functionName: normalized.method,
        args: normalized.args as any[],
      });

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private normalizePayload(
    raw: EvmBatchPayload["payloads"][number],
  ): NormalizedPayload {
    return {
      method: raw.method,
      args: raw.args,
      value: raw.value !== undefined ? BigInt(raw.value) : undefined,
    };
  }

  private findMatchingFunction(
    method: string,
    args: unknown[],
  ): AbiFunction {
    const candidates = (this.abi ?? []).filter(
      (item): item is AbiFunction =>
        item.type === "function" && item.name === method,
    );

    if (candidates.length === 0) {
      throw new Error(`Function "${method}" not found in ABI`);
    }

    for (const candidate of candidates) {
      if (candidate.inputs.length !== args.length) {
        continue;
      }

      try {
        encodeFunctionData({
          abi: [candidate],
          functionName: method,
          args: args as any[],
        });
        return candidate;
      } catch {
        // Try next overload
      }
    }

    throw new Error(
      `No ABI overload for "${method}" matches ${args.length} argument(s)`,
    );
  }
}

