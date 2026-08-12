import type { Client } from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PreparedQuery } from "@pgtyped/runtime";
import { MidnightBech32m } from "@midnightntwrk/wallet-sdk-address-format";
import { assert, assertSQL } from "../helpers.ts";
import { appStateTransitions } from "../../node/state-machine.ts";

/**
 * Phase B: unit test for the `midnight-unshielded-spend` state-machine
 * transition added when we wired the balancing-batcher M20 send.
 *
 * The handler's contract: given an unshielded UTXO spend by `owner`, find
 * the latest open M20 intent, look up its filler's unshielded hex address,
 * insert a synthetic `transfers` row from owner → filler at the intent's
 * amount, and fire `checkAndTransferFunds(transfer-received)` which marks
 * the intent resolved.
 *
 * We drive the real `appStateTransitions` generator with a fabricated
 * BaseStfInput so the test exercises the actual handler code path; the
 * runtime that normally pumps the generator (process-blocks.ts) is replaced
 * by `runStateMachine` below — it resolves each `World.resolve(query, params)`
 * yield against the same pg Client the rest of Phase B uses.
 */

// Drive a generator returned by `appStateTransitions` to completion.
// Mirrors the executor in `@effectstream/runtime`'s process-blocks.ts:
//   - World.resolve yields a `[queryIR, params]` tuple
//   - World.promise yields `{ type: "promise", promise }`
async function runStateMachine(
  blockHeight: number,
  conciseInput: string,
  db: Client,
): Promise<void> {
  const input: any = {
    blockHeight: blockHeight,
    blockTimestamp: Date.now(),
    conciseInput,
    randomGenerator: {} as any,
    emit: () => {},
  };
  const gen = appStateTransitions(blockHeight, input) as Generator<any, void, any>;
  let step = gen.next();
  while (!step.done) {
    const value = step.value;
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      value[0] &&
      typeof value[0] === "object" &&
      "statement" in (value[0] as any)
    ) {
      const [queryIR, params] = value as [any, any];
      const query = new PreparedQuery(queryIR);
      const rows = await query.run(params, db as any);
      step = gen.next(rows);
    } else if (value && typeof value === "object" && (value as any).type === "promise") {
      const out = await (value as any).promise;
      step = gen.next([out]);
    } else {
      throw new Error(
        `runStateMachine: unhandled yield shape: ${JSON.stringify(value)}`,
      );
    }
  }
}

// Convert a `mn_addr_*` bech32m unshielded address to its 32-byte hex form.
// Matches `unshieldedBech32mToHex` in state-machine.ts so the test stores
// the same on-the-wire format the handler will produce internally.
function unshieldedBech32mToHex(addr: string): string {
  const parsed = MidnightBech32m.parse(addr);
  const bytes = Uint8Array.prototype.slice.call(parsed.data, 0, 32);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Load Alpha Liquidity's preloaded wallet so the test asserts against the
// same hex address the state-machine's preloadedFillerWallets map computed.
function loadAlphaFillerHex(): string {
  const walletPath = resolve(
    import.meta.dirname!,
    "../../contracts-midnight/generated/wallet-0.json",
  );
  const data = JSON.parse(readFileSync(walletPath, "utf8")) as {
    unshieldedAddress?: string;
  };
  if (!data.unshieldedAddress) {
    throw new Error(
      `wallet-0.json is missing unshieldedAddress (run create-wallets-midnight first): ${walletPath}`,
    );
  }
  return unshieldedBech32mToHex(data.unshieldedAddress);
}

export async function unshieldedSpendTest(db: Client) {
  const orderId = `spend-test-${Date.now()}`;
  const fillerName = "Alpha Liquidity";
  const m20Amount = "12345"; // unique so we can identify the row precisely
  const ownerHex =
    "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

  let fillerHex: string;
  try {
    fillerHex = loadAlphaFillerHex();
  } catch (e) {
    await assert("Filler wallet preloaded (skipping if missing)", async () => {
      console.warn(`[unshielded-spend] skipping suite: ${(e as Error).message}`);
      return false;
    });
    return;
  }

  // Set up: quote for Alpha + open M20 intent with the unique amount. Make
  // sure this is the most recent open M20 intent so the handler picks it.
  await assert("Seed: insert quote for Alpha Liquidity filler", async () => {
    await db.query(
      `INSERT INTO quotes (order_id, from_token, filler, to_token, from_amount, to_amount, fee)
       VALUES ($1, 'm20', $2, 'btc', $3, '50000', '1')
       ON CONFLICT (order_id, filler) DO NOTHING`,
      [orderId, fillerName, m20Amount],
    );
    return true;
  });

  await assert("Seed: insert matching open M20 intent (the newest)", async () => {
    await db.query(
      `INSERT INTO intents (
         order_id, user_address, origin_chain_id, open_deadline, fill_deadline,
         max_spent_token, max_spent_amount, max_spent_recipient, max_spent_chain_id,
         min_received_token, min_received_amount, min_received_recipient, min_received_chain_id,
         destination_chain_id, destination_settler, origin_data, status,
         created_at
       ) VALUES (
         $1, '0xuser', '9999', '0', '0',
         'm20', $2, '0xrecipient', '9999',
         'btc', '50000', '0xbtcaddr', '1',
         '1', '0xsettler', '0x', '0',
         NOW()
       )`,
      [orderId, m20Amount],
    );
    return true;
  });

  // Construct the concise input the way `parseStmInput` expects:
  //   JSON.stringify([prefix, ...args])
  // For grammar entry `"midnight-unshielded-spend": [["payload", Type.Any()]]`
  // the tuple is `[prefix, payload]`.
  const conciseInput = JSON.stringify([
    "midnight-unshielded-spend",
    {
      owner: ownerHex,
      intentHash: "1111".repeat(16),
      outputIndex: 0,
      txHash: "abcd".repeat(16),
    },
  ]);

  await assert("Run STM with midnight-unshielded-spend input", async () => {
    await runStateMachine(1, conciseInput, db);
    return true;
  });

  // The handler should have inserted a transfer row pointing at Alpha's hex
  // for the intent's exact amount, with from_address == our ownerHex.
  await assertSQL<{ id: number; from_address: string; to_address: string; amount: string; used: boolean }>(
    "Handler inserted a transfer to the filler's hex at the intent's amount",
    db,
    `SELECT id, from_address, to_address, amount, used FROM transfers
     WHERE from_address = '${ownerHex}'
     AND to_address = '${fillerHex}'
     AND amount = ${m20Amount}
     AND token = 'm20'
     AND chain_id = '9999'
     ORDER BY id DESC
     LIMIT 1`,
    (rows) => rows.length > 0,
    (rows) => {
      const row = rows[0]!;
      return (
        row.from_address === ownerHex &&
        row.to_address === fillerHex &&
        row.amount === m20Amount
      );
    },
  );

  // checkAndTransferFunds(transfer-received) marks both transfer.used = TRUE
  // and the intent.status = '3' (resolved) via updateTransferUsed +
  // updateIntentResolved respectively.
  await assertSQL<{ used: boolean }>(
    "Handler marked the transfer used",
    db,
    `SELECT used FROM transfers
     WHERE from_address = '${ownerHex}' AND amount = ${m20Amount}
     ORDER BY id DESC LIMIT 1`,
    (rows) => rows.length > 0,
    (rows) => rows[0]!.used === true,
  );

  await assertSQL<{ status: string; resolved_by: string | null }>(
    "Handler marked the matching intent resolved",
    db,
    `SELECT status, resolved_by FROM intents WHERE order_id = '${orderId}'`,
    (rows) => rows.length > 0,
    (rows) => rows[0]!.status === "3" && rows[0]!.resolved_by === fillerName,
  );

  // Cleanup so reruns stay deterministic.
  await assert("Cleanup: delete seeded fixtures", async () => {
    await db.query(`DELETE FROM transfers WHERE from_address = $1`, [ownerHex]);
    await db.query(`DELETE FROM intents WHERE order_id = $1`, [orderId]);
    await db.query(`DELETE FROM quotes WHERE order_id = $1`, [orderId]);
    return true;
  });
}
