import { cardano } from "@utxorpc/spec";
import { hexStringToUint8Array, uint8ArrayToHexString } from "@effectstream/utils";

// The generic UTxORPC primitive forwards `{ hash, bytes }` where `bytes` is the hex of
// `cardano.Tx.toBinary()` (a @utxorpc/spec protobuf-es v1 message). This module deserializes it
// in the STM, reusing the same extraction logic the builtin Cardano:Transfer primitive uses.

export interface DecodedOutput {
  index: number;
  address: string; // hex of raw address bytes (matches launchpad cardanoPaymentAddressHex)
  coin: string;    // lovelace as decimal string
  assets: { policyId: string; assetName: string; amount: string }[];
}

export interface DecodedTx {
  txId: string;
  outputs: DecodedOutput[];
  metadata: Record<string, unknown> | null; // { "42": [ {k,v}, ... ] }
}

function bigIntToString(bi: cardano.BigInt): string {
  const inner = bi.bigInt;
  if (inner.case === "int") return String(inner.value);
  if (inner.case === "bigUInt") {
    let r = 0n;
    for (const b of inner.value) r = (r << 8n) | BigInt(b);
    return String(r);
  }
  if (inner.case === "bigNInt") {
    let r = 0n;
    for (const b of inner.value) r = (r << 8n) | BigInt(b);
    return String(-r);
  }
  return "0";
}

function assetQuantityToString(asset: cardano.Asset): string {
  const q = asset.quantity;
  if (q.case === "outputCoin" || q.case === "mintCoin") return bigIntToString(q.value);
  return "0";
}

function metadatumToJson(m: cardano.Metadatum): unknown {
  const inner = m.metadatum;
  if (!inner || inner.case === undefined) return null;
  switch (inner.case) {
    case "int": return String(inner.value);
    case "bytes": return uint8ArrayToHexString(inner.value);
    case "text": return inner.value;
    case "array": return inner.value.items.map(metadatumToJson);
    case "map":
      return inner.value.pairs.map((p) => ({
        k: p.key ? metadatumToJson(p.key) : null,
        v: p.value ? metadatumToJson(p.value) : null,
      }));
    default: return null;
  }
}

function metadataToJson(metadata: cardano.Metadata[]): Record<string, unknown> | null {
  if (!metadata || metadata.length === 0) return null;
  const result: Record<string, unknown> = {};
  for (const entry of metadata) {
    result[String(entry.label)] = entry.value ? metadatumToJson(entry.value) : null;
  }
  return result;
}

export function decodeUtxorpcTx(bytesHex: string): DecodedTx {
  const tx = cardano.Tx.fromBinary(hexStringToUint8Array(bytesHex));
  const txId = uint8ArrayToHexString(tx.hash);

  const outputs: DecodedOutput[] = tx.outputs.map((out, index) => {
    const address = uint8ArrayToHexString(out.address);
    const coin = out.coin?.bigInt.case === "int"
      ? String(out.coin.bigInt.value)
      : out.coin?.bigInt.case === "bigUInt"
      ? (() => {
          let r = 0n;
          for (const b of out.coin!.bigInt.value as Uint8Array) r = (r << 8n) | BigInt(b);
          return String(r);
        })()
      : "0";

    const assets: DecodedOutput["assets"] = [];
    for (const ma of out.assets) {
      const policyId = uint8ArrayToHexString(ma.policyId);
      for (const a of ma.assets) {
        assets.push({
          policyId,
          assetName: uint8ArrayToHexString(a.name),
          amount: assetQuantityToString(a),
        });
      }
    }
    return { index, address, coin, assets };
  });

  const metadata = metadataToJson(tx.auxiliary?.metadata ?? []);
  return { txId, outputs, metadata };
}
