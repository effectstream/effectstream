/**
 * Cardano MintBurn Primitive
 *
 * Detects native token minting and burning events from Dolos UTxORPC block data.
 *
 * Data source: Dolos streams raw Cardano blocks via gRPC (UTxORPC protocol). Each
 * block contains transactions, and each transaction has a `mint` field — a list of
 * `Multiasset` entries, each with a `policyId` and a list of `Asset` entries (name +
 * quantity). Positive quantities = mints, negative = burns.
 *
 * Extraction: for each transaction matched by the predicate, `getPayload()` iterates
 * `tx.mint`, filters by configured `policyIds`, and collects `{policyId, assetName, amount}`.
 * It also extracts input addresses from `tx.inputs[].asOutput.address` (resolved UTxOs
 * provided by Dolos) and output addresses from `tx.outputs[].address`.
 *
 * Predicate: uses `mints_asset` with the configured policy IDs, so Dolos only sends
 * transactions that actually mint/burn tokens under those policies.
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
import { mintBurnGrammar } from "./mint-burn-grammar.ts";
import { PrimitiveTypeCardanoMintBurn } from "../builtin.ts";
import {
  addressToHex,
  assetQuantityToString,
  metadataToJson,
} from "../cardano-utils/cardano-helpers.ts";

export class CardanoMintBurnPrimitive extends Primitive<
  ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL,
  typeof mintBurnGrammar
> {
  readonly internalTypeName = PrimitiveTypeCardanoMintBurn;
  readonly policyIds: string[];
  override grammar = mintBurnGrammar;

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    stateMachinePrefix: string | undefined;
    policyIds: string[];
  }) {
    super(config);
    this.policyIds = config.policyIds.map((p) => p.toLowerCase());
  }

  override getConfig(): ProtocolPrimitiveMap[ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL] {
    // UTxO-RPC's `mints_asset` predicate is interpreted by Dolos as
    // "creates new supply" — it matches only positive-quantity mints and
    // silently filters burns. To catch burns we also match `moves_asset`,
    // which fires when the asset appears in any input/output of the tx
    // (true for burns, since the asset is in the input UTxO being spent).
    // Downstream consumers see both mint and burn payloads through the
    // same primitive; sign-of-quantity discriminates.
    const matchPolicy = (pid: string): UtxorpcTxPredicate => ({
      any_of: [
        { match: { cardano: { mints_asset: { policy_id: pid } } } },
        { match: { cardano: { moves_asset: { policy_id: pid } } } },
      ],
    });
    const predicate: UtxorpcTxPredicate =
      this.policyIds.length === 1
        ? matchPolicy(this.policyIds[0])
        : { any_of: this.policyIds.map(matchPolicy) };

    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      scheduledPrefix: this.stateMachinePrefix,
      predicate,
    } as const;
  }

  override *getPayload(
    _: EffectstreamBlockNumber,
    primitiveTransactionData: FlattenSyncProtocolIOFor<ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL>,
  ): StateUpdateStream<{
    isBatched: boolean;
    data: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload: StaticDecode<CommandTuple<string, typeof mintBurnGrammar>> | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const tx = primitiveTransactionData.output.payload.tx;

    const assets: { amount: string; policyId: string; assetName: string }[] = [];
    for (const ma of tx.mint) {
      const policyId = uint8ArrayToHexString(ma.policyId);
      if (!this.policyIds.includes(policyId.toLowerCase())) continue;
      for (const asset of ma.assets) {
        assets.push({
          amount: assetQuantityToString(asset),
          policyId,
          assetName: uint8ArrayToHexString(asset.name),
        });
      }
    }

    if (assets.length === 0) {
      return { isBatched: false, data: [] };
    }

    const inputAddresses: string[] = [];
    for (const input of tx.inputs) {
      if (input.asOutput) {
        const addr = addressToHex(input.asOutput.address);
        if (!inputAddresses.includes(addr)) inputAddresses.push(addr);
      }
    }

    const outputAddresses: string[] = [];
    for (const output of tx.outputs) {
      const addr = addressToHex(output.address);
      if (!outputAddresses.includes(addr)) outputAddresses.push(addr);
    }

    const txId = uint8ArrayToHexString(tx.hash);
    const metadata = metadataToJson(tx.auxiliary?.metadata ?? []);

    const accountingPayload = {
      txId,
      metadata: metadata ? JSON.stringify(metadata) : null,
      assets,
      inputAddresses,
      outputAddresses,
    };

    const stateMachinePayload: any = this.stateMachinePrefix
      ? generateRawStmInput(this.grammar, this.stateMachinePrefix, {
          txId,
          metadata: metadata ? JSON.stringify(metadata) : "",
          assets: JSON.stringify(assets),
          inputAddresses: JSON.stringify(inputAddresses),
          outputAddresses: JSON.stringify(outputAddresses),
        })
      : null;

    return {
      isBatched: false,
      data: [
        {
          fromAddressAndType: { type: AddressType.NONE, address: "0x0" },
          accountingPayload,
          stateMachinePayload,
        },
      ],
    };
  }
}
