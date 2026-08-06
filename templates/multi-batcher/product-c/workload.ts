// product-c workload — swap offers, gated by a CUSTOM FINAL FILTER.
//
// No backend, no contracts. product-c's policy is `allowZswapTransfers` PLUS
// `matchedDeltaSwapFilter` (shared-batcher/registry.ts), which sponsors only
// matched-delta offers: exactly two shielded token deltas of equal magnitude
// and opposite sign (+X tokenA / −X tokenB).
//
//   bun run product-c/workload.ts -- --count 3            # matched swaps (accepted)
//   bun run product-c/workload.ts -- --kind unmatched     # plain transfer (rejected by the filter)
//   bun run product-c/workload.ts -- --inspect            # print the deltas of each shape
//
// `--inspect` prints what the ledger actually reports for each transaction
// shape, using the SAME helper the filter uses — the fastest way to see why a
// submission was accepted or refused.

import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { zswapTokenDeltas } from "@effectstream/batcher-sdk/midnight-policy";
import { Transaction as LedgerTransaction, rawTokenType } from "@midnight-ntwrk/ledger-v8";
import { fromHex } from "@midnight-ntwrk/midnight-js-utils";

import { ACTOR_SEEDS, NETWORK } from "../shared/env.ts";
import { counterContractAddress } from "../shared-batcher/registry.ts";
import { sendTx, waitForBatcher } from "../shared/batcher-client.ts";
import {
  buildFeelessShieldedTransfer,
  buildSwapOffer,
  buildWallet,
  getShieldedBalance,
  ignoreCleanWebSocketClose,
  shieldedTokenId,
  toHex,
  type WalletCtx,
  waitSynced,
} from "../shared/wallet.ts";

export const TARGET = "product-c";

const args = process.argv.slice(2);
const flag = (name: string, dflt: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const COUNT = Number(flag("count", "2"));
const AMOUNT = BigInt(flag("amount", "1"));
const KIND = flag("kind", "matched") as "matched" | "unmatched";
const INSPECT = args.includes("--inspect");

/** Deltas of a serialized (unproven) transaction, via the shared helper. */
export function deltasOfHex(hex: string, stage: "unproven" | "finalized" = "unproven") {
  const tx = stage === "unproven"
    ? LedgerTransaction.deserialize("signature", "pre-proof", "pre-binding", fromHex(hex))
    : LedgerTransaction.deserialize("signature", "proof", "binding", fromHex(hex));
  return zswapTokenDeltas(tx as never);
}

/**
 * The SECOND token type the swap trades against.
 *
 * A matched-delta swap needs two token types, and a bare dev chain ships only
 * the native shielded one — so the other side is a contract-issued token.
 * A contract's token colors are derived deterministically from
 * (domain separator, contract address), which means the color is well-defined
 * as soon as the contract exists; product-a's counter also exposes a
 * `mint_shielded` circuit if you want actual coins of it in a wallet.
 */
export const SWAP_DOMAIN_SEP = new Uint8Array(32).fill(0xc3);

export function swapTokenId(networkId = "undeployed"): string {
  const contract = counterContractAddress(networkId);
  if (!contract) {
    throw new Error(
      "product-c: no counter contract deployed yet — run product-a/deploy.ts first " +
        "(its address seeds the second token type this swap trades against)",
    );
  }
  return String(rawTokenType(SWAP_DOMAIN_SEP, contract))
    .replace(/^0x/, "").toLowerCase();
}

/**
 * A matched-delta swap offer: SPEND `amount` of the native shielded token and
 * CREATE `amount` of the contract-issued one — +X tokenA / −X tokenB.
 *
 * The maker holds native but not the contract token; supplying that side is
 * exactly what a counterparty or solver is for. That imbalance is what makes
 * this a swap, and its deltas are what the filter checks.
 */
export async function swapOfferHexFrom(
  maker: WalletCtx,
  amount = 1n,
): Promise<string> {
  const tx = await buildSwapOffer(
    maker,
    { [shieldedTokenId()]: amount },
    [{
      token: swapTokenId(NETWORK.id),
      amount,
      receiverAddress: await maker.wallet.shielded.getAddress(),
    }],
  );
  return toHex(tx.serialize());
}

/** Convenience wrapper that opens its own maker wallet. */
export async function buildMatchedSwapHex(amount = 1n): Promise<string> {
  const maker = await buildWallet(NETWORK, ACTOR_SEEDS.cMaker);
  try {
    await waitSynced(maker, { label: "c-maker" });
    return await swapOfferHexFrom(maker, amount);
  } finally {
    await maker.wallet.stop().catch(() => {});
  }
}

/** A plain transfer — valid zswap, but NOT a matched swap: the filter rejects it. */
export async function buildUnmatchedHex(amount = 1n): Promise<string> {
  const maker = await buildWallet(NETWORK, ACTOR_SEEDS.cMaker);
  const sink = await buildWallet(NETWORK, ACTOR_SEEDS.cSink);
  try {
    await waitSynced(maker, { label: "c-maker" });
    await waitSynced(sink, { label: "c-sink" });
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

  if (INSPECT) {
    console.log(`[${TARGET}] inspecting transaction shapes...`);
    const matched = await buildMatchedSwapHex(AMOUNT);
    console.log(
      `  matched swap deltas: ${
        JSON.stringify([...deltasOfHex(matched).entries()].map(([t, v]) => [t.slice(0, 10), String(v)]))
      }`,
    );
    const unmatched = await buildUnmatchedHex(AMOUNT);
    console.log(
      `  plain transfer deltas: ${
        JSON.stringify([...deltasOfHex(unmatched, "finalized").entries()].map(([t, v]) => [t.slice(0, 10), String(v)]))
      }`,
    );
    process.exit(0);
  }

  const maker = await buildWallet(NETWORK, ACTOR_SEEDS.cMaker);
  const sink = await buildWallet(NETWORK, ACTOR_SEEDS.cSink);
  await waitSynced(maker, { label: "c-maker" });
  await waitSynced(sink, { label: "c-sink" });
  console.log(
    `[${TARGET}] maker=${await getShieldedBalance(maker)} sink=${await getShieldedBalance(sink)} kind=${KIND}`,
  );
  const sinkAddr = await sink.wallet.shielded.getAddress();

  let accepted = 0, rejected = 0, buildFailed = 0;
  const t0 = performance.now();
  for (let i = 0; i < COUNT; i++) {
    try {
      const [hex, stage] = KIND === "matched"
        ? [await swapOfferHexFrom(maker, AMOUNT), "unproven" as const]
        : [
          toHex((await buildFeelessShieldedTransfer(maker, sinkAddr, AMOUNT)).serialize()),
          "finalized" as const,
        ];
      const result = await sendTx(hex, { target: TARGET, txStage: stage });
      if (result.ok) {
        accepted += 1;
        console.log(`[${TARGET}] #${i}: accepted (${accepted})`);
      } else {
        rejected += 1;
        console.error(`[${TARGET}] #${i}: REJECTED ${result.status} ${JSON.stringify(result.body)}`);
      }
    } catch (e) {
      buildFailed += 1;
      console.error(`[${TARGET}] #${i}: build failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(JSON.stringify({
    kind: TARGET,
    shape: KIND,
    count: COUNT,
    accepted,
    rejected,
    buildFailed,
    wallMs: Math.round(performance.now() - t0),
  }));
  await Promise.allSettled([maker.wallet.stop(), sink.wallet.stop()]);
  process.exit(0);
}

if (import.meta.main) {
  ignoreCleanWebSocketClose("product-c");
  main().catch((e) => {
    console.error(`[${TARGET}] FAILED:`, e);
    process.exit(1);
  });
}
