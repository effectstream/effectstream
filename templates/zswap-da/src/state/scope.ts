// Wallet scoping for the on-device records (`my-offers`, `my-trades`).
//
// Both stores used to be flat, per-BROWSER lists. That is wrong as soon as two
// wallets share one browser: an offer posted with Lace stayed "mine" after
// connecting 1am, so the order book refused to let the second wallet take it
// (issue 00003) and My Trades showed the other wallet's history as your own.
//
// The fix is a scope level in the stored JSON:
//
//   { "preprod::mn_shield-addr_…": [...], "undeployed::a1b2…": [...], "legacy": [...] }
//
// The scope is `<networkId>::<shieldedAddress>` — the network matters because the
// same wallet on preprod and undeployed holds different coins and different
// offers. Records written before scoping cannot be attributed to any wallet, so
// they migrate once into the `legacy` bucket, which every wallet still reads
// (Q-1 option 1: no data loss; the own-offer decision dialog of (B) turns a
// misattributed legacy record into a confirmable choice, not a dead end).

/** Bucket for records written before wallet scoping existed. Read by everyone. */
export const LEGACY_SCOPE = 'legacy';

/**
 * The storage scope for a connected wallet, or `null` when no wallet is
 * connected (no wallet ⇒ nothing is "mine", and writes have nowhere to go).
 */
export function buildScope(
  networkId: string | null | undefined,
  shieldedAddress: string | null | undefined,
): string | null {
  if (!networkId || !shieldedAddress) return null;
  return `${networkId}::${shieldedAddress}`;
}

/** The on-disk shape after migration: one bucket per scope. */
export type Buckets<T> = Record<string, T[]>;

/**
 * Read a scoped store from localStorage, migrating the pre-scoping shape.
 *
 * A flat array is what every build before this one wrote; it becomes the
 * `legacy` bucket. Anything unreadable (absent, malformed, wrong type) degrades
 * to an empty store rather than throwing — these records are a convenience log,
 * never a correctness input.
 */
export function readBuckets<T>(key: string): Buckets<T> {
  let raw: unknown;
  try {
    const s = localStorage.getItem(key);
    if (!s) return {};
    raw = JSON.parse(s);
  } catch {
    return {};
  }
  // Pre-scoping flat array → the legacy bucket. Migration is lazy (on first
  // read) and idempotent: once written back, the value is already an object.
  if (Array.isArray(raw)) return { [LEGACY_SCOPE]: raw as T[] };
  if (!raw || typeof raw !== 'object') return {};
  const out: Buckets<T> = {};
  for (const [scope, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(value)) out[scope] = value as T[];
  }
  return out;
}

/** Persist a scoped store. Quota failures are ignored — see readBuckets. */
export function writeBuckets<T>(key: string, buckets: Buckets<T>): void {
  try {
    localStorage.setItem(key, JSON.stringify(buckets));
  } catch { /* ignore quota */ }
}

/** The records of one bucket, or `[]` when the bucket (or scope) is absent. */
export function bucketOf<T>(buckets: Buckets<T>, scope: string | null): T[] {
  if (!scope) return [];
  return buckets[scope] ?? [];
}
