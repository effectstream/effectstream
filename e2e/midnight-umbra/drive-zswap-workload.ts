/**
 * Drives real zswap activity onto the chain so the ZswapRoot differential has something to
 * compare beyond genesis.
 *
 * Why this exists as its own step: genesis fires on every chain, identically, without any ingest
 * having happened. A differential run whose only firing height is 0 therefore proves almost
 * nothing -- it would stay green if live ingest were completely broken. The differential's own
 * vacuity guard rejects that case; this is what makes the guard satisfiable.
 *
 * Submits several zswap transactions in QUICK SUCCESSION deliberately. Beyond producing a corpus,
 * this is the only way to get the case real chains have not yet produced here: two zswap
 * transactions landing in the SAME block, with different post-transaction roots. That is what
 * discriminates "attribute the block's root to its LAST regular transaction" from "attribute it
 * to the only one there was" -- the rule effectstream's fetcher actually implements. Landing them
 * together is not guaranteed (it depends on block timing), so the differential does not require
 * it; when it does happen, the comparison covers it for free.
 */
import { triggerZswap } from "../shared/contracts/midnight/faucet.ts";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";

const ROUNDS = Number(process.env.ZSWAP_ROUNDS ?? "3");

const urls = {
  indexer: midnightNetworkConfig.indexer,
  indexerWS: midnightNetworkConfig.indexerWS,
  node: midnightNetworkConfig.node,
  proofServer: midnightNetworkConfig.proofServer,
};
console.log(`Driving ${ROUNDS} zswap round(s) against ${urls.node}`);

const results: { txId: string; nullifiers: number; commitments: number }[] = [];
for (let i = 0; i < ROUNDS; i++) {
  try {
    const r = await triggerZswap(urls, midnightNetworkConfig.id);
    results.push({
      txId: r.txId,
      nullifiers: r.expectedNullifiers.length,
      commitments: r.expectedCommitments.length,
    });
    console.log(`round ${i + 1}: txId=${r.txId}`);
  } catch (e) {
    // Report and keep going: a later round can still succeed, and a partial corpus is far more
    // useful than none. A total failure surfaces below as a non-zero exit.
    console.error(`round ${i + 1} failed:`, (e as Error)?.message ?? e);
  }
}

console.log(`\n${results.length}/${ROUNDS} zswap rounds landed`);
if (results.length === 0) {
  console.error("no zswap transaction landed -- the differential would be vacuous, failing here");
  process.exit(1);
}
process.exit(0);
