// Local trade log — every offer this WALLET creates or takes, kept on-device.
// Shielded ZSwaps are secret on-chain, so this client-side record is the only
// durable history of them (cleared = unrecoverable, surfaced in the UI). Keyed
// by a local id; the `blob` is the real bech32m offer for export/re-share.
//
// Bucketed per `<networkId>::<shieldedAddress>` (see scope.ts) — one browser can
// hold several wallets, and an unscoped log showed wallet A's history to wallet
// B. Records written before scoping are discarded, not migrated (Q-1).

import { bucketOf, readBuckets, writeBuckets, type Buckets } from './scope';

export type MyTradeStatus = 'not_public' | 'live' | 'consumed' | 'cancelled' | 'expired';

/**
 * One leg of a recorded trade.
 *
 * `amt` is BASE UNITS — the same unit the chain and the node use — and
 * `decimals` says how to read it. `decimals` is OPTIONAL because records
 * written before project 00024 have no such field; read them with
 * DEFAULT_DECIMALS rather than migrating localStorage (spec Q4: pre-change
 * amounts re-read at 10^-6 of their old face value, which is accepted).
 */
export interface TradeLeg { sym: string; amt: number; decimals?: number }
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
}

const KEY = 'zswap-da:my-trades';

let activeScope: string | null = null;
let cache: Buckets<MyTrade> | null = null;
const subs = new Set<() => void>();

// No read-time normalization: the bucketed shape is only ever written by this
// build, so the old status vocabulary (`open`/`completed`) and the old
// `offerHash` field can no longer appear in a bucket. Both lived in the flat
// pre-scoping arrays, which are now discarded on read (see scope.ts).
function all(): Buckets<MyTrade> {
  if (!cache) cache = readBuckets<MyTrade>(KEY);
  return cache;
}

function persist(next: Buckets<MyTrade>): void {
  cache = next;
  writeBuckets(KEY, next);
  subs.forEach((f) => f());
}

/**
 * Point the log at the connected wallet's bucket (`null` = no wallet, so the log
 * is empty). Drops the cache and notifies subscribers, because switching wallets
 * changes what `listTrades()` returns just as much as a write.
 */
export function setActiveScope(scope: string | null): void {
  const changed = scope !== activeScope;
  activeScope = scope;
  cache = null;
  if (changed) subs.forEach((f) => f());
}

/** The connected wallet's trades, newest first. Empty with no wallet. */
export function listTrades(): MyTrade[] {
  return [...bucketOf(all(), activeScope)];
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
  // record (so the caller's flow completes) and drop it.
  if (!activeScope) {
    console.warn('[my-trades] no wallet connected — not recording trade', rec.id);
    return rec;
  }
  const buckets = all();
  persist({ ...buckets, [activeScope]: [rec, ...bucketOf(buckets, activeScope)] });
  return rec;
}

// Mutations only ever touch the ACTIVE bucket: `listTrades()` is the only way a
// record reaches the UI, so an id the user can act on is always this wallet's.
// Searching every bucket would let one wallet rewrite another's history.

export function updateTradeStatus(id: string, status: MyTrade['status']): void {
  if (!activeScope) return;
  const buckets = all();
  const list = bucketOf(buckets, activeScope);
  let changed = false;
  const next = list.map((t) => {
    if (t.id === id && t.status !== status) { changed = true; return { ...t, status }; }
    return t;
  });
  if (changed) persist({ ...buckets, [activeScope]: next });
}

export function removeTrade(id: string): void {
  if (!activeScope) return;
  const buckets = all();
  const list = bucketOf(buckets, activeScope);
  if (!list.some((t) => t.id === id)) return;
  persist({ ...buckets, [activeScope]: list.filter((t) => t.id !== id) });
}

/**
 * "Clear all" clears what the user can SEE: this wallet's records. Other
 * wallets' buckets are left alone — clearing them from here would be destroying
 * history the user isn't looking at.
 */
export function clearTrades(): void {
  if (!activeScope) return;
  const next = { ...all() };
  delete next[activeScope];
  persist(next);
}

export function subscribeTrades(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}
