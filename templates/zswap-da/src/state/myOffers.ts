// Local record of offers THIS WALLET created — so the order book can mark them
// (taking your own offer is a decision, not a silent block). Shielded offers are
// anonymous on-chain, so the only reliable "mine" signal for them is what we
// created locally.
//
// Keyed by `offerId` (hex sha256 of the raw MIP-0005 transaction bytes), which
// is what the blob-free order book now carries. A full bech32m blob is also
// accepted as a key, so a caller that only holds the blob still matches.
//
// Records are bucketed per `<networkId>::<shieldedAddress>` (see scope.ts): one
// browser can hold several wallets, and before scoping every wallet inherited
// every other wallet's offers — the dead end reported as issue 00003.

import { bucketOf, readBuckets, writeBuckets, type Buckets } from './scope';

const KEY = 'zswap-da:my-offers';

let activeScope: string | null = null;
let cache: Buckets<string> | null = null;

function all(): Buckets<string> {
  if (!cache) cache = readBuckets<string>(KEY);
  return cache;
}

/**
 * Point the store at the connected wallet's bucket (`null` = no wallet).
 * Always drops the cache: another tab — or this tab under a different wallet —
 * may have written since, and a stale bucket would mis-mark ownership.
 */
export function setActiveScope(scope: string | null): void {
  activeScope = scope;
  cache = null;
}

/** The scope writes currently go to; exported for the sibling stores' tests. */
export function getActiveScope(): string | null {
  return activeScope;
}

/**
 * Record an offer this wallet created. Pass the `offerId` returned by
 * `POST /v1/offers`; the blob is also accepted as a key.
 *
 * With no wallet connected there is no bucket to write to. Every caller reaches
 * here only after a successful transaction, so that combination means the wallet
 * dropped mid-flow — loud enough to warn about, not worth throwing over.
 */
export function addMyOffer(key: string | null | undefined): void {
  if (!key) return;
  if (!activeScope) {
    console.warn('[my-offers] no wallet connected — not recording offer', key.slice(0, 16));
    return;
  }
  const buckets = all();
  const list = bucketOf(buckets, activeScope);
  if (list.includes(key)) return;
  const next = { ...buckets, [activeScope]: [...list, key] };
  cache = next;
  writeBuckets(KEY, next);
}

/**
 * True when this offer hash (or blob) was created by `scope`'s wallet. With no
 * wallet — `scope === null` — nothing is mine.
 *
 * Takes the scope explicitly because the order book computes ownership during
 * RENDER, while the active scope is installed from an effect: reading the module
 * state there would mark a freshly connected wallet's rows against the previous
 * wallet's bucket for one render, and a memo would then cache that answer.
 */
export function isMyOfferIn(key: string | null | undefined, scope: string | null): boolean {
  if (!key) return false;
  return bucketOf(all(), scope).includes(key);
}

/** {@link isMyOfferIn} against the active scope. */
export function isMyOffer(key: string | null | undefined): boolean {
  return isMyOfferIn(key, activeScope);
}
