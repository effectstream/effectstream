// Real per-pair market data derived from the indexer DB:
//   - trade history = CONSUMED offers (offer_file_history), each treated as a
//     fill at its offered price (price = quote/base, size = base leg).
//   - stats        = last / 24h-change / high / low / volume from those fills,
//     falling back to the mid of the current open offers when there are no fills.
//
// Prices are quoted as quote-per-base. An offer GIVING base / WANTING quote is a
// SELL of base (ask); GIVING quote / WANTING base is a BUY of base (bid).
//
// Raw SQL (via the pg client `dbConn`) keeps this independent of the pgtyped
// codegen — these are read-only analytics queries.

export interface HistoryRow { price: number; amt: number; up: boolean; at: string }
export interface Stats {
  base: string; quote: string; last: number; change24: number;
  high: number; low: number; volume_base: number; volume_quote: number;
}

interface LegRow { at_ms: string; g_color: string; g_amt: string; w_color: string; w_amt: string }

// One fill, normalised to quote-per-base price + base-denominated size.
function toFill(r: LegRow, base: string): { price: number; amt: number; at: number } {
  const gAmt = Number(r.g_amt);
  const wAmt = Number(r.w_amt);
  const at = Number(r.at_ms);
  if (r.g_color === base) {
    // sell base: give base, want quote → price = quote/base
    return { price: gAmt > 0 ? wAmt / gAmt : 0, amt: gAmt, at };
  }
  // buy base: give quote, want base → price = quote/base
  return { price: wAmt > 0 ? gAmt / wAmt : 0, amt: wAmt, at };
}

const HISTORY_SQL = `
  SELECT (EXTRACT(EPOCH FROM h.archived_at) * 1000)::bigint AS at_ms,
         g.token_color AS g_color, g.amount AS g_amt,
         w.token_color AS w_color, w.amount AS w_amt
  FROM offer_file_history h
  JOIN offer_file_tokens_history g ON g.offer_file_id = h.id AND g.direction = 'GIVING'
  JOIN offer_file_tokens_history w ON w.offer_file_id = h.id AND w.direction = 'WANTING'
  WHERE h.archive_reason = 'CONSUMED'
    AND ((g.token_color = $1 AND w.token_color = $2) OR (g.token_color = $2 AND w.token_color = $1))
  ORDER BY h.archived_at DESC
  LIMIT 120`;

const OPEN_LEGS_SQL = `
  SELECT g.token_color AS g_color, g.amount AS g_amt,
         w.token_color AS w_color, w.amount AS w_amt
  FROM offer_file o
  JOIN offer_file_tokens g ON g.offer_file_id = o.id AND g.direction = 'GIVING'
  JOIN offer_file_tokens w ON w.offer_file_id = o.id AND w.direction = 'WANTING'
  WHERE ((g.token_color = $1 AND w.token_color = $2) OR (g.token_color = $2 AND w.token_color = $1))`;

/** Trade history (newest first) built from consumed offers for this pair. */
export async function realHistory(dbConn: any, base: string, quote: string): Promise<HistoryRow[]> {
  const { rows } = await dbConn.query(HISTORY_SQL, [base, quote]);
  const fills = (rows as LegRow[]).map((r) => toFill(r, base)).filter((f) => f.price > 0 && f.amt > 0);
  // newest-first array; `up` compares each fill to the chronologically older one (next in the array).
  return fills.map((f, i) => ({
    price: f.price,
    amt: f.amt,
    up: i + 1 < fills.length ? f.price >= fills[i + 1].price : true,
    at: new Date(f.at).toISOString(),
  }));
}

/** Mid price from current open offers (best ask / best bid), 0 if none. */
async function currentMid(dbConn: any, base: string, quote: string): Promise<number> {
  const { rows } = await dbConn.query(OPEN_LEGS_SQL, [base, quote]);
  const asks: number[] = []; // sell base (give base) → price quote/base
  const bids: number[] = []; // buy base (give quote)
  for (const r of rows as LegRow[]) {
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
  // reference price for 24h change: most recent fill older than 24h, else the oldest fill.
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
