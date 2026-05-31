import { assertSQL } from "../helpers.ts";
import { createPublicClient, createWalletClient, http, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { contractAddressesEvmMain } from "@gamemaker/contracts-evm";
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

// XP gained in the Phase B test. The STM applies `prev + experience * 10`, so
// the signer's row should end up with at least GAINED_XP * 10 experience.
export const GAINED_XP = 3;
export const EXPECTED_MIN_XP = GAINED_XP * 10;

// Wait for the `users` table to exist (its user-migration applies at Paima
// block 1), then return the wallet's current XP (0 if it has no row yet).
async function readBaselineXp(db: Client, wallet: string): Promise<number> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await db.query(
        `SELECT experience FROM users WHERE wallet = '${wallet}'`,
      );
      return Number(res.rows[0]?.experience ?? 0);
    } catch (e: any) {
      // `relation "users" does not exist` until the migration lands — retry.
      if (!/relation .*users.* does not exist/i.test(e?.message ?? "")) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  // Migration never applied — let the post-submit assertSQL surface a timeout.
  return 0;
}

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

export async function gainedExperienceTest(db: Client) {
  // The `users` user-migration applies when the sync node reaches Paima block
  // height 1, which can lag the "sync node healthy" signal by a beat. Poll
  // until the table exists before reading the baseline so we don't crash on
  // `relation "users" does not exist`.
  const beforeXp = await readBaselineXp(db, wallet0.address.toLowerCase());

  await submitInput(["gainedExperience", GAINED_XP]);
  await assertSQL(
    `gainedExperience: users.experience for signer increases by ${GAINED_XP * 10}`,
    db,
    `SELECT wallet, experience FROM users WHERE wallet = '${wallet0.address.toLowerCase()}'`,
    (res) => Number((res.rows[0] as any)?.experience ?? -1) >= beforeXp + GAINED_XP * 10,
    (res) =>
      (res.rows[0] as any).wallet === wallet0.address.toLowerCase() &&
      Number((res.rows[0] as any).experience) >= beforeXp + GAINED_XP * 10,
  );
}
