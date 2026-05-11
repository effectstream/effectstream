import { Type } from "@sinclair/typebox";
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

export const PrimitiveTypeCardanoTransfer = "Cardano:Transfer" as const;

export const transferGrammar = [
  ["txId", Type.String()],
  ["metadata", Type.String()],
  ["inputCredentials", Type.String()],
  ["outputs", Type.String()],
] as const;

function addressToHex(address: Uint8Array): string {
  return uint8ArrayToHexString(address);
}

function metadatumToJson(m: any): unknown {
  const inner = m.metadatum;
  if (!inner || inner.case === undefined) return null;
  switch (inner.case) {
    case "int": return String(inner.value);
    case "bytes": return uint8ArrayToHexString(inner.value);
    case "text": return inner.value;
    case "array": return inner.value.items.map(metadatumToJson);
    case "map": return inner.value.pairs.map((p: any) => ({
      k: p.key ? metadatumToJson(p.key) : null,
      v: p.value ? metadatumToJson(p.value) : null,
    }));
    default: return null;
  }
}

function metadataToJson(metadata: any[]): Record<string, unknown> | null {
  if (!metadata || metadata.length === 0) return null;
  const result: Record<string, unknown> = {};
  for (const entry of metadata) {
    result[String(entry.label)] = entry.value ? metadatumToJson(entry.value) : null;
  }
  return result;
}

function assetQuantityToString(asset: any): string {
  const q = asset.quantity;
  if (!q) return "0";
  const bi = q.case === "outputCoin" || q.case === "mintCoin" ? q.value : null;
  if (!bi) return "0";
  const inner = bi.bigInt;
  if (inner.case === "int") return String(inner.value);
  if (inner.case === "bigUInt") {
    let result = 0n;
    for (const byte of inner.value) result = (result << 8n) | BigInt(byte);
    return String(result);
  }
  return "0";
}

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

    const outputs = tx.outputs.map((out: any, index: number) => {
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
    if (tx.witnesses) {
      for (const w of tx.witnesses.vkeywitness) {
        const hash = uint8ArrayToHexString(w.vkey);
        if (!inputCredentials.includes(hash)) inputCredentials.push(hash);
      }
    }

    const metadata = metadataToJson(tx.auxiliary?.metadata ?? []);

    const accountingPayload = {
      txId,
      metadata: metadata ? JSON.stringify(metadata) : null,
      inputCredentials,
      outputs,
    };

    const stateMachinePayload: any = this.stateMachinePrefix
      ? generateRawStmInput(this.grammar, this.stateMachinePrefix, {
          txId,
          metadata: metadata ? JSON.stringify(metadata) : "",
          inputCredentials: JSON.stringify(inputCredentials),
          outputs: JSON.stringify(outputs),
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
