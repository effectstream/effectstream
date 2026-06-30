// 05-market.ts — Quote, 24h stats, and trade history for a pair.
// bun run api-examples/05-market.ts
//
// Env overrides:
//   FROM=<64-hex>  TO=<64-hex>  AMOUNT=1000000
//   BASE=<64-hex>  QUOTE=<64-hex>

import { get, print, header } from "./config.ts";

const NIGHT = "0000000000000000000000000000000000000000000000000000000000000000";
// Fall back to NIGHT/NIGHT so the script runs even with no pairs seeded.
const FROM  = process.env.FROM  ?? NIGHT;
const TO    = process.env.TO    ?? "70ce552eaec9be6e009189bffbb69184b2dd008ba9bdaec6da5305fc505eb569";
const AMOUNT = process.env.AMOUNT ?? "1000000";
const BASE  = process.env.BASE  ?? TO;
const QUOTE = process.env.QUOTE ?? NIGHT;

header("Market Data");

// Quote
const quoteParams = new URLSearchParams({ from_token: FROM, to_token: TO, from_amount: AMOUNT });
try {
  const quote = await get(`/api/quote?${quoteParams}`);
  print(`GET /api/quote  (${AMOUNT} of ${FROM.slice(0,8)}… → ${TO.slice(0,8)}…)`, quote);
} catch (e: any) {
  console.log("Quote unavailable:", e.message);
}

// 24h stats
const pairParams = new URLSearchParams({ base: BASE, quote: QUOTE });
try {
  const stats = await get(`/api/chart/stats?${pairParams}`);
  print("GET /api/chart/stats", stats);
} catch (e: any) {
  console.log("Stats unavailable:", e.message);
}

// Trade history
try {
  const history = await get<any[]>(`/api/chart/history?${pairParams}`);
  print(`GET /api/chart/history (${(history as any[]).length} fills)`, history.slice(0, 5));
  if (history.length > 5) console.log(`  … and ${history.length - 5} more`);
} catch (e: any) {
  console.log("History unavailable:", e.message);
}
