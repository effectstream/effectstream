// ⚠️ TEMPORARY synthetic market data backing GET /api/quote and
// GET /api/chart/**. This exists so the frontend never fabricates prices/rates
// itself — the fake numbers live behind the API and are a clearly-fenced seam
// to replace with real market data / a pricing oracle later.
//
// Deterministic: prices hash from the token identifier and the depth/stats are
// seeded per pair, so repeated polls return stable books (history timestamps
// anchor to "now"). Token amounts are integer base units throughout.

// A poster clears the Celestia sponsorship when offering the taker a price at
// least this far below market (a "good trade" that will actually get filled).
export const SPONSOR_DISCOUNT = 0.025; // 2.5%

const NIGHT_COLOR = "0".repeat(64);

function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stable pseudo-USD price for a token id (hex color). NIGHT is fixed; everything
// else maps to ~[0.2, 200] deterministically from its color.
export function priceOf(token: string): number {
  const t = (token || "").toLowerCase();
  if (t === NIGHT_COLOR) return 0.5;
  return 0.2 + (hash32(t) / 0xffffffff) * 200;
}

export interface Quote {
  from_token: string;
  to_token: string;
  from_amount: string;
  market_rate: number;
  suggested_to_amount: string;
  to_amount: string;
  implied_rate: number | null;
  discount: number | null;
  sponsored: boolean;
  from_usd: number;
  to_usd: number | null;
}

// Quote `fromAmount` of `fromToken` into `toToken`. If `toAmount` is given (the
// user set a custom receive amount), discount/sponsored are computed against it;
// otherwise they describe the auto-suggested amount (which lands exactly on the
// sponsorship threshold, i.e. always sponsored).
// Variant that accepts pre-resolved prices (e.g. from the token_prices DB table).
export function quoteWithPrices(
  fromToken: string,
  toToken: string,
  fromAmount: bigint,
  pf: number,
  pt: number,
  toAmount?: bigint,
): Quote {
  const marketRate = pf / pt; // `to` units per 1 `from`
  const fromNum = Number(fromAmount);
  const suggested = BigInt(Math.max(0, Math.floor(fromNum * marketRate * (1 - SPONSOR_DISCOUNT))));
  const eff = toAmount ?? suggested;
  let impliedRate: number | null = null;
  let discount: number | null = null;
  let sponsored = false;
  let toUsd: number | null = null;
  if (fromNum > 0) {
    impliedRate = Number(eff) / fromNum;
    discount = 1 - impliedRate / marketRate;
    sponsored = discount >= SPONSOR_DISCOUNT - 1e-9;
    toUsd = Number(eff) * pt;
  }
  return {
    from_token: fromToken,
    to_token: toToken,
    from_amount: fromAmount.toString(),
    market_rate: marketRate,
    suggested_to_amount: suggested.toString(),
    to_amount: eff.toString(),
    implied_rate: impliedRate,
    discount,
    sponsored,
    from_usd: fromNum * pf,
    to_usd: toUsd,
  };
}

export function quote(
  fromToken: string,
  toToken: string,
  fromAmount: bigint,
  toAmount?: bigint,
): Quote {
  const pf = priceOf(fromToken);
  const pt = priceOf(toToken);
  const marketRate = pf / pt; // `to` units per 1 `from`
  const fromNum = Number(fromAmount);

  // Auto price = market discounted to the sponsor threshold, floored to integer.
  const suggested = BigInt(Math.max(0, Math.floor(fromNum * marketRate * (1 - SPONSOR_DISCOUNT))));
  const eff = toAmount ?? suggested;

  let impliedRate: number | null = null;
  let discount: number | null = null;
  let sponsored = false;
  let toUsd: number | null = null;
  if (fromNum > 0) {
    impliedRate = Number(eff) / fromNum;
    discount = 1 - impliedRate / marketRate; // >0 = below market (good for taker)
    sponsored = discount >= SPONSOR_DISCOUNT - 1e-9;
    toUsd = Number(eff) * pt;
  }

  return {
    from_token: fromToken,
    to_token: toToken,
    from_amount: fromAmount.toString(),
    market_rate: marketRate,
    suggested_to_amount: suggested.toString(),
    to_amount: eff.toString(),
    implied_rate: impliedRate,
    discount,
    sponsored,
    from_usd: fromNum * pf,
    to_usd: toUsd,
  };
}

// ── chart data (wired to the frontend Market screen in the charts step) ──────

export interface DepthRow { price: number; amt: number; total: number }
export interface Depth { mid: number; asks: DepthRow[]; bids: DepthRow[]; maxTotal: number; spread: number }

export function buildDepth(base: string, quoteToken: string): Depth {
  const rnd = mulberry32(hash32(base + "/" + quoteToken + ":depth"));
  const mid = priceOf(base) / priceOf(quoteToken);
  const tick = mid * 0.006;
  const span = (a: number, b: number) => a + rnd() * (b - a);
  const baseQty = 1 + (hash32(base) % 40);

  const asks: DepthRow[] = [];
  for (let i = 7; i >= 1; i--) {
    asks.push({ price: mid * (1 + (tick * i) / mid), amt: +(baseQty * span(0.4, 1.8)).toFixed(3), total: 0 });
  }
  let cum = 0;
  for (let i = asks.length - 1; i >= 0; i--) { cum += asks[i].amt; asks[i].total = cum; }

  const bids: DepthRow[] = [];
  cum = 0;
  for (let i = 1; i <= 7; i++) {
    const amt = +(baseQty * span(0.4, 1.8)).toFixed(3);
    cum += amt;
    bids.push({ price: mid * (1 - (tick * i) / mid), amt, total: cum });
  }
  const maxTotal = Math.max(asks[0]?.total || 1, bids[bids.length - 1]?.total || 1);
  const spread = asks[asks.length - 1].price - bids[0].price;
  return { mid, asks, bids, maxTotal, spread };
}

export interface Stats {
  base: string;
  quote: string;
  last: number;
  change24: number;
  high: number;
  low: number;
  volume_base: number;
  volume_quote: number;
}

export function buildStats(base: string, quoteToken: string): Stats {
  const d = buildDepth(base, quoteToken);
  const rnd = mulberry32(hash32(base + "/" + quoteToken + ":stats"));
  const change24 = rnd() * 6 - 2;
  return {
    base,
    quote: quoteToken,
    last: d.mid,
    change24,
    high: d.asks[0].price * 1.001,
    low: d.bids[d.bids.length - 1].price,
    volume_base: d.maxTotal,
    volume_quote: d.maxTotal * d.mid,
  };
}

export interface HistoryRow { price: number; amt: number; up: boolean; at: string }

export function buildHistory(base: string, quoteToken: string): HistoryRow[] {
  const rnd = mulberry32(hash32(base + "/" + quoteToken + ":hist"));
  const mid = priceOf(base) / priceOf(quoteToken);
  const baseQty = 1 + (hash32(base) % 40);
  const span = (a: number, b: number) => a + rnd() * (b - a);
  const out: HistoryRow[] = [];
  let t = Date.now();
  for (let i = 0; i < 26; i++) {
    t -= span(40, 5200) * 1000 * (i > 14 ? 60 : 1);
    out.push({
      price: mid * (1 + span(-0.04, 0.04)),
      amt: +(baseQty * span(0.05, 2.2)).toFixed(3),
      up: rnd() > 0.5,
      at: new Date(t).toISOString(),
    });
  }
  return out;
}
