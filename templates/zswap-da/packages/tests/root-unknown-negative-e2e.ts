// NEGATIVE e2e: a well-formed ZSwap offer (valid structure + valid ZK proof)
// that is rejected by the ROOT-KNOWN / past_roots gate — and therefore never
// reaches Celestia.
//
// You can't simply fabricate a root: the merkle root is a public input to the
// spend proof, so changing it fails `wellFormed` (PROOF_INVALID), not
// ROOT_UNKNOWN. A normally-built offer proves against a REAL chain root, which
// the node syncs into known_roots — so it would normally be accepted. To get a
// well-formed offer whose root the node does NOT recognise (an "aged-out of the
// past_roots window" root), we:
//   1. build a genuine offer and confirm it's well-formed via the validator
//      (this is the "valid formatted zswap" — passes structure + crypto),
//   2. advance the coin tree past that root (mint again) so the root is no
//      longer the latest (the node re-inserts only the LATEST root each block),
//   3. remove that root from the node's known_roots,
//   4. submit → expect 400 ROOT_UNKNOWN, and assert it never reached Celestia.
//
//   bun packages/tests/root-unknown-negative-e2e.ts

import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { encodeOffer } from "mip-zswap-offer";
import pg from "pg";
import { registerNightForDust } from "@effectstream/midnight-contracts";
import { midnightNetworkConfig as net } from "@effectstream/midnight-contracts/midnight-env";
import { getBlankRefState, validateZswapOffer } from "@zswap-da/validator";

import { joinOfferFiles, mintShielded } from "./lib/offer-files.ts";
import { buildWallet, shieldedKeys, waitForShielded, waitForSync } from "./lib/wallet.ts";
import { submitOffer } from "./lib/api.ts";

globalThis.WebSocket = WebSocket;
setNetworkId(net.id as any);

const TAG = "[root-unknown]";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SEP = { GIVE: 0xc0, ADVANCE: 0xc1 } as const;
const MINT = 1_000_000_000n;
const GIVE = 1_000_000n;
const WANT_TOKEN = "ff".repeat(32); // made-up want color; wants need no ownership
const WANT = 5_000_000n;

let failures = 0;
const check = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
};

async function db<T = any>(q: string, params: any[] = []): Promise<T[]> {
  const c = new pg.Client({ host: "127.0.0.1", port: 5432, user: "postgres", database: "postgres" });
  await c.connect();
  try {
    return (await c.query(q, params)).rows;
  } finally {
    await c.end().catch(() => {});
  }
}
const count = async (t: string) => Number((await db(`SELECT count(*)::int n FROM ${t}`))[0].n);
async function waitFor(name: string, fn: () => Promise<boolean>, tries = 24, ms = 5000): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (await fn()) return true;
    await sleep(ms);
  }
  console.log(`  (waitFor ${name} timed out)`);
  return false;
}

console.log(`${TAG} building genesis…`);
const genesis = await buildWallet(net.walletSeed);
try {
  await waitForSync(genesis, { requireUnshieldedFunds: true });
  try {
    await registerNightForDust(genesis as any);
  } catch (e) {
    console.warn(`${TAG} registerNightForDust: ${e instanceof Error ? e.message : String(e)} (continuing)`);
  }
  const addr = await genesis.wallet.shielded.getAddress();

  // 1. Mint a give token + build a genuine offer
  console.log(`${TAG} minting give token + building offer…`);
  const deployed = await joinOfferFiles(genesis);
  const nonce = BigInt(Date.now());
  const G = await mintShielded(deployed, SEP.GIVE, MINT, nonce);
  if ((await waitForShielded(genesis, G, GIVE, 24)) < GIVE) throw new Error("genesis missing give token");

  const recipe = await genesis.wallet.initSwap(
    { shielded: { [G]: GIVE } },
    [{ type: "shielded", outputs: [{ type: WANT_TOKEN, amount: WANT, receiverAddress: addr }] } as any],
    shieldedKeys(genesis),
    { ttl: new Date(Date.now() + 30 * 60_000), payFees: false },
  );
  const finalized = await genesis.wallet.finalizeTransaction(recipe.transaction);
  const blob = encodeOffer(finalized.serialize());

  // 2. Confirm it's a VALID, well-formed offer (structure + crypto) + read its root.
  const v = validateZswapOffer(blob, {
    refState: getBlankRefState(net.id),
    tblock: new Date(),
    maxBytes: 4 * 1024 * 1024,
  });
  check("offer is well-formed (valid structure + ZK proof)", v.ok === true, v.ok ? "" : `${(v as any).code}: ${(v as any).reason}`);
  const roots = (v as any).inputRoots as string[] | undefined;
  check("offer carries a readable input merkle root", !!roots && roots.length > 0, `roots=${roots?.length ?? 0}`);
  if (!v.ok || !roots || roots.length === 0) throw new Error("offer not well-formed / no root — cannot continue");
  const R = roots[0];
  console.log(`${TAG} offer input root: ${R.slice(0, 20)}…`);

  // 3. Confirm the node recognises this root (so the offer is genuinely
  //    fillable right now), then advance the tree past it.
  const knownOk = await waitFor("offer root synced into known_roots", async () =>
    (await db(`SELECT 1 FROM known_roots WHERE root = $1`, [R])).length > 0, 24);
  check("offer's root IS a recognised chain root (would be accepted now)", knownOk);
  const hR = Number((await db<{ height: string }>(`SELECT height FROM known_roots WHERE root = $1`, [R]))[0]?.height ?? 0);

  console.log(`${TAG} advancing the coin tree past the offer's root (mint again)…`);
  await mintShielded(deployed, SEP.ADVANCE, MINT, nonce + 1n);
  const advanced = await waitFor("tree advanced past offer root", async () =>
    Number((await db<{ m: string }>(`SELECT COALESCE(MAX(height),0)::text m FROM known_roots`))[0].m) > hR, 24);
  check("coin tree advanced past the offer's root (root now historical)", advanced, `hR=${hR}`);

  // 4. Remove the (now non-latest) root from the node's known set — simulating
  //    a root that has aged out of the past_roots window. It won't be re-added
  //    (the node only re-inserts the LATEST root).
  await db(`DELETE FROM known_roots WHERE root = $1`, [R]);
  const stillThere = (await db(`SELECT 1 FROM known_roots WHERE root = $1`, [R])).length;
  check("offer root removed from known_roots (aged out of past_roots window)", stillThere === 0);

  // 5. Submit the well-formed offer → must be rejected by the root gate and
  //    NEVER reach Celestia.
  const offersBefore = await count("offer_file");
  console.log(`${TAG} submitting the well-formed offer with the now-unknown root…`);
  const res = await submitOffer(blob);
  check("well-formed offer REJECTED by past_roots gate (400 ROOT_UNKNOWN)", res.status === 400 && res.body?.error === "ROOT_UNKNOWN",
    `status=${res.status} error=${res.body?.error}`);

  await sleep(8000); // a rejected offer is never forwarded; confirm it didn't index
  check("rejected offer NEVER reached Celestia (offer_file unchanged)", (await count("offer_file")) === offersBefore,
    `before=${offersBefore} now=${await count("offer_file")}`);
} finally {
  await genesis.wallet.stop().catch(() => {});
}

console.log(failures === 0 ? `\n${TAG} ✅ ROOT-UNKNOWN NEGATIVE PASS` : `\n${TAG} ❌ ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
