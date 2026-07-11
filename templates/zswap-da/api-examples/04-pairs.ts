// 04-pairs.ts — List all known trading pairs with live open counts.
// bun run api-examples/04-pairs.ts

import { get, print, header } from "./config.ts";

header("Trading Pairs");

const pairs = await get<any[]>("/api/pairs");
print("GET /api/pairs", pairs);

if (pairs.length === 0) {
  console.log("\nNo pairs yet — open offers will create pairs automatically.");
} else {
  console.log(`\n${pairs.length} pair(s):\n`);
  for (const p of pairs) {
    const base  = p.base_name  ?? (p.base_color  as string).slice(0, 8) + "…";
    const quote = p.quote_name ?? (p.quote_color as string).slice(0, 8) + "…";
    console.log(
      `  ${(base + "/" + quote).padEnd(24)}  open: ${String(p.open_count ?? 0).padStart(4)}  last: ${p.last_price ?? "—"}`
    );
  }
}
