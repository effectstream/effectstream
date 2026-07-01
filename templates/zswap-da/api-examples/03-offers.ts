// 03-offers.ts — Read the live offer book; optionally filter by token/direction.
// bun run api-examples/03-offers.ts
// TOKEN=0000...0000 DIRECTION=GIVING bun run api-examples/03-offers.ts

import { config, get, print, header } from "./config.ts";

header("Live Offer Book");

const params = new URLSearchParams({ limit: "10" });
if (process.env.TOKEN)     params.set("token",     process.env.TOKEN);
if (process.env.DIRECTION) params.set("direction", process.env.DIRECTION);

const offers = await get<any[]>(`/api/zswaps?${params}`);
print(`GET /api/zswaps?${params}`, offers);

if (offers.length === 0) {
  console.log("\nNo open offers found.");
} else {
  console.log(`\n${offers.length} open offer(s):\n`);
  for (const o of offers) {
    const gives = o.gives.map((g: any) => `${g.amount} ${g.token.slice(0, 8)}…`).join(", ");
    const wants = o.wants.map((w: any) => `${w.amount} ${w.token.slice(0, 8)}…`).join(", ");
    console.log(`  [${o.id}] gives: ${gives}  →  wants: ${wants}  (Celestia #${o.celestia_height})`);
  }

  // Check status of the first offer (blobs can be large — skip if > 4 KB)
  const first = offers[0];
  if (first && first.transaction_hex.length < 4096) {
    console.log(`\nStatus check for offer ${first.id}:`);
    const status = await get<any>(`/api/zswap/status?blob=${encodeURIComponent(first.transaction_hex)}`);
    print("GET /api/zswap/status", status);
  }
}
