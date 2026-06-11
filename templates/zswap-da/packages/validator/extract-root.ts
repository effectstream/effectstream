import { Buffer } from "node:buffer";
import type { UnprovenTransaction } from "@midnight-ntwrk/ledger-v8";

// Extracts a shielded input's merkle_tree_root from a serialized ZswapInput,
// pinned to the `zswap-input[v2]` layout. The ledger-v8 binding does not expose
// the root as a getter, so we read it from the serialized bytes.
//
// Layout (verified empirically against the live devnet — see
// packages/tests/discover-root-layout.ts): `ZswapInput.serialize()` is a
// `tagged_serialize` ASCII header (`midnight:zswap-input[v2](proof[vN]):` + a
// few framing bytes) followed by the struct body. The body begins with the
// 32-byte nullifier; the merkle_tree_root is a SCALE-encoded run starting
// ROOT_GAP_AFTER_NULLIFIER bytes after the nullifier (value_commitment +
// the contract_address Option for a non-contract input). The run's bytes equal
// the indexer's `zswapMerkleTreeRoot` hex byte-for-byte (confirmed: a recent
// chain root appears verbatim in a real offer's input), so the extracted hex is
// directly comparable to a known_roots entry — no integer decoding.
//
// FAIL-CLOSED: any structural anomaly throws. A wrong extraction yields bytes
// that match no known root, so the caller rejects the offer (ROOT_UNKNOWN) —
// it never accepts a bad one.
const ROOT_GAP_AFTER_NULLIFIER = 33;
const PINNED_INPUT_TAG = "zswap-input[v2]";

export class RootExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RootExtractError";
  }
}

// Total length of a SCALE-compact run from its first byte (serialize/src/util.rs).
function scaleRunLength(firstByte: number): number {
  switch (firstByte & 0b11) {
    case 0b00:
      return 1;
    case 0b01:
      return 2;
    case 0b10:
      return 4;
    default:
      return (firstByte >> 2) + 5; // n-byte form
  }
}

// Normalize a root (hex string or bytes) to the canonical comparison form:
// lowercase hex, no `0x`. Used on BOTH the offer-extracted root and the
// indexer's `zswapMerkleTreeRoot` so comparisons are like-for-like.
export function canonicalRootHex(hexOrBytes: string | Uint8Array): string {
  if (typeof hexOrBytes === "string") {
    return hexOrBytes.replace(/^0x/i, "").toLowerCase();
  }
  return Buffer.from(hexOrBytes).toString("hex");
}

// Extract one shielded input's root as canonical hex. `input` is a ledger-v8
// `ZswapInput` (we only use `serialize()` + the `nullifier` getter).
export function extractInputRoot(input: {
  serialize(): Uint8Array;
  nullifier: unknown;
}): string {
  const ser = Buffer.from(input.serialize());

  // Anchor on the nullifier (cross-checked against the official getter): the
  // first occurrence is the struct's first field, right after the ASCII header.
  const nulHex = canonicalRootHex(String(input.nullifier));
  const nul = Buffer.from(nulHex, "hex");
  if (nul.length !== 32) {
    throw new RootExtractError(`unexpected nullifier length ${nul.length}`);
  }
  const nulOff = ser.indexOf(nul);
  if (nulOff < 0) {
    throw new RootExtractError("nullifier not found in serialized input");
  }

  // The bytes before the nullifier are the tagged-serialize ASCII header;
  // require the pinned tag so a serialization-format change is loud, not a
  // silent mis-parse.
  const header = ser.subarray(0, nulOff).toString("latin1");
  if (!header.includes(PINNED_INPUT_TAG)) {
    throw new RootExtractError(
      `input tag header missing "${PINNED_INPUT_TAG}": ${JSON.stringify(header.slice(0, 64))}`,
    );
  }

  const rootOff = nulOff + 32 + ROOT_GAP_AFTER_NULLIFIER;
  if (rootOff >= ser.length) {
    throw new RootExtractError("root offset past end of input");
  }
  const runLen = scaleRunLength(ser[rootOff]!);
  // A field root is a 32-byte value → a 33-byte SCALE run; never larger.
  if (runLen < 1 || runLen > 33 || rootOff + runLen > ser.length) {
    throw new RootExtractError(`implausible root run length ${runLen}`);
  }
  return ser.subarray(rootOff, rootOff + runLen).toString("hex");
}

// Roots of every shielded INPUT across the guaranteed segment + each fallible
// segment. Transients are excluded: `apply_transient` performs no past_roots
// check (zswap/src/ledger.rs) and a transient's synthesized input carries a
// blank-tree root, so it would never be a real chain root.
export function extractOfferInputRoots(tx: UnprovenTransaction): string[] {
  const roots: string[] = [];
  const offers: any[] = [];
  if ((tx as any).guaranteedOffer) offers.push((tx as any).guaranteedOffer);
  const fallible = (tx as any).fallibleOffer;
  if (fallible && typeof fallible.values === "function") {
    for (const seg of fallible.values() as Iterable<any>) {
      if (seg) offers.push(seg);
    }
  }
  for (const o of offers) {
    for (const input of o.inputs ?? []) {
      roots.push(extractInputRoot(input));
    }
  }
  return roots;
}
