// Local trade log — every offer this browser CREATES or TAKES, kept on-device.
// Shielded ZSwaps are secret on-chain, so this client-side record is the only
// durable history of them (cleared = unrecoverable, surfaced in the UI). Keyed
// by a local id; the `blob` is the real bech32m offer for export/re-share.

export interface TradeLeg { sym: string; amt: number }
export interface MyTrade {
  id: string;
  kind: 'create' | 'take';
  give: TradeLeg;
  get: TradeLeg;
  at: number;
  // not_public: submitted to Celestia but not yet visible in the live order book
  // open:       visible in the live order book
  // completed:  offer was consumed (settled or cancelled on-chain)
  // expired:    offer TTL elapsed before being consumed
  // cancelled:  user cleared or the import/take flow never completed
  status: 'not_public' | 'open' | 'completed' | 'expired' | 'cancelled';
  shielded: boolean;
  blob?: string;
}

const KEY = 'zswap-da:my-trades';
let cache: MyTrade[] | null = null;
const subs = new Set<() => void>();

function read(): MyTrade[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) || '[]') as MyTrade[];
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
