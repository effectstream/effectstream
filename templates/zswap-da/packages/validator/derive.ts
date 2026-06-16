import { addressFromKey } from "@midnight-ntwrk/ledger-v8";
import type { TokenType, UnprovenTransaction } from "@midnight-ntwrk/ledger-v8";
import { Buffer } from "node:buffer";

import type { OfferLeg, UnshieldedSpendRef } from "./types.ts";

// Normalize a value that may be a Uint8Array or a hex string into lowercase
// hex (no `0x` prefix). ledger-v8 returns nullifiers / owner keys / intent
// hashes as either form depending on the field. Mirrors the helper in the
// node's state-machine so indexing and validation agree byte-for-byte.
export function bytesOrStringToHex(value: unknown): string {
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("hex").toLowerCase();
  }
  if (typeof value === "string") {
    const clean = value.startsWith("0x") || value.startsWith("0X")
      ? value.slice(2)
      : value;
    return clean.toLowerCase();
  }
  return String(value).toLowerCase();
}

// The set of shielded offers carried by a transaction: the guaranteed segment
// plus every non-guaranteed (fallible) segment.
function shieldedOffersOf(tx: UnprovenTransaction): any[] {
  const offers: any[] = [];
  if (tx.guaranteedOffer) offers.push(tx.guaranteedOffer);
  const fallible = tx.fallibleOffer as any;
  if (fallible && typeof fallible.values === "function") {
    for (const segOffer of fallible.values() as Iterable<any>) {
      if (segOffer) offers.push(segOffer);
    }
  }
  return offers;
}

// Collect every shielded nullifier the offer consumes, across guaranteed +
// fallible segments and both `inputs` and `transients`. The Midnight fetcher
// detects consumption segment-agnostically, so indexing must match.
export function collectNullifiers(tx: UnprovenTransaction): string[] {
  const nullifiers: string[] = [];
  for (const o of shieldedOffersOf(tx)) {
    for (const input of o.inputs ?? []) {
      nullifiers.push(bytesOrStringToHex(input.nullifier));
    }
    for (const t of o.transients ?? []) {
      nullifiers.push(bytesOrStringToHex(t.nullifier));
    }
  }
  return nullifiers;
}

// Collect the (owner, intentHash, outputNo) triples for every unshielded UTXO
// the offer spends. `UtxoSpend.owner` is a raw SignatureVerifyingKey; apply
// `addressFromKey` so it matches the 32-byte address the indexer reports on
// consumption (the `midnight-unshielded-spend` path).
export function collectUnshieldedSpends(
  tx: UnprovenTransaction,
): UnshieldedSpendRef[] {
  const spends: UnshieldedSpendRef[] = [];
  const intents = (tx as any).intents;
  if (intents && typeof intents.values === "function") {
    for (const intent of intents.values() as Iterable<any>) {
      const unshieldedOffers = [
        intent.guaranteedUnshieldedOffer,
        intent.fallibleUnshieldedOffer,
      ].filter(Boolean);
      for (const offer of unshieldedOffers) {
        for (const spend of offer.inputs ?? []) {
          const ownerSvk = bytesOrStringToHex(spend.owner);
          spends.push({
            owner: addressFromKey(ownerSvk).toLowerCase(),
            intentHash: bytesOrStringToHex(spend.intentHash).toLowerCase(),
            outputNo: Number(spend.outputNo),
          });
        }
      }
    }
  }
  return spends;
}

// Thrown when a token carries a tag other than shielded/unshielded/dust.
export class UnknownTokenTagError extends Error {
  constructor(public readonly tag: string) {
    super(`Unknown token tag "${tag}"`);
    this.name = "UnknownTokenTagError";
  }
}

// Derive give/want legs from the transaction's per-segment imbalances, merged
// across the guaranteed segment + every intent/fallible segment. A positive
// merged delta is a give (surplus the maker provides); negative is a want.
// `dust` is ignored; any other unexpected tag throws UnknownTokenTagError.
export function deriveLegs(
  tx: UnprovenTransaction,
): { gives: OfferLeg[]; wants: OfferLeg[] } {
  const intentKeys = (tx as any).intents
    ? Array.from((tx as any).intents.keys() as Iterable<number>)
    : [];
  const fallibleKeys = tx.fallibleOffer
    ? Array.from(tx.fallibleOffer.keys() as Iterable<number>)
    : [];
  const segmentIds = Array.from(
    new Set<number>([0, ...intentKeys, ...fallibleKeys]),
  );

  const merged = new Map<string, bigint>();
  for (const segId of segmentIds) {
    for (const [tokenType, delta] of tx.imbalances(segId)) {
      const tt = tokenType as TokenType;
      if (tt.tag === "dust") continue;
      if (tt.tag !== "shielded" && tt.tag !== "unshielded") {
        throw new UnknownTokenTagError(String((tt as any).tag));
      }
      const token = tt.raw.toLowerCase();
      merged.set(token, (merged.get(token) ?? 0n) + delta);
    }
  }

  const gives: OfferLeg[] = [];
  const wants: OfferLeg[] = [];
  for (const [token, delta] of merged) {
    if (delta > 0n) gives.push({ token, amount: delta.toString() });
    else if (delta < 0n) wants.push({ token, amount: (-delta).toString() });
  }
  return { gives, wants };
}
