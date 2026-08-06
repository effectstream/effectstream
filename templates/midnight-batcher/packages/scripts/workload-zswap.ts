// zswap workload: shielded transfers built with payFees:false (proven + bound
// but NOT dust-balanced), submitted to the batcher's midnight-balancer target,
// which pays the fee from its own dust. Mirrors the zswap-da settlement path.
//
// Usage (host):
//   bun run workload:zswap -- --count 10 --concurrency 4 [--verify]
//
// Ground truth: the sink wallet's shielded balance increases by exactly
// `amount × delivered`, independent of anything the batcher reports.

import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { NETWORK, SEEDS } from "./env.ts";
import { sendTx, waitForBatcher } from "./batcher-client.ts";
import {
  buildFeelessShieldedTransfer,
  buildWallet,
  getShieldedBalance,
  toHex,
  waitSynced,
} from "./wallet.ts";

const args = process.argv.slice(2);
const flag = (name: string, dflt: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const COUNT = Number(flag("count", "5"));
const CONCURRENCY = Number(flag("concurrency", "4"));
const AMOUNT = BigInt(flag("amount", "1"));
const VERIFY = args.includes("--verify");
const VERIFY_TIMEOUT_MS = Number(flag("verify-timeout", "600000"));

async function main() {
  setNetworkId(NETWORK.id as never);
  await waitForBatcher();

  console.log(`[zswap] building maker + sink wallets...`);
  const maker = await buildWallet(NETWORK, SEEDS.zswapMaker);
  const sink = await buildWallet(NETWORK, SEEDS.zswapSink);
  await waitSynced(maker, { label: "maker" });
  await waitSynced(sink, { label: "sink" });

  const makerBalance = await getShieldedBalance(maker);
  const sinkBefore = await getShieldedBalance(sink);
  console.log(`[zswap] maker shielded=${makerBalance}, sink shielded=${sinkBefore}`);
  if (makerBalance < AMOUNT * BigInt(COUNT)) {
    throw new Error(`maker underfunded: ${makerBalance} < ${AMOUNT * BigInt(COUNT)} — run fund.ts`);
  }
  const sinkAddr = await sink.wallet.shielded.getAddress();

  console.log(`[zswap] submitting ${COUNT} feeless shielded transfers (concurrency=${CONCURRENCY})...`);
  let submitted = 0;
  let accepted = 0;
  let buildFailed = 0;
  let rejected = 0;
  const t0 = performance.now();

  const jobs = Array.from({ length: COUNT }, (_, i) => i);
  const workers = Array.from({ length: Math.min(CONCURRENCY, COUNT) }, async () => {
    for (;;) {
      const i = jobs.shift();
      if (i === undefined) return;
      try {
        const buildStart = performance.now();
        const finalized = await buildFeelessShieldedTransfer(maker, sinkAddr, AMOUNT);
        const hex = toHex(finalized.serialize());
        const buildMs = Math.round(performance.now() - buildStart);
        submitted += 1;
        const result = await sendTx(hex, { txStage: "finalized", address: maker.unshieldedAddress });
        if (result.ok) {
          accepted += 1;
          console.log(`[zswap] #${i}: accepted (build=${buildMs}ms, ${accepted}/${COUNT})`);
        } else {
          rejected += 1;
          console.error(`[zswap] #${i}: REJECTED status=${result.status} body=${JSON.stringify(result.body)}`);
        }
      } catch (e) {
        buildFailed += 1;
        console.error(`[zswap] #${i}: build failed: ${e instanceof Error ? e.message : e}`);
      }
    }
  });
  await Promise.all(workers);
  const wallMs = Math.round(performance.now() - t0);
  console.log(
    `[zswap] submit done: accepted=${accepted} rejected=${rejected} buildFailed=${buildFailed} in ${wallMs}ms`,
  );

  let delivered: number | null = null;
  if (VERIFY) {
    const want = sinkBefore + AMOUNT * BigInt(accepted);
    console.log(`[zswap] verifying: waiting for sink shielded balance ${sinkBefore} → ${want}...`);
    const start = Date.now();
    for (;;) {
      const now = await getShieldedBalance(sink);
      delivered = Number((now - sinkBefore) / AMOUNT);
      if (now >= want) break;
      if (Date.now() - start > VERIFY_TIMEOUT_MS) {
        console.error(`[zswap] VERIFY TIMEOUT: delivered ${delivered}/${accepted}`);
        break;
      }
      console.log(`[zswap] delivered so far: ${delivered}/${accepted}`);
      await new Promise((r) => setTimeout(r, 5_000));
    }
    console.log(`[zswap] delivered: ${delivered}/${accepted}`);
  }

  console.log(JSON.stringify({
    kind: "zswap",
    count: COUNT,
    accepted,
    rejected,
    buildFailed,
    delivered,
    wallMs,
  }));

  await Promise.allSettled([maker.wallet.stop(), sink.wallet.stop()]);
  process.exit(delivered !== null && delivered < accepted ? 1 : 0);
}

main().catch((e) => {
  console.error("[zswap] FAILED:", e);
  process.exit(1);
});
