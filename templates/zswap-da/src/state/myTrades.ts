// Local trade log — every offer this WALLET creates or takes, kept on-device.
// Shielded ZSwaps are secret on-chain, so this client-side record is the only
// durable history of them (cleared = unrecoverable, surfaced in the UI). Keyed
// by a local id; the `blob` is the real bech32m offer for export/re-share.
//
// Bucketed per `<networkId>::<shieldedAddress>` (see scope.ts) — one browser can
// hold several wallets, and an unscoped log showed wallet A's history to wallet
// B. Records written before scoping live in the `legacy` bucket: they can't be
// attributed to a wallet, so they are shown to every wallet, tagged (Q-1).

import { LEGACY_SCOPE, bucketOf, readBuckets, writeBuckets, type Buckets } from './scope';

export type MyTradeStatus = 'not_public' | 'live' | 'consumed' | 'cancelled' | 'expired';

/** Pre-/v1 records used the old vocabulary; map them on read. */
const LEGACY_STATUS: Record<string, MyTradeStatus> = {
  open: 'live',
  completed: 'consumed',
  // The old 'cancelled' was a local "user abandoned this" marker that was never
  // actually written by any code path. The name now means something specific
  // and server-authoritative, so any stray value maps onto the closest state.
  cancelled: 'cancelled',
};

export interface TradeLeg { sym: string; amt: number }
export interface MyTrade {
  id: string;
  kind: 'create' | 'take';
  give: TradeLeg;
  get: TradeLeg;
  at: number;
  // Mirrors the node's MIP-0006 vocabulary, plus one local-only state:
  //   not_public: submitted to Celestia, not yet visible in the book (local)
  //   live:       on the book, takeable
  //   consumed:   all inputs spent in ONE settlement tx — a genuine fill
  //   cancelled:  inputs spent across different txs / partially, i.e. the maker
  //               spent the coins elsewhere. Definitive, not ambiguous.
  //   expired:    TTL elapsed before anyone took it
  status: MyTradeStatus;
  shielded: boolean;
  blob?: string;
  /** Content hash from `POST /v1/offers` — the cross-node offer identity and
   *  the key for all subsequent status polling. Absent on records created before
   *  content addressing, which fall back to blob-based status lookup. */
  offerId?: string;
  /** DERIVED on read, never stored: this record predates wallet scoping, so it
   *  belongs to "some wallet in this browser" and is shown to all of them. */
  legacy?: boolean;
}

const KEY = 'zswap-da:my-trades';

let activeScope: string | null = null;
let cache: Buckets<MyTrade> | null = null;
const subs = new Set<() => void>();

function normalize(t: MyTrade & { offerHash?: string }): MyTrade {
  return {
    ...t,
    status: LEGACY_STATUS[t.status as string] ?? t.status,
    // Pre-/v1 records stored the content hash as `offerHash`; it is the same
    // value, renamed to match the wire.
    offerId: t.offerId ?? t.offerHash,
  };
}

function all(): Buckets<MyTrade> {
  if (cache) return cache;
  const raw = readBuckets<MyTrade & { offerHash?: string }>(KEY);
  const out: Buckets<MyTrade> = {};
  for (const [scope, list] of Object.entries(raw)) out[scope] = list.map(normalize);
  cache = out;
  return cache;
}

function persist(next: Buckets<MyTrade>): void {
  cache = next;
  writeBuckets(KEY, next);
  subs.forEach((f) => f());
}

/**
 * Point the log at the connected wallet's bucket (`null` = no wallet, so only
 * legacy records are visible). Drops the cache and notifies subscribers, because
 * switching wallets changes what `listTrades()` returns just as much as a write.
 */
export function setActiveScope(scope: string | null): void {
  const changed = scope !== activeScope;
  activeScope = scope;
  cache = null;
  if (changed) subs.forEach((f) => f());
}

/**
 * The connected wallet's trades, newest first, followed by the unattributable
 * pre-scoping records tagged `legacy` so the UI can say where they came from.
 */
export function listTrades(): MyTrade[] {
  const buckets = all();
  const mine = activeScope && activeScope !== LEGACY_SCOPE ? bucketOf(buckets, activeScope) : [];
  const legacy = bucketOf(buckets, LEGACY_SCOPE).map((t) => ({ ...t, legacy: true }));
  return [...mine, ...legacy];
}

export function addTrade(t: Omit<MyTrade, 'id' | 'at'> & { id?: string; at?: number }): MyTrade {
  const rec: MyTrade = {
    id: t.id ?? Math.random().toString(36).slice(2),
    at: t.at ?? Date.now(),
    kind: t.kind,
    give: t.give,
    get: t.get,
    status: t.status,
    shielded: t.shielded,
    blob: t.blob,
    offerId: t.offerId,
  };
  // No wallet ⇒ no bucket. Callers only get here after a transaction the wallet
  // signed, so this means the wallet went away mid-flow: warn, hand back the
  // record (so the caller's flow completes) and drop it rather than polluting
  // the legacy bucket, which is reserved for genuinely pre-scoping data.
  if (!activeScope) {
    console.warn('[my-trades] no wallet connected — not recording trade', rec.id);
    return rec;
  }
  const buckets = all();
  persist({ ...buckets, [activeScope]: [rec, ...bucketOf(buckets, activeScope)] });
  return rec;
}

/** Find the bucket holding `id` — a record can be in the active OR legacy one. */
function scopeHolding(buckets: Buckets<MyTrade>, id: string): string | null {
  for (const [scope, list] of Object.entries(buckets)) {
    if (list.some((t) => t.id === id)) return scope;
  }
  return null;
}

export function updateTradeStatus(id: string, status: MyTrade['status']): void {
  const buckets = all();
  const scope = scopeHolding(buckets, id);
  if (!scope) return;
  let changed = false;
  const next = buckets[scope].map((t) => {
    if (t.id === id && t.status !== status) { changed = true; return { ...t, status }; }
    return t;
  });
  if (changed) persist({ ...buckets, [scope]: next });
}

export function removeTrade(id: string): void {
  const buckets = all();
  const scope = scopeHolding(buckets, id);
  if (!scope) return;
  persist({ ...buckets, [scope]: buckets[scope].filter((t) => t.id !== id) });
}

/**
 * "Clear all" clears what the user can SEE: this wallet's records and the legacy
 * ones. Other wallets' buckets are left alone — clearing them from here would be
 * destroying history the user isn't looking at.
 */
export function clearTrades(): void {
  const next = { ...all() };
  if (activeScope) delete next[activeScope];
  delete next[LEGACY_SCOPE];
  persist(next);
}

export function subscribeTrades(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}
