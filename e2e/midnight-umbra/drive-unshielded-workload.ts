/**
 * Drives unshielded-transfer activity so the UnshieldedCreate differential has offer-based creates
 * to compare.
 *
 * Why this is needed rather than optional: measured on a freshly-built stock stack, 20 of 24
 * regular transactions were `ClaimRewards`, which create a UTXO with no intent (see the plan's
 * §2.0) and which Phase 1 deliberately refuses. Without a driven workload the differential compares
 * almost nothing and would go green while proving nothing — the vacuity failure this suite exists
 * to prevent.
 */
import { triggerUnshieldedCreates, triggerUnshieldedSwap } from "../shared/contracts/midnight/faucet.ts";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";

const ROUNDS = Number(process.env.UNSHIELDED_ROUNDS ?? "2");
const urls = {
  indexer: midnightNetworkConfig.indexer,
  indexerWS: midnightNetworkConfig.indexerWS,
  node: midnightNetworkConfig.node,
  proofServer: midnightNetworkConfig.proofServer,
};
console.log(`Driving ${ROUNDS} unshielded round(s) against ${urls.node}`);

let landed = 0;
for (let i = 0; i < ROUNDS; i++) {
  try { await triggerUnshieldedCreates(urls, midnightNetworkConfig.id); landed++; console.log(`create round ${i + 1}: ok`); }
  catch (e) { console.error(`create round ${i + 1} failed:`, (e as Error)?.message ?? e); }
}
// A swap additionally produces outputs under a FALLIBLE offer, which is the case that
// discriminates intentHash(segmentId) from intentHash(0) — the rule an earlier revision got wrong.
try { await triggerUnshieldedSwap(urls, midnightNetworkConfig.id); landed++; console.log("swap: ok"); }
catch (e) { console.error("swap failed:", (e as Error)?.message ?? e); }

console.log(`\n${landed} workload transaction(s) landed`);
process.exit(landed > 0 ? 0 : 1);
