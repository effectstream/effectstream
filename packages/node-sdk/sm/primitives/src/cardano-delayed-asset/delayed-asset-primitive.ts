/**
 * Cardano Delayed Asset Primitive
 *
 * Tracks the lifecycle of native asset UTxOs — creation and spending — from Dolos
 * UTxORPC block data. "Delayed" because asset ownership only becomes final after the
 * UTxO is confirmed on-chain (unlike account-model chains where balances update instantly).
 *
 * Data source: Dolos streams raw Cardano blocks via gRPC. Dolos resolves input UTxO
 * references via its ledger state (Pallas `LedgerContext` trait), so `tx.inputs[].asOutput`
 * contains the full resolved output including address and native assets.
 *
 * Extraction: `getPayload()` performs two scans per transaction:
 *   1. **Creations**: iterates `tx.outputs` — for each output containing native assets
 *      matching configured `policyIds`, emits an entry with `amount = quantity`.
 *   2. **Spendings**: iterates `tx.inputs` — for each resolved input (`asOutput`) with
 *      matching assets, emits an entry with `amount = null` (signals UTxO consumed).
 *
 * Predicate: uses `moves_asset` with configured policy IDs, so Dolos only sends
 * transactions that create or spend UTxOs containing those assets.
 *
 * IVM: maintains a materialized view of live (unspent) asset UTxOs. The trigger INSERTs
 * on creation events (amount != null) and DELETEs the matching UTxO on spending events
 * (amount = null), giving a real-time view of current asset holdings.
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
  UtxorpcTxPredicate,
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
import { delayedAssetGrammar } from "./delayed-asset-grammar.ts";
import {
  DELAYED_ASSET_INTERMEDIATE_PREFIX,
  DELAYED_ASSET_VIEW_PREFIX,
  delayedAssetIvm,
} from "./delayed-asset-ivm.ts";
import { PrimitiveTypeCardanoDelayedAsset } from "../builtin.ts";
import {
  addressToHex,
  assetQuantityToString,
} from "../cardano-utils/cardano-helpers.ts";

export class CardanoDelayedAssetPrimitive extends Primitive<
  ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL,
  typeof delayedAssetGrammar
> {
  readonly internalTypeName = PrimitiveTypeCardanoDelayedAsset;
  readonly policyIds: string[];
  readonly fingerprints: string[] | undefined;
  override grammar = delayedAssetGrammar;

  override dynamicTables = delayedAssetIvm;
  override getIntermediatePrefix(): string[] {
    return [DELAYED_ASSET_INTERMEDIATE_PREFIX];
  }
  override getViewPrefix(): string[] {
    return [DELAYED_ASSET_VIEW_PREFIX];
  }

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    stateMachinePrefix: string | undefined;
    policyIds: string[];
    fingerprints?: string[];
  }) {
    super(config);
    this.policyIds = config.policyIds.map((p) => p.toLowerCase());
    this.fingerprints = config.fingerprints?.map((f) => f.toLowerCase());
  }

  override getConfig(): ProtocolPrimitiveMap[ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL] {
    const predicate: UtxorpcTxPredicate =
      this.policyIds.length === 1
        ? { match: { cardano: { moves_asset: { policy_id: this.policyIds[0] } } } }
        : {
            any_of: this.policyIds.map((pid) => ({
              match: { cardano: { moves_asset: { policy_id: pid } } },
            })),
          };

    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      scheduledPrefix: this.stateMachinePrefix,
      predicate,
    } as const;
  }

  private computeFingerprint(policyId: string, assetName: string): string {
    return `${policyId}.${assetName}`;
  }

  override *getPayload(
    _: EffectstreamBlockNumber,
    primitiveTransactionData: FlattenSyncProtocolIOFor<ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL>,
  ): StateUpdateStream<{
    isBatched: boolean;
    data: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload: StaticDecode<CommandTuple<string, typeof delayedAssetGrammar>> | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const tx = primitiveTransactionData.output.payload.tx;
    const txId = uint8ArrayToHexString(tx.hash);

    const entries: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload: any;
      accountingPayload: JsonObject;
    }[] = [];

    // Creations: scan tx.outputs
    for (let outputIndex = 0; outputIndex < tx.outputs.length; outputIndex++) {
      const output = tx.outputs[outputIndex];
      const address = addressToHex(output.address);

      for (const ma of output.assets) {
        const policyId = uint8ArrayToHexString(ma.policyId);
        if (!this.policyIds.includes(policyId.toLowerCase())) continue;

        for (const asset of ma.assets) {
          const assetName = uint8ArrayToHexString(asset.name);
          const fingerprint = this.computeFingerprint(policyId, assetName);

          if (this.fingerprints && !this.fingerprints.includes(fingerprint.toLowerCase())) continue;

          const amount = assetQuantityToString(asset);

          const accountingPayload = {
            address,
            txId,
            outputIndex,
            cip14Fingerprint: fingerprint,
            amount,
            policyId,
            assetName,
          };

          const stateMachinePayload: any = this.stateMachinePrefix
            ? generateRawStmInput(this.grammar, this.stateMachinePrefix, {
                address,
                txId,
                outputIndex: String(outputIndex),
                cip14Fingerprint: fingerprint,
                amount,
                policyId,
                assetName,
              })
            : null;

          entries.push({
            fromAddressAndType: { type: AddressType.NONE, address: "0x0" },
            accountingPayload,
            stateMachinePayload,
          });
        }
      }
    }

    // Spendings: scan tx.inputs (resolved via Dolos)
    for (const input of tx.inputs) {
      if (!input.asOutput) continue;
      const resolved = input.asOutput;
      const address = addressToHex(resolved.address);
      const inputTxHash = uint8ArrayToHexString(input.txHash);
      const inputOutputIndex = input.outputIndex;

      for (const ma of resolved.assets) {
        const policyId = uint8ArrayToHexString(ma.policyId);
        if (!this.policyIds.includes(policyId.toLowerCase())) continue;

        for (const asset of ma.assets) {
          const assetName = uint8ArrayToHexString(asset.name);
          const fingerprint = this.computeFingerprint(policyId, assetName);

          if (this.fingerprints && !this.fingerprints.includes(fingerprint.toLowerCase())) continue;

          const accountingPayload = {
            address,
            txId: inputTxHash,
            outputIndex: inputOutputIndex,
            cip14Fingerprint: fingerprint,
            amount: null,
            policyId,
            assetName,
          };

          const stateMachinePayload: any = this.stateMachinePrefix
            ? generateRawStmInput(this.grammar, this.stateMachinePrefix, {
                address,
                txId: inputTxHash,
                outputIndex: String(inputOutputIndex),
                cip14Fingerprint: fingerprint,
                amount: "",
                policyId,
                assetName,
              })
            : null;

          entries.push({
            fromAddressAndType: { type: AddressType.NONE, address: "0x0" },
            accountingPayload,
            stateMachinePayload,
          });
        }
      }
    }

    return { isBatched: true, data: entries };
  }
}
