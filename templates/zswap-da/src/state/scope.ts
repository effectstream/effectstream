// Wallet scoping for the on-device records (`my-offers`, `my-trades`).
//
// Both stores used to be flat, per-BROWSER lists. That is wrong as soon as two
// wallets share one browser: an offer posted with Lace stayed "mine" after
// connecting 1am, so the order book refused to let the second wallet take it
// (issue 00003) and My Trades showed the other wallet's history as your own.
//
// The fix is a scope level in the stored JSON:
//
//   { "preprod::mn_shield-addr_…": [...], "undeployed::a1b2…": [...] }
//
// The scope is `<networkId>::<shieldedAddress>` — the network matters because the
// same wallet on preprod and undeployed holds different coins and different
// offers.
//
// There is no compatibility path for the pre-scoping flat arrays: the app is
// alpha, and a wallet-less record cannot be attributed to a wallet without
// guessing. A stored value that is not a bucket object is read as an empty store
// and overwritten by the next write (Q-1, resolved by Eddie: breaking change
// accepted).

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

/** The on-disk shape: one bucket per scope. */
export type Buckets<T> = Record<string, T[]>;

/**
 * Read a scoped store from localStorage.
 *
 * Anything that is not a bucket object — absent, malformed, or the flat array
 * older builds wrote — degrades to an empty store rather than throwing. These
 * records are a convenience log, never a correctness input.
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
  // An array is the pre-scoping shape. It is discarded, not migrated.
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
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
