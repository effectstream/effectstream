/**
 * Produces the corpus shape the differential cannot otherwise obtain: unshielded UTXO creations in
 * the **GUARANTEED** section of an intent.
 *
 * Why it must be constructed rather than waited for. `decodeUnshieldedCreates` has two branches —
 * guaranteed outputs hash with `intentHash(0)`, fallible outputs with `intentHash(<segment id>)`
 * — and the wallet SDK's ordinary transfer path happens to place its outputs in the FALLIBLE
 * section (observed: segment 1). So every row in the demo corpus exercises one branch, and a
 * regression in the other would pass the suite. An earlier revision of the decoder used
 * `intentHash(0)` for *both* branches and survived exactly because no fallible row existed to
 * refute it; this closes the mirror gap.
 *
 * How. The wallet's `transferTransaction` returns a recipe whose `.transaction` is an UNBOUND
 * `UnprovenTransaction`, and `Intent.guaranteedUnshieldedOffer` / `.fallibleUnshieldedOffer` are
 * writable while unbound (the ledger's own `.d.ts` says writing throws only once `B = Binding`).
 * Signing happens AFTER, over whatever structure is present, so relocating the offer before
 * signing yields signatures over the moved shape rather than an invalidated transaction.
 *
 * This is a test-corpus generator, not production code: it deliberately reaches into transaction
 * internals that an application never would.
 */
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import {
  buildWalletFacade,
  decodeUnshieldedAddress,
  resolveUnshieldedTokenId,
  syncAndWaitForFunds,
} from "../shared/contracts/midnight/faucet.ts";

const GENESIS_SEED = "0000000000000000000000000000000000000000000000000000000000000001";
const TTL_MS = 3 * 60 * 1000;

const urls = {
  indexer: midnightNetworkConfig.indexer,
  indexerWS: midnightNetworkConfig.indexerWS,
  node: midnightNetworkConfig.node,
  proofServer: midnightNetworkConfig.proofServer,
};

/** Where an intent's unshielded outputs currently sit, for reporting and for the assertion. */
function sectionsOf(tx: any): { guaranteed: number; fallible: number } {
  let guaranteed = 0, fallible = 0;
  for (const [, intent] of tx.intents ?? new Map()) {
    guaranteed += intent.guaranteedUnshieldedOffer?.outputs?.length ?? 0;
    fallible += intent.fallibleUnshieldedOffer?.outputs?.length ?? 0;
  }
  return { guaranteed, fallible };
}

console.log(`Driving a GUARANTEED-section unshielded create against ${urls.node}`);
const walletResult = await buildWalletFacade(urls, GENESIS_SEED, midnightNetworkConfig.id);
try {
  await syncAndWaitForFunds(walletResult.wallet, {
    waitNonZero: true, logLabel: "guaranteed-create", timeoutMs: 120_000,
  });
  const tokenId = await resolveUnshieldedTokenId(walletResult.wallet);
  // `transferTransaction` wants a DECODED address, not the bech32 string.
  const self = decodeUnshieldedAddress(walletResult.unshieldedAddress, walletResult.networkId);

  const recipe = await walletResult.wallet.transferTransaction(
    [{ type: "unshielded", outputs: [{ amount: 1_000_000n, type: tokenId, receiverAddress: self }] }],
    {
      shieldedSecretKeys: walletResult.walletZswapSecretKeys,
      dustSecretKey: walletResult.walletDustSecretKey,
    },
    { ttl: new Date(Date.now() + TTL_MS) },
  );

  const tx = recipe.transaction as any;
  const before = sectionsOf(tx);
  console.log(`recipe as built: guaranteed=${before.guaranteed} fallible=${before.fallible}`);

  // Relocate every fallible unshielded offer into the guaranteed section, while still unbound.
  //
  // The map must be READ ONCE, mutated, and WRITTEN BACK. `tx.intents` is a writable field whose
  // getter returns fresh copies, so mutating an intent obtained from it is discarded silently --
  // measured: an in-place assignment reported "moved 1" while the sections stayed 0/2 unchanged.
  // The ledger's own docs describe the write-back path: "writing to this re-computes binding
  // information if and only if this transaction is unbound and unproven".
  const intents = tx.intents;
  let moved = 0;
  for (const [segment, intent] of intents ?? new Map()) {
    const fallible = intent.fallibleUnshieldedOffer;
    if (fallible === undefined || fallible === null) continue;
    if (intent.guaranteedUnshieldedOffer !== undefined && intent.guaranteedUnshieldedOffer !== null) {
      // Merging two offers is not a field assignment; leave it and report honestly rather than
      // silently producing a shape that is not what the test claims to cover.
      console.log("intent already has a guaranteed offer — not merging; leaving as-is");
      continue;
    }
    intent.guaranteedUnshieldedOffer = fallible;
    intent.fallibleUnshieldedOffer = undefined;
    intents.set(segment, intent);
    moved++;
  }
  tx.intents = intents;   // <- the write-back that actually applies the change

  const after = sectionsOf(tx);
  console.log(`after relocation:  guaranteed=${after.guaranteed} fallible=${after.fallible} (moved ${moved})`);

  if (after.guaranteed === 0) {
    console.error("FAIL: no guaranteed-section outputs after relocation — the shape this exists to produce was not created.");
    process.exit(1);
  }

  const signed = await walletResult.wallet.signUnprovenTransaction(
    tx, (payload: Uint8Array) => walletResult.unshieldedKeystore.signData(payload),
  );
  const finalized = await walletResult.wallet.finalizeTransaction(signed);
  const finalSections = sectionsOf(finalized as any);
  console.log(`finalized:         guaranteed=${finalSections.guaranteed} fallible=${finalSections.fallible}`);

  const txId = await walletResult.wallet.submitTransaction(finalized);
  console.log(`submitted txId=${txId} with ${finalSections.guaranteed} guaranteed-section output(s)`);
  process.exit(0);
} catch (e) {
  // A relocated offer may be rejected by the ledger's own well-formedness rules or by the node.
  // That is a real answer, not a crash to paper over: report it plainly so the gap stays visible
  // rather than being recorded as covered.
  console.error("guaranteed-section build/submit failed:", (e as Error)?.message ?? e);
  process.exit(1);
} finally {
  try { await walletResult.wallet.stop(); } catch { /* best effort */ }
}
