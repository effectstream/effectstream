// Generate a REAL proven ZSwap offer fixture, fully headless — no browser, no
// Lace. Requires the local dev environment to be running (midnight node +
// indexer + proof server), i.e. `bun run dev` / the orchestrator.
//
//   bun packages/tests/make-offer-fixture.ts
//
// Flow: build the genesis wallet via the same facade the batcher uses →
// wait for funds → `initSwap` (the headless equivalent of Lace's `makeIntent`:
// an intentionally UNBALANCED transaction — gives native, wants another token
// routed back to the maker) → `finalizeTransaction` (proves via the proof
// server + binds) → bech32m-encode → validate with @zswap-da/validator →
// write packages/validator/fixtures/valid-offer.bech32.
//
// The resulting <SignatureEnabled, Proof, Binding> blob activates the 5
// skipped crypto tests in packages/validator and empirically verifies that
// `wellFormed` accepts a blank LedgerState for a real offer.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildWalletAndWaitForFunds } from "@effectstream/midnight-contracts";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { encodeOffer } from "mip-zswap-offer";
import { getBlankRefState, validateZswapOffer } from "@zswap-da/validator";

const FIXTURE_PATH = join(
  import.meta.dir,
  "..",
  "validator",
  "fixtures",
  "valid-offer.bech32",
);

// A made-up shielded token color for the WANT side — wants don't require
// ownership; the maker simply routes the desired token to themselves.
const WANT_TOKEN = "ff".repeat(32);
const WANT_AMOUNT = 5_000_000n;
const GIVE_AMOUNT = 1_000_000n;

async function main(): Promise<void> {
  const net = midnightNetworkConfig;
  console.log(`[fixture] network=${net.id} indexer=${net.indexer} proofServer=${net.proofServer}`);

  const networkUrls = {
    id: net.id,
    indexer: net.indexer,
    indexerWS: net.indexerWS,
    node: net.node,
    proofServer: net.proofServer,
  } as const;

  console.log("[fixture] building genesis wallet + waiting for funds…");
  // `walletSeed` is env-resolved (MIDNIGHT_WALLET_SEED) and defaults to the
  // devnet genesis seed on `undeployed`.
  const result = await buildWalletAndWaitForFunds(
    networkUrls as any,
    net.walletSeed,
    net.id as any,
  );
  const { wallet, zswapSecretKeys, dustSecretKey } = result;

  try {
    const state = await wallet.shielded.waitForSyncedState();
    const balances = state.balances as Record<string, bigint>;
    console.log(
      "[fixture] shielded balances:",
      Object.fromEntries(Object.entries(balances).map(([k, v]) => [k, v.toString()])),
    );

    // The funded token (native) = the entry with the largest balance.
    const funded = Object.entries(balances).sort((a, b) => (a[1] < b[1] ? 1 : -1))[0];
    if (!funded || funded[1] < GIVE_AMOUNT) {
      throw new Error(`genesis wallet has no spendable shielded balance (got ${JSON.stringify(balances)})`);
    }
    const [giveToken] = funded;
    console.log(`[fixture] give ${GIVE_AMOUNT} of ${giveToken.slice(0, 16)}…, want ${WANT_AMOUNT} of ${WANT_TOKEN.slice(0, 16)}…`);

    const address = await wallet.shielded.getAddress();

    const recipe = await wallet.initSwap(
      { shielded: { [giveToken]: GIVE_AMOUNT } },
      [
        {
          type: "shielded",
          // Inner TokenTransfer: `type` is the RAW token color (the wrapper's
          // `type` above is the shielded/unshielded discriminant).
          outputs: [
            { type: WANT_TOKEN, amount: WANT_AMOUNT, receiverAddress: address },
          ],
        } as any,
      ],
      { shieldedSecretKeys: zswapSecretKeys, dustSecretKey },
      { ttl: new Date(Date.now() + 30 * 60_000), payFees: false },
    );
    console.log(`[fixture] initSwap recipe: ${recipe.type}`);

    console.log("[fixture] proving + binding via proof server (this takes a while)…");
    const t0 = performance.now();
    const finalized = await wallet.finalizeTransaction(recipe.transaction);
    console.log(`[fixture] proved in ${Math.round(performance.now() - t0)}ms`);

    const raw = finalized.serialize();
    const blob = encodeOffer(raw);
    console.log(`[fixture] offer blob: ${blob.slice(0, 48)}… (${raw.length} bytes)`);

    // The point of the exercise: a real proven offer must pass the shipped
    // validator with a BLANK reference state.
    const verdict = validateZswapOffer(blob, {
      refState: getBlankRefState(net.id),
      tblock: new Date(),
      maxBytes: 4 * 1024 * 1024,
    });
    if (!verdict.ok) {
      throw new Error(`validator REJECTED the real offer: ${verdict.code} — ${verdict.reason}`);
    }
    console.log("[fixture] ✅ validator accepts the offer (blank refState)");
    console.log("[fixture]   gives:", JSON.stringify(verdict.gives));
    console.log("[fixture]   wants:", JSON.stringify(verdict.wants));
    console.log("[fixture]   nullifiers:", verdict.nullifiers?.length, "unshielded spends:", verdict.unshieldedSpends?.length);

    writeFileSync(FIXTURE_PATH, blob + "\n");
    console.log(`[fixture] ✅ written ${FIXTURE_PATH}`);
  } finally {
    await wallet.stop().catch(() => {});
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[fixture] FAILED:", e);
    process.exit(1);
  });
