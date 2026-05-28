import { assertSQL } from "../helpers.ts";
import { createPublicClient, createWalletClient, http, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { contractAddressesEvmMain } from "@world-map-2d/contracts-evm";
import type { Client } from "pg";

// Hardhat's well-known account #0
export const wallet0 = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);

const effectstreamL2Abi = [
  {
    inputs: [{ name: "data", type: "bytes" }],
    name: "effectstreamSubmitGameInput",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

// Coordinates exercised by the Phase B tests. Kept module-scoped so api.test.ts
// can assert the same values without re-reading them from the DB.
export const MOVE_X = 3;
export const MOVE_Y = 4;
export const INCREMENT_X = 5;
export const INCREMENT_Y = 5;

function submitInput(action: unknown[]) {
  const addresses = contractAddressesEvmMain();
  const contractAddr =
    addresses.chain31337["EffectstreamL2Module#MyEffectstreamL2"];
  const walletClient = createWalletClient({
    account: wallet0,
    chain: hardhat,
    transport: http(),
  });
  const publicClient = createPublicClient({ chain: hardhat, transport: http() });

  return walletClient
    .writeContract({
      address: contractAddr,
      abi: effectstreamL2Abi,
      functionName: "effectstreamSubmitGameInput",
      args: [toHex(JSON.stringify(action))],
    })
    .then((hash) => publicClient.waitForTransactionReceipt({ hash }));
}

export async function joinWorldTest(db: Client) {
  await submitInput(["joinWorld"]);
  await assertSQL(
    "joinWorld: global_user_state row created for signer at (0,0)",
    db,
    `SELECT wallet, x, y FROM global_user_state WHERE wallet = '${wallet0.address.toLowerCase()}'`,
    (res) => res.rows.length >= 1,
    (res) =>
      (res.rows[0] as any).wallet === wallet0.address.toLowerCase() &&
      Number((res.rows[0] as any).x) === 0 &&
      Number((res.rows[0] as any).y) === 0,
  );
}

export async function submitMoveTest(db: Client) {
  await submitInput(["submitMove", MOVE_X, MOVE_Y]);
  await assertSQL(
    `submitMove: global_user_state for signer updated to (${MOVE_X},${MOVE_Y})`,
    db,
    `SELECT x, y FROM global_user_state WHERE wallet = '${wallet0.address.toLowerCase()}'`,
    // Wait until the move has actually propagated; the joinWorld row exists
    // immediately at (0,0) so a length-only gate would fire too early.
    (res) =>
      res.rows.length >= 1 &&
      Number((res.rows[0] as any).x) === MOVE_X &&
      Number((res.rows[0] as any).y) === MOVE_Y,
    (res) =>
      Number((res.rows[0] as any).x) === MOVE_X &&
      Number((res.rows[0] as any).y) === MOVE_Y,
  );
}

export async function submitIncrementTest(db: Client) {
  // Read the cell's counter before the action so we test the *increment*,
  // not the absolute value (other test runs may have bumped it already).
  const before = await db.query(
    `SELECT counter FROM global_world_state WHERE x = ${INCREMENT_X} AND y = ${INCREMENT_Y}`,
  );
  const beforeCount = Number(before.rows[0]?.counter ?? 0);

  await submitInput(["submitIncrement", INCREMENT_X, INCREMENT_Y]);
  await assertSQL(
    `submitIncrement: global_world_state.counter at (${INCREMENT_X},${INCREMENT_Y}) increases`,
    db,
    `SELECT counter FROM global_world_state WHERE x = ${INCREMENT_X} AND y = ${INCREMENT_Y}`,
    (res) => Number((res.rows[0] as any)?.counter ?? 0) > beforeCount,
    (res) => Number((res.rows[0] as any).counter) >= beforeCount + 1,
  );
}
