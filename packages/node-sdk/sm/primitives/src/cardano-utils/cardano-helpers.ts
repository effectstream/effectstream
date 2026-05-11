import { uint8ArrayToHexString } from "@effectstream/utils";
import type { cardano } from "@utxorpc/spec";

type CardanoNetwork = "preview" | "preprod" | "mainnet" | "yaci";

const epochParams: Record<CardanoNetwork, { firstSlot: number; slotsPerEpoch: number; firstEpoch: number }> = {
  mainnet:  { firstSlot: 4_492_800, slotsPerEpoch: 432_000, firstEpoch: 208 },
  preprod:  { firstSlot: 86_400,    slotsPerEpoch: 432_000, firstEpoch: 4 },
  preview:  { firstSlot: 0,         slotsPerEpoch: 86_400,  firstEpoch: 0 },
  yaci:     { firstSlot: 0,         slotsPerEpoch: 600,     firstEpoch: 0 },
};

export function slotToEpoch(slot: number, network: CardanoNetwork): number {
  const params = epochParams[network];
  if (slot < params.firstSlot) return 0;
  return params.firstEpoch + Math.floor((slot - params.firstSlot) / params.slotsPerEpoch);
}

export function stakeCredentialToHex(cred: cardano.StakeCredential): { type: "key" | "script"; hash: string } | null {
  const inner = cred.stakeCredential;
  if (inner.case === "addrKeyHash") {
    return { type: "key", hash: uint8ArrayToHexString(inner.value) };
  }
  if (inner.case === "scriptHash") {
    return { type: "script", hash: uint8ArrayToHexString(inner.value) };
  }
  return null;
}

export function addressToHex(address: Uint8Array): string {
  return uint8ArrayToHexString(address);
}

export function metadataToJson(metadata: cardano.Metadata[]): Record<string, unknown> | null {
  if (!metadata || metadata.length === 0) return null;
  const result: Record<string, unknown> = {};
  for (const entry of metadata) {
    result[String(entry.label)] = entry.value ? metadatumToJson(entry.value) : null;
  }
  return result;
}

function metadatumToJson(m: cardano.Metadatum): unknown {
  const inner = m.metadatum;
  if (!inner || inner.case === undefined) return null;
  switch (inner.case) {
    case "int": return String(inner.value);
    case "bytes": return uint8ArrayToHexString(inner.value);
    case "text": return inner.value;
    case "array": return inner.value.items.map(metadatumToJson);
    case "map": return inner.value.pairs.map(p => ({
      k: p.key ? metadatumToJson(p.key) : null,
      v: p.value ? metadatumToJson(p.value) : null,
    }));
    default: return null;
  }
}

function bigIntToString(bi: cardano.BigInt): string {
  const inner = bi.bigInt;
  if (inner.case === "int") return String(inner.value);
  if (inner.case === "bigUInt") {
    let result = 0n;
    for (const byte of inner.value) result = (result << 8n) | BigInt(byte);
    return String(result);
  }
  if (inner.case === "bigNInt") {
    let result = 0n;
    for (const byte of inner.value) result = (result << 8n) | BigInt(byte);
    return String(-result);
  }
  return "0";
}

export function assetQuantityToString(asset: cardano.Asset): string {
  const q = asset.quantity;
  if (q.case === "outputCoin") return bigIntToString(q.value);
  if (q.case === "mintCoin") return bigIntToString(q.value);
  return "0";
}

export function isMintQuantity(asset: cardano.Asset): boolean {
  return asset.quantity.case === "mintCoin";
}
