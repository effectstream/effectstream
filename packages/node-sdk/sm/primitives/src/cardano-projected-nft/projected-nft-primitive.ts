/**
 * Cardano Projected NFT Primitive
 *
 * Tracks the Lock → Unlock → Claim lifecycle of NFTs locked at a Plutus script
 * (the "hololocker" from projected-nft-whirlpool). This enables "projecting" on-chain
 * NFTs into off-chain game state while the NFT remains provably locked on Cardano.
 *
 * Data source: Dolos streams raw Cardano blocks via gRPC. Dolos resolves spent input
 * references, so `tx.inputs[].asOutput` contains the full resolved UTxO including its
 * inline datum (the hololocker State datum).
 *
 * Extraction: `getPayload()` performs three detection steps:
 *   1. **Script inputs**: collects all `tx.inputs` whose resolved address contains the
 *      configured `scriptHash`. These are UTxOs being consumed from the hololocker.
 *   2. **Script outputs** (Lock / Unlocking): iterates `tx.outputs` at the script address,
 *      parses the inline datum via `parseProjectedNftDatum()` to extract owner, status,
 *      and forHowLong. Matches each output to a consumed input (state transition) or
 *      treats it as a fresh Lock if no matching input exists.
 *   3. **Claims**: any script inputs NOT matched to an output are Claims — the NFT left
 *      the script and returned to the owner's wallet.
 *
 * Datum parsing: the hololocker State datum is CBOR-encoded PlutusData with structure:
 *   State { owner: Owner(PKH|NFT|Receipt), status: Locked | Unlocking(out_ref, for_how_long) }
 * The datum parser (`projected-nft-datum.ts`) walks the Constr tree to extract owner hash,
 * status, and the time-lock expiry (forHowLong) for Unlocking states.
 *
 * Predicate: uses `has_address` with `payment_part: scriptHash`, so Dolos only sends
 * transactions that interact with the hololocker script address.
 *
 * IVM: maintains a materialized view of NFT states at the script. The trigger UPSERTs
 * on Lock/Unlocking events and DELETEs on Claim events, providing a real-time view of
 * which NFTs are currently locked or unlocking.
 */

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
import { Primitive } from "../../Primitive.ts";
import type { JsonObject } from "../../types.ts";
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
