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
import { type JsonObject, Primitive } from "@effectstream/sm";
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
    const predicate: UtxorpcTxPredicate =
      this.policyIds.length === 1
        ? { match: { cardano: { mints_asset: { policy_id: this.policyIds[0] } } } }
        : {
            any_of: this.policyIds.map((pid) => ({
              match: { cardano: { mints_asset: { policy_id: pid } } },
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
