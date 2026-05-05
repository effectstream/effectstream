import type { StaticDecode } from "@sinclair/typebox";
import {
  type CommandTuple,
  generateRawStmInput,
} from "@effectstream/concise";
import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  ProtocolPrimitiveMap,
} from "@effectstream/config";
import type { StateUpdateStream } from "@effectstream/coroutine";
import { type JsonObject, Primitive } from "@effectstream/sm";
import {
  type AddressAndType,
  AddressType,
  type EffectstreamBlockNumber,
  uint8ArrayToHexString,
} from "@effectstream/utils";
import { projectedNftGrammar } from "./projected-nft-grammar.ts";
import {
  PROJECTED_NFT_INTERMEDIATE_PREFIX,
  PROJECTED_NFT_VIEW_PREFIX,
  projectedNftIvm,
} from "./projected-nft-ivm.ts";
import { PrimitiveTypeCardanoProjectedNFT } from "../builtin.ts";
import { addressToHex } from "../cardano-utils/cardano-helpers.ts";
import { parseProjectedNftDatum, type ProjectedNftDatum } from "./projected-nft-datum.ts";

export class CardanoProjectedNftPrimitive extends Primitive<
  ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL,
  typeof projectedNftGrammar
> {
  readonly internalTypeName = PrimitiveTypeCardanoProjectedNFT;
  readonly scriptHash: string;
  override grammar = projectedNftGrammar;

  override dynamicTables = projectedNftIvm;
  override getIntermediatePrefix(): string[] {
    return [PROJECTED_NFT_INTERMEDIATE_PREFIX];
  }
  override getViewPrefix(): string[] {
    return [PROJECTED_NFT_VIEW_PREFIX];
  }

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    stateMachinePrefix: string | undefined;
    scriptHash: string;
  }) {
    super(config);
    this.scriptHash = config.scriptHash.toLowerCase();
  }

  override getConfig(): ProtocolPrimitiveMap[ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL] {
    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      scheduledPrefix: this.stateMachinePrefix,
      predicate: {
        match: { cardano: { has_address: { payment_part: this.scriptHash } } },
      },
    } as const;
  }

  private isScriptAddress(address: Uint8Array): boolean {
    const hex = addressToHex(address);
    return hex.includes(this.scriptHash);
  }

  private extractNativeAssets(output: { assets: { policyId: Uint8Array; assets: { name: Uint8Array }[] }[] }): { policyId: string; assetName: string }[] {
    const assets: { policyId: string; assetName: string }[] = [];
    for (const ma of output.assets) {
      const policyId = uint8ArrayToHexString(ma.policyId);
      for (const asset of ma.assets) {
        const assetName = uint8ArrayToHexString(asset.name);
        assets.push({ policyId, assetName });
      }
    }
    return assets;
  }

  private emitEntry(
    parsed: ProjectedNftDatum,
    previousTxId: string | null,
    previousOutputIndex: number | null,
    currentTxId: string,
    currentOutputIndex: number | string,
    policyId: string,
    assetName: string,
    statusOverride?: "Claim",
  ): {
    fromAddressAndType: AddressAndType;
    stateMachinePayload: any;
    accountingPayload: JsonObject;
  } {
    const status = statusOverride ?? parsed.status;
    const accountingPayload = {
      ownerAddress: parsed.owner,
      previousTxId: previousTxId ?? "",
      previousOutputIndex: previousOutputIndex != null ? previousOutputIndex : "",
      currentTxId,
      currentOutputIndex,
      policyId,
      assetName,
      status,
      forHowLong: parsed.forHowLong ?? "",
    };

    const stateMachinePayload: any = this.stateMachinePrefix
      ? generateRawStmInput(this.grammar, this.stateMachinePrefix, {
          ownerAddress: parsed.owner,
          previousTxId: previousTxId ?? "",
          previousOutputIndex: previousOutputIndex != null ? String(previousOutputIndex) : "",
          currentTxId,
          currentOutputIndex: String(currentOutputIndex),
          policyId,
          assetName,
          status,
          forHowLong: parsed.forHowLong ?? "",
        })
      : null;

    return {
      fromAddressAndType: { type: AddressType.NONE, address: "0x0" },
      accountingPayload,
      stateMachinePayload,
    };
  }

  override *getPayload(
    _: EffectstreamBlockNumber,
    primitiveTransactionData: FlattenSyncProtocolIOFor<ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL>,
  ): StateUpdateStream<{
    isBatched: boolean;
    data: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload: StaticDecode<CommandTuple<string, typeof projectedNftGrammar>> | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const tx = primitiveTransactionData.output.payload.tx;
    const currentTxId = uint8ArrayToHexString(tx.hash);

    const entries: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload: any;
      accountingPayload: JsonObject;
    }[] = [];

    // Build a set of script inputs (previous UTxOs being consumed)
    const scriptInputs: Map<string, { txHash: string; outputIndex: number; resolved: any }> = new Map();
    for (const input of tx.inputs) {
      if (input.asOutput && this.isScriptAddress(input.asOutput.address)) {
        const key = `${uint8ArrayToHexString(input.txHash)}#${input.outputIndex}`;
        scriptInputs.set(key, {
          txHash: uint8ArrayToHexString(input.txHash),
          outputIndex: input.outputIndex,
          resolved: input.asOutput,
        });
      }
    }

    // Script outputs (new UTxOs at script address) — Lock or Unlocking events
    for (let outputIndex = 0; outputIndex < tx.outputs.length; outputIndex++) {
      const output = tx.outputs[outputIndex];
      if (!this.isScriptAddress(output.address)) continue;

      const parsed = parseProjectedNftDatum(output.datum?.payload);
      if (!parsed) continue;

      // Find a matching script input (state transition: Lock→Unlocking)
      let previousTxId: string | null = null;
      let previousOutputIndex: number | null = null;

      for (const [key, inp] of scriptInputs) {
        previousTxId = inp.txHash;
        previousOutputIndex = inp.outputIndex;
        scriptInputs.delete(key);
        break;
      }

      // Extract policyId/assetName from the output's native assets
      const assets = this.extractNativeAssets(output);
      for (const { policyId, assetName } of assets) {
        entries.push(
          this.emitEntry(parsed, previousTxId, previousOutputIndex, currentTxId, outputIndex, policyId, assetName),
        );
      }
    }

    // Remaining script inputs with no corresponding output = Claims
    for (const [, inp] of scriptInputs) {
      const parsed = parseProjectedNftDatum(inp.resolved.datum?.payload);
      if (!parsed) continue;

      const assets = this.extractNativeAssets(inp.resolved);
      for (const { policyId, assetName } of assets) {
        entries.push(
          this.emitEntry(parsed, inp.txHash, inp.outputIndex, currentTxId, "", policyId, assetName, "Claim"),
        );
      }
    }

    return { isBatched: true, data: entries };
  }
}
