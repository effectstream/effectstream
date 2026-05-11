import { assert, assertSQL } from "../helpers.ts";
import type { Client } from "pg";

export async function cardanoPaymentTest(db: Client) {
  const CARDANO_PAYMENT_ADDRESS =
    "addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp";

  const testTxHash = "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234";

  await assert("Insert Cardano payment record", async () => {
    await db.query(
      `INSERT INTO cardano_payments (tx_hash, output_index, payment_address, amount, block_height)
       VALUES ($1, $2, $3, $4, $5)`,
      [testTxHash, 0, CARDANO_PAYMENT_ADDRESS, "1000000000", 100],
    );
    return true;
  });

  await assertSQL(
    "Cardano payment exists in DB",
    db,
    `SELECT * FROM cardano_payments WHERE tx_hash = '${testTxHash}'`,
    (rows) => rows.length > 0,
    (rows) => {
      const row = rows[0] as any;
      return row.payment_address === CARDANO_PAYMENT_ADDRESS && BigInt(row.amount) === 1000000000n;
    },
  );

  await assert("Insert second Cardano payment", async () => {
    const txHash2 = "ef567890ef567890ef567890ef567890ef567890ef567890ef567890ef567890";
    await db.query(
      `INSERT INTO cardano_payments (tx_hash, output_index, payment_address, amount, block_height)
       VALUES ($1, $2, $3, $4, $5)`,
      [txHash2, 0, CARDANO_PAYMENT_ADDRESS, "5000000", 101],
    );
    return true;
  });

  await assertSQL(
    "Multiple Cardano payments recorded",
    db,
    `SELECT * FROM cardano_payments WHERE payment_address = '${CARDANO_PAYMENT_ADDRESS}'`,
    (rows) => rows.length >= 2,
    (rows) => rows.length >= 2,
  );
}
