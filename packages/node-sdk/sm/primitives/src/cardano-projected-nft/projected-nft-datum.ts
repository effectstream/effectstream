import { uint8ArrayToHexString } from "@effectstream/utils";
import type { cardano } from "@utxorpc/spec";

export type ProjectedNftStatus = "Lock" | "Unlocking" | "Claim";

export interface ProjectedNftDatum {
  owner: string;
  status: ProjectedNftStatus;
  forHowLong: string | null;
}

/**
 * Parses the hololocker State datum: State { owner: Owner, status: Status }
 * Owner: PKH(ByteArray) | NFT(PolicyId, AssetName) | Receipt(AssetName)
 * Status: Locked | Unlocking { out_ref: OutputReference, for_how_long: Int }
 *
 * Note: policyId and assetName of locked assets come from the UTxO value, not the datum.
 */
export function parseProjectedNftDatum(datum: cardano.PlutusData | undefined): ProjectedNftDatum | null {
  if (!datum) return null;

  const pd = datum.plutusData;
  if (pd.case !== "constr") return null;

  const constr = pd.value;
  if (constr.fields.length < 2) return null;

  const ownerField = constr.fields[0];
  const statusField = constr.fields[1];

  const owner = parseOwner(ownerField);
  if (owner == null) return null;

  const statusParsed = parseStatus(statusField);
  if (!statusParsed) return null;

  return {
    owner,
    status: statusParsed.status,
    forHowLong: statusParsed.forHowLong,
  };
}

function extractBytes(field: cardano.PlutusData): string | null {
  const inner = field.plutusData;
  if (inner.case === "boundedBytes") {
    return uint8ArrayToHexString(inner.value);
  }
  return null;
}

function parseOwner(field: cardano.PlutusData): string | null {
  const inner = field.plutusData;
  if (inner.case !== "constr") return null;

  const tag = inner.value.tag;

  // PKH(ByteArray) — constructor 0
  if (tag === 0 || tag === 121) {
    if (inner.value.fields.length < 1) return null;
    return extractBytes(inner.value.fields[0]);
  }

  // NFT(PolicyId, AssetName) — constructor 1: use policyId as owner identifier
  if (tag === 1 || tag === 122) {
    if (inner.value.fields.length < 1) return null;
    return extractBytes(inner.value.fields[0]);
  }

  // Receipt(AssetName) — constructor 2
  if (tag === 2 || tag === 123) {
    if (inner.value.fields.length < 1) return null;
    return extractBytes(inner.value.fields[0]);
  }

  return null;
}

function parseStatus(field: cardano.PlutusData): { status: ProjectedNftStatus; forHowLong: string | null } | null {
  const inner = field.plutusData;
  if (inner.case !== "constr") return null;

  const tag = inner.value.tag;

  // Constructor 0 = Locked
  if (tag === 0 || tag === 121) {
    return { status: "Lock", forHowLong: null };
  }

  // Constructor 1 = Unlocking { out_ref: OutputReference, for_how_long: Int }
  // fields[0] = OutputReference, fields[1] = for_how_long
  if (tag === 1 || tag === 122) {
    let forHowLong: string | null = null;
    if (inner.value.fields.length > 1) {
      const timefield = inner.value.fields[1].plutusData;
      if (timefield.case === "bigInt") {
        const bi = timefield.value.bigInt;
        if (bi.case === "int") {
          forHowLong = String(bi.value);
        }
      }
    }
    return { status: "Unlocking", forHowLong };
  }

  return null;
}
