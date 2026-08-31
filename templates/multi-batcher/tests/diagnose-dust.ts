// Dust diagnostic: dump every NIGHT UTXO and every dust coin for a wallet,
// with the fields that decide whether a fee can actually be paid.
//
// Answers "the wallet is funded, why can't it pay?" — which is a different
// question from "what is the balance?". Run against a live stack:
//
//   docker compose up -d
//   bun run tests/diagnose-dust.ts -- --seed product-a
//   bun run tests/diagnose-dust.ts -- --seed genesis --watch 120
//
// The field that misleads is `generatedNow`: it is an event-refreshed
// snapshot, not a live accrual, so on a quiet chain a perfectly healthy lane
// can read 0. Judge a lane by `rate` (> 0) and `dtime` (unset = still
// generating), not by the number the wallet last happened to publish.

import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import * as Rx from "rxjs";

import { ACTOR_SEEDS, GENESIS_SEED, NETWORK } from "../shared/env.ts";
import {
  buildWallet,
  ignoreCleanWebSocketClose,
  waitSynced,
} from "../shared/wallet.ts";
import { buildProducts } from "../shared-batcher/registry.ts";

/** Product seeds come from the registry — one source of truth. */
const PRODUCT_SEEDS: Record<string, string> = Object.fromEntries(
  buildProducts(NETWORK.id).map((p) => [p.target, p.walletSeed]),
);

const args = process.argv.slice(2);
const flag = (name: string, dflt: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};

const SEEDS: Record<string, string> = {
  genesis: GENESIS_SEED,
  ...PRODUCT_SEEDS,
  ...ACTOR_SEEDS,
};
const which = flag("seed", "product-a");
const watchSeconds = Number(flag("watch", "0"));

const DUST = 1_000_000_000_000_000n;
const fmt = (v: bigint) => `${(Number(v) / Number(DUST)).toFixed(4)} DUST`;

async function dump(label: string, ctx: Awaited<ReturnType<typeof buildWallet>>) {
  const full: any = await Rx.firstValueFrom(ctx.wallet.state());
  const dustState: any = await Rx.firstValueFrom(ctx.wallet.dust.state);

  const utxos: any[] = full.unshielded?.availableCoins ?? [];
  console.log(`\n── ${label}: ${utxos.length} NIGHT UTXO(s) ──`);
  for (const u of utxos) {
    console.log(
      `  value=${u.value ?? u.utxo?.value} ` +
        `registeredForDust=${u.meta?.registeredForDustGeneration} ` +
        `ctime=${u.meta?.ctime ?? "?"} ` +
        `intentHash=${String(u.intentHash ?? u.utxo?.intentHash ?? "?").slice(0, 16)}…`,
    );
  }

  const coins: any[] = dustState.availableCoins ?? [];
  console.log(`── ${label}: ${coins.length} dust coin(s) ──`);
  for (const c of coins) {
    const generated = BigInt(c.generatedNow ?? 0);
    console.log(
      `  generatedNow=${fmt(generated)} ` +
        `rate=${c.rate} ` +
        `maxCap=${c.maxCap} ` +
        `dtime=${c.dtime ?? "-"} ` +
        `backingNight=${String(c.token?.backingNight ?? "?").slice(0, 16)}… ` +
        `nightValue=${c.token?.initialValue ?? "?"} ` +
        `ctime=${c.token?.ctime ?? "?"}`,
    );
  }

  // The question that actually matters: which coin would the SDK pick, and
  // can it cover a fee? Selection takes the smallest coin with value > 0.
  const positives = coins
    .map((c) => BigInt(c.generatedNow ?? 0))
    .filter((v) => v > 0n)
    .sort((a, b) => (a < b ? -1 : 1));
  console.log(
    `── ${label}: selectable=${positives.length}` +
      (positives.length > 0 ? `, smallest=${fmt(positives[0])}` : "") +
      ` (a fee needs ≳0.3 DUST)`,
  );
}

async function main() {
  setNetworkId(NETWORK.id as never);
  const seed = SEEDS[which];
  if (!seed) {
    throw new Error(`unknown seed "${which}". Known: ${Object.keys(SEEDS).join(", ")}`);
  }
  console.log(`[diag] wallet=${which} node=${NETWORK.node}`);
  const ctx = await buildWallet(NETWORK, seed);
  try {
    await waitSynced(ctx, { label: which, timeoutMs: 300_000 });
    console.log(`[diag] unshielded address: ${ctx.unshieldedAddress}`);

    const deadline = Date.now() + watchSeconds * 1000;
    do {
      await dump(which, ctx);
      if (Date.now() < deadline) await new Promise((r) => setTimeout(r, 15_000));
    } while (Date.now() < deadline);
  } finally {
    await ctx.wallet.stop().catch(() => {});
  }
  process.exit(0);
}

ignoreCleanWebSocketClose("diag");

main().catch((e) => {
  console.error("[diag] failed:", e);
  process.exit(1);
});
