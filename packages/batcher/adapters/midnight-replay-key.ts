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

/** The transaction's own identifier list, however the WASM boundary hands it over. */
function identifierList(tx: ReplayIdentifiableTx): unknown[] {
  const raw = attempt(tx.identifiers);
  return Array.isArray(raw)
    ? raw
    : raw !== null && raw !== undefined && typeof raw !== "string" &&
        typeof (raw as Iterable<unknown>)[Symbol.iterator] === "function"
    ? Array.from(raw as Iterable<unknown>)
    : [];
}

/**
 * The identifiers a chain indexer can be asked to WATCH for, as plain hex.
 *
 * The same list the replay key is derived from, exposed unhashed because it has
 * a second job: answering "did this spend already land?" after a restart lost
 * the receipt (spec 00021 FR-3). The ledger's own documentation for these is
 * literally that any of them may be used to watch for a specific transaction,
 * and — unlike the transaction hash — they survive the re-proving and merging
 * a balancing batcher does, which is the entire reason they are usable here.
 *
 * Normalized to bare lowercase hex with no `0x`, which is the `HexEncoded`
 * scalar the Midnight indexer's `transactions(offset: { identifier })` takes.
 * Entries that are not hex are dropped rather than guessed at: a malformed
 * offset is a query that answers nothing, and answering nothing is exactly what
 * the caller must not mistake for "it did not land".
 */
export function midnightTxIdentifiers(tx: ReplayIdentifiableTx): string[] {
  const seen = new Set<string>();
  for (const value of identifierList(tx)) {
    const encoded = encodePart(value).trim().toLowerCase().replace(/^0x/, "");
    if (encoded.length === 0 || encoded.length % 2 !== 0) continue;
    if (!/^[0-9a-f]+$/.test(encoded)) continue;
    seen.add(encoded);
  }
  return [...seen];
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
  const list = identifierList(tx);

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
