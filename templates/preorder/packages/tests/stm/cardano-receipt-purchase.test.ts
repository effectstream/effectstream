import { assert, assertSQL } from "../helpers.ts";
import type { Client } from "pg";
import { initLucid, buyItemsCardano, makeReferrer } from "@preorder/contracts-cardano/helpers";

// Exercises the on-chain Aiken minting-policy validator: a purchase is only recorded if the buyer
// could mint a receipt token atomically with paying the launchpad address inside the sale window.
export async function cardanoReceiptPurchaseTest(db: Client) {
  const lucid = await initLucid();

  // Item 1 ("Iron Helm") unitless price P = 5. ADA coin: x=435, n=4 → lovelace = P * 435 * 10^4.
  // 5 * 4_350_000 = 21_750_000 lovelace (≈ 21.75 ADA).
  const requiredLovelace = 21_750_000n;

  // (1) Happy path: pay exactly the required amount → validator accepts → STM records valid.
  let buyerPkh = "";
  await assert("Cardano receipt purchase submits on-chain (happy path)", async () => {
    const res = await buyItemsCardano(lucid, [[1, 1]], requiredLovelace);
    buyerPkh = res.buyerPkh;
    return Boolean(res.txHash);
  });

  await assertSQL(
    "Cardano purchase recorded as valid participation",
    db,
    `SELECT * FROM launchpad_participations WHERE wallet = '${buyerPkh.toLowerCase()}' AND chain = 'cardano' AND participation_valid = true`,
    (rows) => rows.length > 0,
    (rows) => rows.length > 0,
  );

  await assertSQL(
    "Cardano purchase recorded in unified payments as valid",
    db,
    `SELECT * FROM payments WHERE wallet = '${buyerPkh.toLowerCase()}' AND chain = 'cardano' AND status = 'valid'`,
    (rows) => rows.length > 0,
    (rows) => rows.length > 0,
  );

  // (2) Negative path: claim the required amount but underpay → on-chain validator REJECTS at submit.
  await assert("Underpaying purchase is rejected on-chain", async () => {
    try {
      await buyItemsCardano(lucid, [[1, 1]], requiredLovelace, 1_000_000n /* pay < claimed */);
      return false; // should not reach here — YACI rejects the minting policy
    } catch {
      return true;
    }
  });

  // (3) Referred purchase: the validator requires the referrer be paid 5% on-chain; the STM
  //     captures it in referral_rewards. reward = 21_750_000 * 500 / 10000 = 1_087_500 lovelace.
  let refPkh = "";
  await assert("Referred Cardano purchase submits on-chain", async () => {
    const ref = await makeReferrer();
    refPkh = ref.pkh;
    const res = await buyItemsCardano(lucid, [[1, 1]], requiredLovelace, requiredLovelace, ref);
    return Boolean(res.txHash);
  });

  await assertSQL(
    "Cardano referral reward captured in referral_rewards",
    db,
    `SELECT * FROM referral_rewards WHERE chain = 'cardano' AND referrer = '${refPkh.toLowerCase()}'`,
    (rows) => rows.length > 0,
    (rows) => BigInt((rows[0] as any).amount) === 1_087_500n,
  );
}
