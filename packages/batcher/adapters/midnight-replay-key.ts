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

/** What a single accessor had to say, and why it could not say it. */
interface Attempt<R> {
  /** The boundary's answer, or `undefined` when there was none. */
  value: R | undefined;
  /** Present only when the accessor THREW — the message it threw with. */
  failure?: string;
}

/**
 * Call a WASM accessor ON its transaction, without letting a failure become the
 * caller's.
 *
 * The receiver is the whole point. A wasm-bindgen method's first act is to read
 * `this.__wbg_ptr`, so calling it detached — `const fn = tx.identifiers; fn()` —
 * throws a `TypeError` before it reaches the ledger at all. That is a bug in
 * the CALL, not a boundary that cannot answer, and it is exactly what used to
 * happen here: the catch below dutifully swallowed our own mistake and reported
 * "this spend cannot identify itself" for every real Midnight transaction ever
 * submitted (00020 F-1.10a). Hence `fn.call(tx)`.
 *
 * The catch stays, because GENUINE failures are real and routine — an unproven
 * transaction has no `transactionHash()`, and the bindings say so by throwing.
 */
function attempt<R>(
  tx: ReplayIdentifiableTx,
  fn: (() => R) | undefined,
): Attempt<R> {
  if (typeof fn !== "function") return { value: undefined };
  try {
    return { value: fn.call(tx) };
  } catch (error) {
    // A boundary that cannot answer is not an error here: the caller degrades
    // to a weaker key, or to no dedup at all. Refusing the input instead would
    // punish a user for our inability to fingerprint their transaction. The
    // reason is kept so the degradation can at least be SAID out loud.
    return {
      value: undefined,
      failure: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * The transaction's own identifier list, however the WASM boundary hands it
 * over — called ON the transaction (see `attempt`), with the throw reason kept
 * so `midnightReplayKey` can report a total derivation failure.
 */
function identifierList(
  tx: ReplayIdentifiableTx,
): { list: unknown[]; failure?: string } {
  const ids = attempt(tx, tx.identifiers);
  const raw = ids.value;
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : raw !== null && raw !== undefined && typeof raw !== "string" &&
        typeof (raw as Iterable<unknown>)[Symbol.iterator] === "function"
    ? Array.from(raw as Iterable<unknown>)
    : [];
  return { list, failure: ids.failure };
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
  for (const value of identifierList(tx).list) {
    const encoded = encodePart(value).trim().toLowerCase().replace(/^0x/, "");
    if (encoded.length === 0 || encoded.length % 2 !== 0) continue;
    if (!/^[0-9a-f]+$/.test(encoded)) continue;
    seen.add(encoded);
  }
  return [...seen];
}

/**
 * How many distinct derivation failures are worth a line before the module goes
 * quiet. The failure this exists to catch is systematic — one line names it —
 * and an unbounded set of remembered reasons would be a leak with a log
 * attached.
 */
export const REPLAY_KEY_FAILURE_LOG_LIMIT = 8;

/** Reasons already reported, so a per-transaction fault is not a per-call log. */
const reportedFailures = new Set<string>();

/** Test seam: forget what has already been reported. */
export function __resetReplayKeyDerivationLog(): void {
  reportedFailures.clear();
}

/**
 * Say, once per distinct reason, that a transaction could not be fingerprinted
 * at all.
 *
 * Silence is what let the detached-receiver bug survive from Phase 3 to 00017's
 * M14: every submission through the balancing adapter lost its replay key and
 * nothing anywhere said so. Only THROWN failures are reported — a transaction
 * that simply has no identifiers and no hash is the documented duck-typed case,
 * not a fault, and warning about it would bury the signal in the noise.
 *
 * Bounded by reason rather than by call, because a systematic fault produces
 * one reason and a flood of transactions.
 */
function reportDerivationFailure(reasons: Array<string | undefined>): void {
  const said = reasons.filter((r): r is string => r !== undefined);
  if (said.length === 0) return;
  const signature = said.join(" | ");
  if (reportedFailures.has(signature)) return;
  if (reportedFailures.size >= REPLAY_KEY_FAILURE_LOG_LIMIT) return;
  reportedFailures.add(signature);
  console.warn(
    `⚠️ [Midnight] Could not derive a replay key for a transaction: the ` +
      `ledger bindings refused to identify it (${signature}). Submissions ` +
      `carrying this transaction are accepted WITHOUT duplicate protection — ` +
      `a resubmission will be balanced, proven and paid for a second time. ` +
      `Further transactions failing the same way are not logged again.`,
  );
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
  const identifiers = identifierList(tx);
  const list = identifiers.list;

  if (list.length > 0) {
    const parts = list.map(encodePart).sort();
    return createHash("sha256")
      .update(IDENTIFIER_NAMESPACE + parts.join("|"), "utf8")
      .digest("hex");
  }

  const hash = attempt(tx, tx.transactionHash);
  if (hash.value !== undefined && hash.value !== null) {
    const encoded = encodePart(hash.value);
    if (encoded !== "") {
      return createHash("sha256")
        .update(HASH_NAMESPACE + encoded, "utf8")
        .digest("hex");
    }
  }

  // Nothing left to key on. If the boundary THREW on the way here, that is a
  // loss of double-payment protection nobody asked for, and it gets said.
  reportDerivationFailure([identifiers.failure, hash.failure]);
  return undefined;
}
