// Local trade log — every offer this browser CREATES or TAKES, kept on-device.
// Shielded ZSwaps are secret on-chain, so this client-side record is the only
// durable history of them (cleared = unrecoverable, surfaced in the UI). Keyed
// by a local id; the `blob` is the real bech32m offer for export/re-share.

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
}

const KEY = 'zswap-da:my-trades';
let cache: MyTrade[] | null = null;
const subs = new Set<() => void>();

function read(): MyTrade[] {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]') as (MyTrade & { offerHash?: string })[];
    cache = raw.map((t) => ({
      ...t,
      status: LEGACY_STATUS[t.status as string] ?? t.status,
      // Pre-/v1 records stored the content hash as `offerHash`; it is the same
      // value, renamed to match the wire.
      offerId: t.offerId ?? t.offerHash,
    }));
  } catch {
    cache = [];
  }
  return cache!;
}
function write(list: MyTrade[]): void {
  cache = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch { /* ignore quota */ }
  subs.forEach((f) => f());
}

export function listTrades(): MyTrade[] {
  return read();
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
  write([rec, ...read()]);
  return rec;
}

export function updateTradeStatus(id: string, status: MyTrade['status']): void {
  const list = read();
  let changed = false;
  const next = list.map((t) => {
    if (t.id === id && t.status !== status) { changed = true; return { ...t, status }; }
    return t;
  });
  if (changed) write(next);
}

export function removeTrade(id: string): void {
  write(read().filter((t) => t.id !== id));
}

export function clearTrades(): void {
  write([]);
}

export function subscribeTrades(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}
