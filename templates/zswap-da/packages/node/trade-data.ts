// Real per-pair market data derived from the indexer DB:
//   - trade history = CONSUMED offers (offer_file_history), each treated as a
//     fill at its offered price (price = quote/base, size = base leg).
//   - stats        = last / 24h-change / high / low / volume from those fills,
//     falling back to the mid of the current open offers when there are no fills.
//
// Prices are quoted as quote-per-base. An offer GIVING base / WANTING quote is a
// SELL of base (ask); GIVING quote / WANTING base is a BUY of base (bid).

import { getTradeHistory, getOpenLegs } from "@zswap-da/database";

export interface HistoryRow { price: number; amt: number; up: boolean; at: string }
export interface Stats {
  base: string; quote: string; last: number; change24: number;
  high: number; low: number; volume_base: number; volume_quote: number;
}

interface LegRow { g_color: string; g_amt: string; w_color: string; w_amt: string }

// One fill, normalised to quote-per-base price + base-denominated size.
function toFill(r: LegRow, base: string): { price: number; amt: number } {
  const gAmt = Number(r.g_amt);
  const wAmt = Number(r.w_amt);
  if (r.g_color === base) {
    return { price: gAmt > 0 ? wAmt / gAmt : 0, amt: gAmt };
  }
  return { price: wAmt > 0 ? gAmt / wAmt : 0, amt: wAmt };
}

/** Trade history (newest first) built from consumed offers for this pair. */
export async function realHistory(dbConn: any, base: string, quote: string): Promise<HistoryRow[]> {
  const rows = await getTradeHistory.run({ base, quote }, dbConn);
  const fills = rows.map((r) => ({
    ...toFill(r, base),
    at: Number(r.at_ms),
  })).filter((f) => f.price > 0 && f.amt > 0);
  return fills.map((f, i) => ({
    price: f.price,
    amt: f.amt,
    up: i + 1 < fills.length ? f.price >= fills[i + 1].price : true,
    at: new Date(f.at).toISOString(),
  }));
}

/** Mid price from current open offers (best ask / best bid), 0 if none. */
async function currentMid(dbConn: any, base: string, quote: string): Promise<number> {
  const rows = await getOpenLegs.run({ base, quote }, dbConn);
  const asks: number[] = [];
  const bids: number[] = [];
  for (const r of rows) {
    const f = toFill(r, base);
    if (f.price <= 0) continue;
    (r.g_color === base ? asks : bids).push(f.price);
  }
  const bestAsk = asks.length ? Math.min(...asks) : 0;
  const bestBid = bids.length ? Math.max(...bids) : 0;
  if (bestAsk && bestBid) return (bestAsk + bestBid) / 2;
  return bestAsk || bestBid || 0;
}

export async function realStats(dbConn: any, base: string, quote: string): Promise<Stats> {
  const hist = await realHistory(dbConn, base, quote);
  if (hist.length === 0) {
    const mid = await currentMid(dbConn, base, quote);
    return { base, quote, last: mid, change24: 0, high: mid, low: mid, volume_base: 0, volume_quote: 0 };
  }
  const now = Date.now();
  const dayAgo = now - 86_400_000;
  const last = hist[0].price;
  const olderThanDay = hist.find((h) => Date.parse(h.at) < dayAgo);
  const ref = olderThanDay ? olderThanDay.price : hist[hist.length - 1].price;
  const change24 = ref > 0 ? ((last - ref) / ref) * 100 : 0;
  const win = hist.filter((h) => Date.parse(h.at) >= dayAgo);
  const window = win.length ? win : hist;
  const prices = window.map((h) => h.price);
  return {
    base, quote, last, change24,
    high: Math.max(...prices),
    low: Math.min(...prices),
    volume_base: window.reduce((s, h) => s + h.amt, 0),
    volume_quote: window.reduce((s, h) => s + h.amt * h.price, 0),
  };
}
