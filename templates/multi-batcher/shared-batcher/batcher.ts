// THE shared batcher: one process, one HTTP port, one queue — serving every
// product in the registry.
//
// Each product gets its own MidnightBalancingAdapter (own fee wallet, own
// worker pool, own policy), registered as its own target. Routing is explicit:
// unaddressed inputs are rejected rather than charged to whichever product
// happens to be first.

import { main, suspend } from "effection";
import { monitorEventLoopDelay } from "node:perf_hooks";
import path from "node:path";
import {
  type BatcherConfig,
  createNewBatcher,
  type DefaultBatcherInput,
  FileStorage,
  MidnightBalancingAdapter,
} from "@effectstream/batcher-sdk";

import { ACTOR_SEEDS, BATCHER_URL, NETWORK } from "../shared/env.ts";
import { assertRegistryIsSane, buildProducts } from "./registry.ts";

const PORT = Number(process.env.BATCHER_PORT ?? 3334);
const POLL_MS = Number(process.env.BATCHER_POLLING_INTERVAL_MS ?? 500);
const STORAGE_DIR = process.env.BATCHER_STORAGE_DIR ??
  path.join(import.meta.dirname!, "../batcher-data");

const products = buildProducts(NETWORK.id);
assertRegistryIsSane(products, Object.values(ACTOR_SEEDS));

const config: BatcherConfig<DefaultBatcherInput> = {
  pollingIntervalMs: POLL_MS,
  enableHttpServer: true,
  enableEventSystem: false,
  namespace: "multi-batcher",
  confirmationLevel: "no-wait",
  port: PORT,
  // Multi-product: never route an unaddressed input to an arbitrary product.
  requireExplicitTarget: true,
  // Per-product fairness is already structural: the limiter derives a
  // `target:<name>:global` bucket AND a `target:<name>:ip:<ip>` bucket per
  // request, so one noisy product can never spend another's budget. The knob
  // therefore belongs at the TOP level — `perTarget` accepts only
  // `maxRetries`/`retryDelayMs`, and the SDK's own schema comment says a
  // `rateLimit` written there "would be a config field that silently did
  // nothing". It was written there, so this template had been running on the
  // 1000-per-24h default rather than these numbers.
  //
  // That gap now matters: admission is charged by transaction WEIGHT (its
  // proof-bearing element count), not one unit per request, so a deep run's
  // few hundred submissions draw far more than a few hundred units against a
  // budget that does not reset while the process lives.
  rateLimit: {
    preAuthMaxRequests: 5_000,
    maxRequests: 5_000,
    globalMaxRequests: 5_000,
    windowMs: 60_000,
  },
};

const storage = new FileStorage(STORAGE_DIR);
const batcher = createNewBatcher(config, storage);

// The deep suite needs a measurement from THIS process: HTTP, adapter
// orchestration and validation dispatch all share this event loop. A probe in
// the host-side test runner would measure the wrong process. Reset each window
// so the reported p99 is not diluted by the long idle funding bootstrap.
if (process.env.MEASURE_EVENT_LOOP_LAG === "true") {
  const windowMs = Number(process.env.EVENT_LOOP_LAG_WINDOW_MS ?? 5_000);
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  const timer = setInterval(() => {
    const ms = (ns: number | bigint) => (Number(ns) / 1_000_000).toFixed(2);
    console.log(
      `[event-loop-lag] window=${windowMs}ms p50=${ms(delay.percentile(50))}ms ` +
        `p99=${ms(delay.percentile(99))}ms max=${ms(delay.max)}ms`,
    );
    delay.reset();
  }, windowMs);
  timer.unref();
}

for (const product of products) {
  const adapter = new MidnightBalancingAdapter(product.walletSeed, {
    indexer: NETWORK.indexer,
    indexerWS: NETWORK.indexerWS,
    node: NETWORK.node,
    proofServer: NETWORK.proofServer,
    walletNetworkId: NETWORK.id as never,
    syncProtocolName: product.target,
    maxSlotsPerWallet: product.maxSlotsPerWallet,
    logLabel: product.name,
    policy: product.policy,
  });
  batcher.addBlockchainAdapter(product.target, adapter, {
    criteriaType: "size",
    maxBatchSize: 1, // process as soon as anything is queued
  });
}

main(function* () {
  console.log(
    `[multi-batcher] serving ${products.length} product(s) on :${PORT} ` +
      `(${BATCHER_URL})`,
  );
  for (const p of products) {
    const rules = [
      p.policy.allowZswapTransfers ? "zswap-transfers" : null,
      p.policy.allowedContracts?.length ? `${p.policy.allowedContracts.length} contract(s)` : null,
      p.policy.allowedCircuits?.length ? `${p.policy.allowedCircuits.length} circuit(s)` : null,
      p.policy.allowCustomFinalFilter ? "custom-filter" : null,
    ].filter(Boolean).join(" + ") || "ALLOW-ALL";
    console.log(`  • ${p.target}: slots=${p.maxSlotsPerWallet} policy=[${rules}]`);
  }
  try {
    yield* batcher.runBatcher();
  } catch (error) {
    console.error("[multi-batcher] error:", error);
    yield* batcher.gracefulShutdownOp();
  }
  yield* suspend();
});
