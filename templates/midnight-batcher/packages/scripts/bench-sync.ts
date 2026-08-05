// A/B benchmark for wallet sync batching (Sync.ts `batchUpdates` config).
//
//   bun run packages/scripts/bench-sync.ts --seed maker            # tuned (100/1ms/1ms)
//   MIDNIGHT_SYNC_BATCH_DISABLE=1 bun run packages/scripts/bench-sync.ts --seed maker
//
// Builds a fresh wallet (no cached state), times full sync against the
// current chain, and samples this process's RSS at 250ms. Prints one JSON line.

import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { NETWORK, SEEDS } from "./env.ts";
import { buildWallet, waitSynced } from "./wallet.ts";

const args = process.argv.slice(2);
const flag = (name: string, dflt: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const seedName = flag("seed", "maker") as keyof typeof SEEDS;
const seed = SEEDS[seedName] ?? SEEDS.zswapMaker;

const mib = (b: number) => Math.round(b / 1024 / 1024);

async function main() {
  setNetworkId(NETWORK.id as never);
  const disabled = process.env.MIDNIGHT_SYNC_BATCH_DISABLE === "1";

  let peakRss = 0;
  const sampler = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }, 250);

  const t0 = performance.now();
  const ctx = await buildWallet(NETWORK, seed);
  const buildMs = Math.round(performance.now() - t0);
  await waitSynced(ctx, { label: `bench-${disabled ? "default" : "tuned"}` });
  const syncMs = Math.round(performance.now() - t0);
  clearInterval(sampler);
  peakRss = Math.max(peakRss, process.memoryUsage().rss);

  console.log(JSON.stringify({
    mode: disabled ? "sdk-default" : "tuned-100-1-1",
    seed: seedName,
    buildMs,
    totalSyncMs: syncMs,
    peakRssMiB: mib(peakRss),
    finalRssMiB: mib(process.memoryUsage().rss),
  }));
  await ctx.wallet.stop().catch(() => {});
  process.exit(0);
}

main().catch((e) => {
  console.error("[bench-sync] FAILED:", e);
  process.exit(1);
});
