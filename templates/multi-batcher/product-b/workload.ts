// product-b workload — plain shielded transfers.
//
// No backend, no contracts: the product only builds `payFees: false` transfers
// and hands them to the shared batcher, which pays the dust. Its policy is
// `allowZswapTransfers`, so a contract call from this product is refused.
//
//   bun run product-b/workload.ts -- --count 5 --verify
//   bun run product-b/workload.ts -- --kind contract-call   # policy probe (expect 400)

import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";

import { ACTOR_SEEDS, NETWORK } from "../shared/env.ts";
import { sendTx, waitForBatcher } from "../shared/batcher-client.ts";
import {
  buildFeelessShieldedTransfer,
  buildWallet,
  getShieldedBalance,
  ignoreCleanWebSocketClose,
  toHex,
  waitSynced,
} from "../shared/wallet.ts";

export const TARGET = "product-b";

const args = process.argv.slice(2);
const flag = (name: string, dflt: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const COUNT = Number(flag("count", "3"));
const CONCURRENCY = Number(flag("concurrency", "3"));
const AMOUNT = BigInt(flag("amount", "1"));
const VERIFY = args.includes("--verify");
const VERIFY_TIMEOUT_MS = Number(flag("verify-timeout", "600000"));

/** Build one feeless transfer, hex-encoded, ready for /send-input. */
export async function buildTransferHex(amount = 1n): Promise<string> {
  const maker = await buildWallet(NETWORK, ACTOR_SEEDS.bMaker);
  const sink = await buildWallet(NETWORK, ACTOR_SEEDS.bSink);
  try {
    await waitSynced(maker, { label: "b-maker" });
    await waitSynced(sink, { label: "b-sink" });
    const finalized = await buildFeelessShieldedTransfer(
      maker,
      await sink.wallet.shielded.getAddress(),
      amount,
    );
    return toHex(finalized.serialize());
  } finally {
    await Promise.allSettled([maker.wallet.stop(), sink.wallet.stop()]);
  }
}

async function main() {
  setNetworkId(NETWORK.id as never);
  await waitForBatcher();

  const maker = await buildWallet(NETWORK, ACTOR_SEEDS.bMaker);
  const sink = await buildWallet(NETWORK, ACTOR_SEEDS.bSink);
  await waitSynced(maker, { label: "b-maker" });
  await waitSynced(sink, { label: "b-sink" });

  const makerBalance = await getShieldedBalance(maker);
  const sinkBefore = await getShieldedBalance(sink);
  console.log(`[${TARGET}] maker=${makerBalance} sink=${sinkBefore}`);
  if (makerBalance < AMOUNT * BigInt(COUNT)) {
    throw new Error(`maker underfunded: ${makerBalance} — run the fund step`);
  }
  const sinkAddr = await sink.wallet.shielded.getAddress();

  console.log(`[${TARGET}] submitting ${COUNT} transfer(s) (concurrency=${CONCURRENCY})...`);
  let accepted = 0, rejected = 0, buildFailed = 0;
  const t0 = performance.now();

  const jobs = Array.from({ length: COUNT }, (_, i) => i);
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, COUNT) }, async () => {
      for (;;) {
        const i = jobs.shift();
        if (i === undefined) return;
        try {
          const finalized = await buildFeelessShieldedTransfer(maker, sinkAddr, AMOUNT);
          const result = await sendTx(toHex(finalized.serialize()), {
            target: TARGET,
            txStage: "finalized",
          });
          if (result.ok) {
            accepted += 1;
            console.log(`[${TARGET}] #${i}: accepted (${accepted}/${COUNT})`);
          } else {
            rejected += 1;
            console.error(`[${TARGET}] #${i}: REJECTED ${result.status} ${JSON.stringify(result.body)}`);
          }
        } catch (e) {
          buildFailed += 1;
          console.error(`[${TARGET}] #${i}: build failed: ${e instanceof Error ? e.message : e}`);
        }
      }
    }),
  );
  const wallMs = Math.round(performance.now() - t0);

  let delivered: number | null = null;
  if (VERIFY) {
    const want = sinkBefore + AMOUNT * BigInt(accepted);
    console.log(`[${TARGET}] verifying sink ${sinkBefore} → ${want}...`);
    const start = Date.now();
    for (;;) {
      const now = await getShieldedBalance(sink);
      delivered = Number((now - sinkBefore) / AMOUNT);
      if (now >= want) break;
      if (Date.now() - start > VERIFY_TIMEOUT_MS) {
        console.error(`[${TARGET}] VERIFY TIMEOUT: ${delivered}/${accepted}`);
        break;
      }
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }

  console.log(JSON.stringify({
    kind: TARGET, count: COUNT, accepted, rejected, buildFailed, delivered, wallMs,
  }));
  await Promise.allSettled([maker.wallet.stop(), sink.wallet.stop()]);
  process.exit(delivered !== null && delivered < accepted ? 1 : 0);
}

if (import.meta.main) {
  ignoreCleanWebSocketClose("product-b");
  main().catch((e) => {
    console.error(`[${TARGET}] FAILED:`, e);
    process.exit(1);
  });
}
