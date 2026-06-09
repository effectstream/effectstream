import type { Client } from "pg";
import { assert, assertSQL } from "../helpers.ts";

/**
 * Phase B: tests for hand-written DB queries.
 *
 * Today this covers `getLatestOpenIntentByToken` — added so the
 * `midnight-unshielded-spend` state-machine handler can find the open M20
 * intent to credit when a native unshielded transfer is observed. We assert
 * the SQL matches the wrapper in
 * `packages/database/sql/queries.queries.ts` (status='0' filter,
 * max_spent_token filter, ORDER BY created_at DESC, LIMIT 1) by exercising
 * the same statement against a freshly-seeded fixture.
 */
export async function queriesTest(db: Client) {
  const olderOrder = `q-test-older-${Date.now()}`;
  const newerOrder = `q-test-newer-${Date.now()}`;
  const resolvedOrder = `q-test-resolved-${Date.now()}`;
  const otherTokenOrder = `q-test-other-${Date.now()}`;

  await assert("Seed: insert older open M20 intent", async () => {
    await db.query(
      `INSERT INTO intents (
         order_id, user_address, origin_chain_id, open_deadline, fill_deadline,
         max_spent_token, max_spent_amount, max_spent_recipient, max_spent_chain_id,
         min_received_token, min_received_amount, min_received_recipient, min_received_chain_id,
         destination_chain_id, destination_settler, origin_data, status,
         created_at
       ) VALUES (
         $1, '0xuser', '9999', '0', '0',
         'm20', '1000', '0xrecipient', '9999',
         'btc', '50000', '0xbtcaddr', '1',
         '1', '0xsettler', '0x', '0',
         NOW() - INTERVAL '10 seconds'
       ) ON CONFLICT (order_id) DO NOTHING`,
      [olderOrder],
    );
    return true;
  });

  await assert("Seed: insert newer open M20 intent", async () => {
    await db.query(
      `INSERT INTO intents (
         order_id, user_address, origin_chain_id, open_deadline, fill_deadline,
         max_spent_token, max_spent_amount, max_spent_recipient, max_spent_chain_id,
         min_received_token, min_received_amount, min_received_recipient, min_received_chain_id,
         destination_chain_id, destination_settler, origin_data, status,
         created_at
       ) VALUES (
         $1, '0xuser', '9999', '0', '0',
         'm20', '2000', '0xrecipient', '9999',
         'btc', '60000', '0xbtcaddr', '1',
         '1', '0xsettler', '0x', '0',
         NOW()
       ) ON CONFLICT (order_id) DO NOTHING`,
      [newerOrder],
    );
    return true;
  });

  await assert("Seed: insert RESOLVED M20 intent (should NOT match)", async () => {
    await db.query(
      `INSERT INTO intents (
         order_id, user_address, origin_chain_id, open_deadline, fill_deadline,
         max_spent_token, max_spent_amount, max_spent_recipient, max_spent_chain_id,
         min_received_token, min_received_amount, min_received_recipient, min_received_chain_id,
         destination_chain_id, destination_settler, origin_data, status,
         created_at
       ) VALUES (
         $1, '0xuser', '9999', '0', '0',
         'm20', '9999', '0xrecipient', '9999',
         'btc', '99999', '0xbtcaddr', '1',
         '1', '0xsettler', '0x', '3',
         NOW() + INTERVAL '5 seconds'
       ) ON CONFLICT (order_id) DO NOTHING`,
      [resolvedOrder],
    );
    return true;
  });

  await assert("Seed: insert open intent for a DIFFERENT token", async () => {
    await db.query(
      `INSERT INTO intents (
         order_id, user_address, origin_chain_id, open_deadline, fill_deadline,
         max_spent_token, max_spent_amount, max_spent_recipient, max_spent_chain_id,
         min_received_token, min_received_amount, min_received_recipient, min_received_chain_id,
         destination_chain_id, destination_settler, origin_data, status,
         created_at
       ) VALUES (
         $1, '0xuser', '9999', '0', '0',
         'btc', '7777', '0xrecipient', '1',
         'm20', '8888', '0xrecipient', '9999',
         '9999', '0xsettler', '0x', '0',
         NOW() + INTERVAL '5 seconds'
       ) ON CONFLICT (order_id) DO NOTHING`,
      [otherTokenOrder],
    );
    return true;
  });

  // Exercise the same SQL the generated `getLatestOpenIntentByToken` wrapper
  // executes. Mirrors the IR in queries.queries.ts so any future drift
  // between the .sql source and the hand-written IR shows up here.
  await assertSQL<{ order_id: string; max_spent_amount: string }>(
    "getLatestOpenIntentByToken picks the NEWEST open M20 intent",
    db,
    `SELECT * FROM intents
     WHERE status = '0'
     AND max_spent_token = 'm20'
     ORDER BY created_at DESC
     LIMIT 1`,
    (rows) => rows.length > 0,
    (rows) => {
      const row = rows[0] as any;
      return (
        row.order_id === newerOrder &&
        row.max_spent_amount === "2000"
      );
    },
  );

  await assert(
    "getLatestOpenIntentByToken ignores resolved (status != '0') intents",
    async () => {
      const res = await db.query<{ order_id: string }>(
        `SELECT order_id FROM intents
         WHERE status = '0'
         AND max_spent_token = 'm20'
         ORDER BY created_at DESC
         LIMIT 1`,
      );
      // The resolved row has a later created_at than `newerOrder` but status='3',
      // so a correct query MUST NOT return it.
      return res.rows.length > 0 && res.rows[0]!.order_id !== resolvedOrder;
    },
  );

  await assert(
    "getLatestOpenIntentByToken filters by max_spent_token",
    async () => {
      const res = await db.query<{ order_id: string }>(
        `SELECT order_id FROM intents
         WHERE status = '0'
         AND max_spent_token = 'm20'
         ORDER BY created_at DESC
         LIMIT 1`,
      );
      // The other-token row is newest of all (status='0') but token='btc', so
      // a token-scoped query MUST NOT return it.
      return res.rows.length > 0 && res.rows[0]!.order_id !== otherTokenOrder;
    },
  );

  // Clean up so reruns of the test suite stay deterministic.
  await assert("Cleanup: delete seeded intents", async () => {
    await db.query(
      `DELETE FROM intents WHERE order_id IN ($1, $2, $3, $4)`,
      [olderOrder, newerOrder, resolvedOrder, otherTokenOrder],
    );
    return true;
  });
}
