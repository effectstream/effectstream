// 01-health.ts — Check liveness and sync progress.
// bun run api-examples/01-health.ts

import { config, get, print, header } from "./config.ts";

header("Health");
console.log(`Node: ${config.nodeUrl}  Network: ${config.networkId}`);

const liveness = await fetch(`${config.nodeUrl}/health`);
print("/health", { status: liveness.status, ok: liveness.ok });

const sync = await get("/api/health/sync");
print("/api/health/sync", sync);

const s = sync as any;
if (s.status === "ok") {
  console.log("\n✅  Node is fully synced and serving live data.");
} else if (s.status === "syncing") {
  const lag = s.ntp?.lag_seconds ?? 0;
  const hrs = (lag / 3600).toFixed(1);
  console.log(`\n⏳  Still syncing — ${hrs}h of history remaining (NTP ${s.ntp?.pct?.toFixed(1)}%).`);
  console.log("   ROOT_UNKNOWN errors on submit will resolve once sync completes.");
} else {
  console.log("\n⚠️  Sync status:", s.status);
}
