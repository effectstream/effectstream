/**
 * Generates the test fixture for gaps §1.3: ONE intent carrying unshielded outputs in BOTH the
 * guaranteed and fallible sections.
 *
 * Why a fixture rather than a live corpus. Two decode rules are only observable in this shape:
 *   - `outputIndex` restarts at 0 per section (a shared counter would make the fallible rows start
 *     at the guaranteed count);
 *   - guaranteed rows hash with `intentHash(0)` while fallible rows hash with
 *     `intentHash(<that intent's segment>)`, in the SAME transaction.
 * Separate transactions cannot test either: in a guaranteed-only transaction the counter starts at
 * 0 whether it is shared or not, and likewise fallible-only.
 *
 * This shape **constructs and finalizes cleanly but the node rejects it at submission** — measured
 * three times — because each section must balance independently by value and fees come out of the
 * guaranteed section. That does not matter here: the decode rules are a pure function of the
 * transaction BYTES, and the decoder never needs the chain to have accepted them. So we build,
 * split, finalize, and serialize — and never submit.
 *
 *   bun e2e/midnight-umbra/make-both-sections-fixture.ts > /dev/null   # writes the fixture file
 *
 * Run only when the fixture needs regenerating (e.g. a ledger format change); the committed bytes
 * are what the unit test uses, so the test needs no chain, no wallet, no dust.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import {
  buildWalletFacade,
  decodeUnshieldedAddress,
  makeUnshieldedOffer,
  resolveUnshieldedTokenId,
  syncAndWaitForFunds,
} from "../shared/contracts/midnight/faucet.ts";

const OUT = "packages/node-sdk/sync/test/fixtures/both-sections-intent.hex";
const GENESIS_SEED = "0000000000000000000000000000000000000000000000000000000000000001";

const urls = {
  indexer: midnightNetworkConfig.indexer,
  indexerWS: midnightNetworkConfig.indexerWS,
  node: midnightNetworkConfig.node,
  proofServer: midnightNetworkConfig.proofServer,
};

const walletResult = await buildWalletFacade(urls, GENESIS_SEED, midnightNetworkConfig.id);
try {
  await syncAndWaitForFunds(walletResult.wallet, {
    waitNonZero: true, logLabel: "both-sections-fixture", timeoutMs: 120_000,
  });
  const tokenId = await resolveUnshieldedTokenId(walletResult.wallet);
  const self = decodeUnshieldedAddress(walletResult.unshieldedAddress, walletResult.networkId);

  // Several outputs so each section ends up with more than one and the per-section index restart
  // is actually observable.
  const recipe = await walletResult.wallet.transferTransaction(
    [{
      type: "unshielded",
      outputs: [
        { amount: 1_000_000n, type: tokenId, receiverAddress: self },
        { amount: 1_100_000n, type: tokenId, receiverAddress: self },
        { amount: 1_200_000n, type: tokenId, receiverAddress: self },
        { amount: 1_300_000n, type: tokenId, receiverAddress: self },
      ],
    }],
    {
      shieldedSecretKeys: walletResult.walletZswapSecretKeys,
      dustSecretKey: walletResult.walletDustSecretKey,
    },
    { ttl: new Date(Date.now() + 3 * 60 * 1000) },
  );

  const tx = recipe.transaction as any;
  // Read the map ONCE, mutate, write it back: `tx.intents`'s getter returns fresh copies, so an
  // in-place mutation is silently discarded (measured: reports success, changes nothing).
  const intents = tx.intents;
  let split = false;
  for (const [segment, intent] of intents ?? new Map()) {
    const fallible = intent.fallibleUnshieldedOffer;
    const outs = fallible?.outputs ?? [];
    if (outs.length < 2) continue;
    const half = Math.ceil(outs.length / 2);
    intent.guaranteedUnshieldedOffer = makeUnshieldedOffer(fallible.inputs ?? [], outs.slice(0, half), fallible.signatures ?? []);
    intent.fallibleUnshieldedOffer = makeUnshieldedOffer([], outs.slice(half), fallible.signatures ?? []);
    intents.set(segment, intent);
    console.log(`split intent ${segment}: ${half} guaranteed / ${outs.length - half} fallible`);
    split = true;
    break;   // one intent carrying both sections is exactly the shape needed
  }
  tx.intents = intents;
  if (!split) {
    console.error("FAIL: no intent had >= 2 fallible outputs to split — fixture not written.");
    process.exit(1);
  }

  const signed = await walletResult.wallet.signUnprovenTransaction(
    tx, (payload: Uint8Array) => walletResult.unshieldedKeystore.signData(payload),
  );
  const finalized = await walletResult.wallet.finalizeTransaction(signed) as any;

  let guaranteed = 0, fallible = 0;
  for (const [, i] of finalized.intents ?? new Map()) {
    guaranteed += i.guaranteedUnshieldedOffer?.outputs?.length ?? 0;
    fallible += i.fallibleUnshieldedOffer?.outputs?.length ?? 0;
  }
  if (guaranteed < 2 || fallible < 1) {
    console.error(`FAIL: finalized shape is guaranteed=${guaranteed} fallible=${fallible}; the fixture must have >=2 guaranteed and >=1 fallible to test the index restart.`);
    process.exit(1);
  }

  const bytes: Uint8Array = finalized.serialize();
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, Buffer.from(bytes).toString("hex"));
  console.log(`wrote ${OUT}: ${bytes.length} bytes, guaranteed=${guaranteed} fallible=${fallible}`);
  process.exit(0);
} catch (e) {
  console.error("fixture generation failed:", (e as Error)?.message ?? e);
  process.exit(1);
} finally {
  try { await walletResult.wallet.stop(); } catch { /* best effort */ }
}
