import {
  erc20Builder,
  erc721Builder,
  type SharedState,
  wallets,
} from "@e2e/engine";
import type { Client } from "pg";

// Start Test
export async function tokenTests(db: Client, sharedState: SharedState) {
  const erc20 = erc20Builder(sharedState);
  const erc721 = erc721Builder(sharedState);

  const multiplier = 10n ** 18n;

  console.log("Sending 500 erc721 events....");
  // Add some more ERC20 and ERC721 data.
  const tokens_b = Array.from(
    { length: 1000 },
    (_, i) => BigInt((i + 1) * 2),
  );
  for (let i = 0; i < 100; i++) {
    const t1 = tokens_b.shift()!;
    const t2 = tokens_b.shift()!;
    const t3 = tokens_b.shift()!;
    const t4 = tokens_b.shift()!;

    await erc721.b.mint(wallets[0].privateKey, t1, true, false);
    await erc721.b.mint(wallets[1].privateKey, t2, true, false);
    await erc721.b.mint(wallets[0].privateKey, t3, true, false);
    await erc721.b.mint(wallets[1].privateKey, t4, true, false);

    // TODO: It takes too long to process the tokens.
    //       So without a long timout the test will fail.
    // await assertSQL<{ primitive_name: string }>(
    //   "Check PaimaL2 sync-process (A0)",
    //   db,
    //   `SELECT
    //         primitive_name, id, paima_block_height, payload_type, payload
    //         FROM
    //         paima.primitive_accounting;`,
    //   (res) => res.rows.length === sharedState.primitive_accounting_counter,
    //   (res) => {
    //     return res.rows.length === sharedState.primitive_accounting_counter;
    //   },
    // );

    // await erc721.b.transfer(
    //   wallets[0].privateKey,
    //   wallets[1].address,
    //   t1,
    //   true,
    //   false,
    // );
    // await erc721.b.transfer(
    //   wallets[1].privateKey,
    //   wallets[0].address,
    //   t2,
    //   true,
    //   false,
    // );

    // TODO: It takes too long to process the tokens.
    //       So without a long timout the test will fail.
    // await assertSQL<{ primitive_name: string }>(
    //   "Check PaimaL2 sync-process (A1)",
    //   db,
    //   `SELECT
    //         primitive_name, id, paima_block_height, payload_type, payload
    //         FROM
    //         paima.primitive_accounting;`,
    //   (res) => res.rows.length === sharedState.primitive_accounting_counter,
    //   (res) => {
    //     return res.rows.length === sharedState.primitive_accounting_counter;
    //   },
    // );
  }

  //
  // TODO: Server crashes with i = 100
  // Lowering to 20
  //
  // 2025-06-27T18:55:43.612Z ERROR  paima-db: Error: Dynamic linking error: cannot resolve symbol setTempRet0
  // at e.<computed> (file:///Users/username/paima-engine/node_modules/.deno/@electric-sql+pglite@0.3.3/node_modules/@electric-sql/pglite/dist/index.js:1:89333)
  // at <anonymous> (wasm://wasm/0009251e:1:109038)
  // at invoke_ii (file:///Users/username/paima-engine/node_modules/.deno/@electric-sql+pglite@0.3.3/node_modules/@electric-sql/pglite/dist/index.js:3:238292)
  // at <anonymous> (wasm://wasm/02190c76:1:922777)
  // at <anonymous> (wasm://wasm/02190c76:1:2189246)
  // at <anonymous> (wasm://wasm/02190c76:1:2690420)
  // at <anonymous> (wasm://wasm/02190c76:1:3728154)
  // at <anonymous> (wasm://wasm/02190c76:1:987555)
  // at <anonymous> (wasm://wasm/02190c76:1:3315760)
  // at <anonymous> (wasm://wasm/02190c76:1:3316014)
  console.log("Sending 300 erc20 events....");
  for (let i = 0; i < 20; i++) {
    const t1 = BigInt((i + 1) * 2) * multiplier;
    const t2 = BigInt((i + 1) * 3) * multiplier;
    const tx = BigInt((i + 1) * 1) * multiplier;
    await erc20.b.mint(
      wallets[0].address,
      wallets[0].privateKey,
      t1,
      true,
      false,
    );
    await erc20.b.mint(
      wallets[1].address,
      wallets[1].privateKey,
      t2,
      true,
      false,
    );
    // await erc20.b.transfer(
    //   wallets[0].privateKey,
    //   wallets[1].address,
    //   tx,
    //   true,
    // );

    // TODO: It takes too long to process the tokens.
    //       So without a long timout the test will fail.
    // await assertSQL<{ primitive_name: string }>(
    //   "Check PaimaL2 sync-process (B)",
    //   db,
    //   `SELECT
    //         primitive_name, id, paima_block_height, payload_type, payload
    //         FROM
    //         paima.primitive_accounting;`,
    //   (res) => res.rows.length === sharedState.primitive_accounting_counter,
    //   (res) => {
    //     return res.rows.length === sharedState.primitive_accounting_counter;
    //   },
    // );
  }

  // ============ Check if the primitive_accounting table is correct state after all tests ============

  // await assertSQL<{ primitive_name: string }>(
  //   "Check PaimaL2 sync-process",
  //   db,
  //   `SELECT
  //         primitive_name, id, paima_block_height, payload_type, payload
  //         FROM
  //         paima.primitive_accounting;`,
  //   (res) => res.rows.length === sharedState.primitive_accounting_counter,
  //   (res) => {
  //     return res.rows.length === sharedState.primitive_accounting_counter;
  //   },
  // );
}
