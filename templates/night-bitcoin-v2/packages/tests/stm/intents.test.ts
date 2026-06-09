import type { Client } from "pg";
import { assert, assertSQL } from "../helpers.ts";

/**
 * Phase B: state-machine / database test.
 *
 * The night-bitcoin state machine ingests Bitcoin transfers and Midnight
 * contract events into three tables: `quotes`, `intents`, and `transfers`.
 * Driving a real cross-chain intent end-to-end from a test would require the
 * full filler stack and is reserved for a higher-level e2e suite; here we
 * verify the schema is migrated and accepts inserts so downstream tests can
 * trust the DB shape.
 */
export async function intentsTest(db: Client) {
  await assert("intents/quotes/transfers tables exist", async () => {
    const res = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('intents', 'quotes', 'transfers')`,
    );
    const found = new Set(res.rows.map((r) => r.table_name));
    return found.has("intents") && found.has("quotes") && found.has("transfers");
  });

  const orderId = `test-order-${Date.now()}`;

  await assert("Insert sample quote", async () => {
    await db.query(
      `INSERT INTO quotes (order_id, from_token, filler, to_token, from_amount, to_amount, fee)
       VALUES ($1, 'btc', 'AlphaFiller', 'M20', 100000, 50, 1)
       ON CONFLICT (order_id, filler) DO NOTHING`,
      [orderId],
    );
    return true;
  });

  await assertSQL(
    "Inserted quote is queryable",
    db,
    `SELECT order_id, from_token, to_token, filler FROM quotes
     WHERE order_id = '${orderId}' AND filler = 'AlphaFiller'`,
    (rows) => rows.length > 0,
    (rows) => {
      const row = rows[0] as any;
      return row.from_token === "btc" && row.to_token === "M20";
    },
  );

  await assert("Insert sample intent", async () => {
    await db.query(
      `INSERT INTO intents (
         order_id, user_address, origin_chain_id, open_deadline, fill_deadline,
         max_spent_token, max_spent_amount, max_spent_recipient, max_spent_chain_id,
         min_received_token, min_received_amount, min_received_recipient, min_received_chain_id,
         destination_chain_id, destination_settler, origin_data, status
       ) VALUES (
         $1, '0xuser', 'bitcoin-regtest', '0', '0',
         'btc', '100000', '0xrecipient', 'bitcoin-regtest',
         'M20', '50', '0xrecipient', 'midnight-undeployed',
         'midnight-undeployed', '0xsettler', '0x', '0'
       ) ON CONFLICT (order_id) DO NOTHING`,
      [orderId],
    );
    return true;
  });

  await assertSQL(
    "Inserted intent is queryable",
    db,
    `SELECT order_id, status, max_spent_token FROM intents
     WHERE order_id = '${orderId}'`,
    (rows) => rows.length > 0,
    (rows) => {
      const row = rows[0] as any;
      return row.status === "0" && row.max_spent_token === "btc";
    },
  );

  await assert("Insert sample transfer", async () => {
    await db.query(
      `INSERT INTO transfers (from_address, to_address, amount, token, chain_id)
       VALUES ('0xfrom', '0xto', 100000, 'btc', 'bitcoin-regtest')`,
    );
    return true;
  });

  await assertSQL(
    "Transfers table accepts rows",
    db,
    `SELECT COUNT(*)::int AS c FROM transfers WHERE token = 'btc'`,
    (rows) => rows.length > 0,
    (rows) => (rows[0] as any).c >= 1,
  );
}
