// DIAGNOSTIC (not a pass/fail test): dump the structure of three offers to see
// exactly where the "want" leg is encoded for shielded vs. lost for unshielded.
//
//   A) all-shielded   give T0 / want T1   (the baseline that WORKS)
//   B) cross-kind     give shielded T0 / want UNSHIELDED U
//   C) cross-kind     give UNSHIELDED U  / want shielded T0
//
// For each we print deriveLegs() (what the validator sees), the per-segment
// imbalances, and structural counts (zswap offer inputs/outputs, intents +
// their unshielded-offer inputs/outputs). Introspects UNPROVEN txs (no proving).
//
//   bun packages/tests/unshielded-diagnose.ts

import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { UnshieldedAddress } from "@midnight-ntwrk/wallet-sdk-address-format";
import { registerNightForDust } from "@effectstream/midnight-contracts";
import { midnightNetworkConfig as net } from "@effectstream/midnight-contracts/midnight-env";
import { deriveLegs } from "@zswap-da/validator";

import { joinOfferFiles, mintShielded, mintUnshielded } from "./lib/offer-files.ts";
import { buildWallet, shieldedKeys, transferShielded, waitForShielded, waitForSync } from "./lib/wallet.ts";

globalThis.WebSocket = WebSocket;
setNetworkId(net.id as any);

const TAG = "[diag]";
const SEP = { T0: 0xb0, T1: 0xb1, U: 0xb2 } as const;
const MINT = 1_000_000_000n;
const FUND = 5_000_000n;
const AMT = 1_000n;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const short = (s: string) => s.slice(0, 8);

function introspect(label: string, tx: any) {
  console.log(`\n──────── ${label} ────────`);
  // 1) what the validator derives
  try {
    const legs = deriveLegs(tx);
    console.log(
      `deriveLegs: gives=[${legs.gives.map((g) => `${short(g.token)}:${g.amount}`).join(", ")}] ` +
        `wants=[${legs.wants.map((w) => `${short(w.token)}:${w.amount}`).join(", ")}]`,
    );
  } catch (e) {
    console.log(`deriveLegs threw: ${String(e).slice(0, 100)}`);
  }

  // 2) per-segment imbalances (the raw signal deriveLegs reads)
  const intentKeys = tx.intents ? Array.from(tx.intents.keys() as Iterable<number>) : [];
  const fallibleKeys = tx.fallibleOffer ? Array.from(tx.fallibleOffer.keys() as Iterable<number>) : [];
  const segs = Array.from(new Set<number>([0, ...intentKeys, ...fallibleKeys]));
  for (const seg of segs) {
    const entries: string[] = [];
    try {
      for (const [tt, delta] of tx.imbalances(seg) as Iterable<[any, bigint]>) {
        entries.push(`${tt.tag}:${tt.raw ? short(tt.raw) : "?"}=${(delta as bigint).toString()}`);
      }
    } catch (e) {
      entries.push(`(imbalances threw: ${String(e).slice(0, 60)})`);
    }
    console.log(`  seg${seg} imbalances: [${entries.join(", ")}]`);
  }

  // 3) structural counts
  const g = tx.guaranteedOffer;
  if (g) {
    console.log(`  zswap guaranteedOffer: inputs=${g.inputs?.length ?? 0} outputs=${g.outputs?.length ?? 0} transients=${g.transients?.length ?? 0}`);
  } else {
    console.log(`  zswap guaranteedOffer: (none)`);
  }
  if (tx.intents && typeof tx.intents.values === "function") {
    let i = 0;
    for (const intent of tx.intents.values() as Iterable<any>) {
      const gu = intent.guaranteedUnshieldedOffer;
      const fu = intent.fallibleUnshieldedOffer;
      console.log(
        `  intent[${i}] guaranteedUnshielded: inputs=${gu?.inputs?.length ?? 0} outputs=${gu?.outputs?.length ?? 0} | ` +
          `fallibleUnshielded: inputs=${fu?.inputs?.length ?? 0} outputs=${fu?.outputs?.length ?? 0}`,
      );
      i++;
    }
    if (i === 0) console.log(`  intents: (empty map)`);
  } else {
    console.log(`  intents: (none)`);
  }
}

console.log(`${TAG} building wallets + minting…`);
const genesis = await buildWallet(net.walletSeed);
// One wallet per offer so coin reservation from a prior unproven tx never
// collides (that was a diagnostic artifact, not real behavior).
const pA = await buildWallet("0000000000000000000000000000000000000000000000000000000000000040"); // give T0
const pB = await buildWallet("0000000000000000000000000000000000000000000000000000000000000041"); // give T0, want U
const pC = await buildWallet("0000000000000000000000000000000000000000000000000000000000000042"); // give U
try {
  await waitForSync(genesis, { requireUnshieldedFunds: true });
  try { await registerNightForDust(genesis as any); } catch { /* tolerate */ }
  await waitForSync(pC).catch(() => {});

  const pAaddr = await pA.wallet.shielded.getAddress();
  const pBaddr = await pB.wallet.shielded.getAddress();
  const pBunshielded = UnshieldedAddress.codec.decode(net.id as any, pB.unshieldedKeystore.getBech32Address());
  const pCaddr = await pC.wallet.shielded.getAddress();

  const deployed = await joinOfferFiles(genesis);
  const nonce = BigInt(Date.now());
  const T0 = await mintShielded(deployed, SEP.T0, MINT, nonce);
  const T1 = await mintShielded(deployed, SEP.T1, MINT, nonce + 1n);
  const U = await mintUnshielded(deployed, SEP.U, MINT, pC.unshieldedAddress);
  console.log(`${TAG} T0=${short(T0)} (shielded)  T1=${short(T1)} (shielded)  U=${short(U)} (unshielded→pC)`);

  // Fund pA + pB with T0; pC already minted U directly.
  for (const [w, addr] of [[pA, pAaddr], [pB, pBaddr]] as const) {
    if ((await waitForShielded(genesis, T0, FUND, 24)) >= FUND) await transferShielded(genesis, T0, FUND, addr);
  }
  await waitForShielded(pA, T0, AMT, 36);
  await waitForShielded(pB, T0, AMT, 36);
  for (let i = 0; i < 36 && (await (async () => { const st: any = await pC.wallet.unshielded.waitForSyncedState?.().catch(() => null); return (st?.balances?.[U] ?? 0n); })()) < AMT; i++) await sleep(5000);

  // A) all-shielded: give T0 want T1
  const a = await pA.wallet.initSwap(
    { shielded: { [T0]: AMT } },
    [{ type: "shielded", outputs: [{ type: T1, amount: AMT, receiverAddress: pAaddr }] } as any],
    shieldedKeys(pA),
    { ttl: new Date(Date.now() + 30 * 60_000), payFees: false },
  );
  introspect("A) all-shielded  give T0 / want T1   (WORKS baseline)", a.transaction);

  // B) cross: give shielded T0, want unshielded U
  try {
    const b = await pB.wallet.initSwap(
      { shielded: { [T0]: AMT } },
      [{ type: "unshielded", outputs: [{ type: U, amount: AMT, receiverAddress: pBunshielded }] } as any],
      shieldedKeys(pB),
      { ttl: new Date(Date.now() + 30 * 60_000), payFees: false },
    );
    introspect("B) cross-kind    give shielded T0 / want UNSHIELDED U", b.transaction);
  } catch (e) {
    console.log(`\n──────── B) give shielded T0 / want UNSHIELDED U ────────\n  initSwap THREW: ${String(e).slice(0, 160)}`);
  }

  // C) cross: give unshielded U, want shielded T0 (sign the unshielded intent)
  try {
    const c0 = await pC.wallet.initSwap(
      { unshielded: { [U]: AMT } } as any,
      [{ type: "shielded", outputs: [{ type: T0, amount: AMT, receiverAddress: pCaddr }] } as any],
      shieldedKeys(pC),
      { ttl: new Date(Date.now() + 30 * 60_000), payFees: false },
    );
    const cSigned = await (pC.wallet as any).signUnprovenTransaction(
      c0.transaction,
      (data: Uint8Array) => pC.unshieldedKeystore.signData(data),
    );
    introspect("C) cross-kind    give UNSHIELDED U / want shielded T0", cSigned);
  } catch (e) {
    console.log(`\n──────── C) give UNSHIELDED U / want shielded T0 ────────\n  initSwap THREW: ${String(e).slice(0, 160)}`);
  }
} finally {
  await pA.wallet.stop().catch(() => {});
  await pB.wallet.stop().catch(() => {});
  await pC.wallet.stop().catch(() => {});
  await genesis.wallet.stop().catch(() => {});
}
console.log(`\n${TAG} done.`);
process.exit(0);
