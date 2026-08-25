import { createHash } from "node:crypto";

/**
 * The parts of a deserialized Midnight transaction that can identify the SPEND
 * it represents.
 *
 * Duck-typed rather than imported from the ledger bindings so this module — and
 * its tests — stay free of the 10 MB WASM blob. The adapter passes a real
 * `Transaction`; the shape is the contract.
 */
export interface ReplayIdentifiableTx {
  /**
   * The ledger's own answer to "what would I watch for to see this land". Per
   * the bindings: *any* of these may be used to watch for a specific
   * transaction — which is exactly the property a replay key needs.
   */
  identifiers?: () => unknown;
  /**
   * Weaker fallback. The bindings warn it should not be used to watch for a
   * specific transaction because merging changes it — so it is only reached
   * when there are no identifiers at all.
   */
  transactionHash?: () => unknown;
}

/**
 * Namespaces. Without them a transaction whose HASH happened to equal another
 * transaction's IDENTIFIER would be read as a replay of it — a false positive
 * that silently refuses to submit a legitimate spend.
 */
const IDENTIFIER_NAMESPACE = "midnight-tx-identifiers:";
const HASH_NAMESPACE = "midnight-tx-hash:";

/** Deterministic text for one identifier, whatever the WASM boundary hands back. */
function encodePart(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return Buffer.from(value).toString("hex");
  if (
    typeof value === "bigint" || typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text !== "[object Object]") return text;
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

/** Call a WASM accessor without letting its failure become the caller's. */
function attempt<R>(fn: (() => R) | undefined): R | undefined {
  if (typeof fn !== "function") return undefined;
  try {
    return fn();
  } catch {
    // A boundary that cannot answer is not an error here: the caller degrades
    // to a weaker key, or to no dedup at all. Refusing the input instead would
    // punish a user for our inability to fingerprint their transaction.
    return undefined;
  }
}

/**
 * The key that answers "have we already paid to put this spend on chain?".
 *
 * Identifiers first: they are what the indexer watches, they survive
 * re-proving and re-serialization, and they are what makes two encodings of one
 * spend collide — the property the replay gate is built on. Their ORDER is not
 * meaningful, so the list is sorted before hashing.
 *
 * Returns `undefined` when the transaction can identify itself in no way at
 * all. That means "admit without dedup", never "refuse".
 */
export function midnightReplayKey(
  tx: ReplayIdentifiableTx,
): string | undefined {
  const raw = attempt(tx.identifiers);
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : raw !== null && raw !== undefined && typeof raw !== "string" &&
        typeof (raw as Iterable<unknown>)[Symbol.iterator] === "function"
    ? Array.from(raw as Iterable<unknown>)
    : [];

  if (list.length > 0) {
    const parts = list.map(encodePart).sort();
    return createHash("sha256")
      .update(IDENTIFIER_NAMESPACE + parts.join("|"), "utf8")
      .digest("hex");
  }

  const hash = attempt(tx.transactionHash);
  if (hash === undefined || hash === null) return undefined;
  const encoded = encodePart(hash);
  if (encoded === "") return undefined;
  return createHash("sha256")
    .update(HASH_NAMESPACE + encoded, "utf8")
    .digest("hex");
}
