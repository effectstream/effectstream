/**
 * Cardano Transfer Primitive
 *
 * Captures ADA and native asset transfers from Dolos UTxORPC block data.
 *
 * Data source: Dolos streams raw Cardano blocks via gRPC. Each transaction contains
 * `outputs` (destination UTxOs with address, lovelace coin, and native assets) and
 * `witnesses.vkeywitness` (verification key witnesses proving input authorization).
 *
 * Extraction: for each matched transaction, `getPayload()` maps `tx.outputs` into
 * structured objects with `{index, address, coin, assets[]}`. Coin values are extracted
 * from the protobuf BigInt (either `int` for small values or `bigUInt` for large).
 * `inputCredentials` retains the raw `tx.witnesses.vkeywitness[].vkey` values for
 * backward compatibility, but is deprecated because those values are not credentials.
 * `signerKeyHashes` hashes each verification key with BLAKE2b-224, yielding the
 * Cardano key hashes that identify who authorized the transaction.
 * Transaction metadata is extracted from `tx.auxiliary.metadata`.
 *
 * Predicate: user-provided (typically `has_address` to watch specific addresses).
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
import { transferGrammar } from "./transfer-grammar.ts";
import { PrimitiveTypeCardanoTransfer } from "../builtin.ts";
import {
  addressToHex,
  assetQuantityToString,
  metadataToJson,
  verificationKeyToCredentialHex,
} from "../cardano-utils/cardano-helpers.ts";

export class CardanoTransferPrimitive extends Primitive<
  ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL,
  typeof transferGrammar
> {
  readonly internalTypeName = PrimitiveTypeCardanoTransfer;
  readonly predicate: UtxorpcTxPredicate;
  override grammar = transferGrammar;

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    stateMachinePrefix: string | undefined;
    predicate: UtxorpcTxPredicate;
  }) {
    super(config);
    this.predicate = config.predicate;
  }

  override getConfig(): ProtocolPrimitiveMap[ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL] {
    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      scheduledPrefix: this.stateMachinePrefix,
      predicate: this.predicate,
    } as const;
  }

  override *getPayload(
    _: EffectstreamBlockNumber,
    primitiveTransactionData: FlattenSyncProtocolIOFor<ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL>,
  ): StateUpdateStream<{
    isBatched: boolean;
    data: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload: StaticDecode<CommandTuple<string, typeof transferGrammar>> | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const tx = primitiveTransactionData.output.payload.tx;

    const txId = uint8ArrayToHexString(tx.hash);

    const outputs = tx.outputs.map((out, index) => {
      const address = addressToHex(out.address);
      const coin = out.coin?.bigInt.case === "int"
        ? String(out.coin.bigInt.value)
        : out.coin?.bigInt.case === "bigUInt"
          ? uint8ArrayToHexString(out.coin.bigInt.value)
          : "0";

      const assets: { policyId: string; assetName: string; amount: string }[] = [];
      for (const ma of out.assets) {
        const policyId = uint8ArrayToHexString(ma.policyId);
        for (const asset of ma.assets) {
          assets.push({
            policyId,
            assetName: uint8ArrayToHexString(asset.name),
            amount: assetQuantityToString(asset),
          });
        }
      }

      return { index, address, coin, assets };
    });

    const inputCredentials: string[] = [];
    const signerKeyHashes: string[] = [];
    if (tx.witnesses) {
      for (const w of tx.witnesses.vkeywitness) {
        const verificationKey = uint8ArrayToHexString(w.vkey);
        if (!inputCredentials.includes(verificationKey)) {
          inputCredentials.push(verificationKey);
        }

        const signerKeyHash = verificationKeyToCredentialHex(w.vkey);
        if (!signerKeyHashes.includes(signerKeyHash)) {
          signerKeyHashes.push(signerKeyHash);
        }
      }
    }

    const metadata = metadataToJson(tx.auxiliary?.metadata ?? []);

    const accountingPayload = {
      txId,
      metadata: metadata ? JSON.stringify(metadata) : null,
      inputCredentials,
      outputs,
      signerKeyHashes,
    };

    const stateMachinePayload: any = this.stateMachinePrefix
      ? generateRawStmInput(this.grammar, this.stateMachinePrefix, {
          txId,
          metadata: metadata ? JSON.stringify(metadata) : "",
          inputCredentials: JSON.stringify(inputCredentials),
          outputs: JSON.stringify(outputs),
          signerKeyHashes: JSON.stringify(signerKeyHashes),
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
