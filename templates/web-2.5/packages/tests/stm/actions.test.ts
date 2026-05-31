import { assertSQL } from "../helpers.ts";
import { createPublicClient, createWalletClient, http, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { contractAddressesEvmMain } from "@web-2.5/contracts-evm";
import type { Client } from "pg";

// Hardhat's well-known account #0 — the DIRECT submitter (pays its own gas).
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

export const TEST_NAME = "alice";
export const TEST_XP = 5; // calculateProgress(0, 5) = 50

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

// DIRECT path: account #0 self-sequences a changedName input.
export async function changeNameTest(db: Client) {
  await submitInput(["changedName", TEST_NAME]);
  await assertSQL(
    "changedName (direct): users.name set for signer",
    db,
    `SELECT name FROM users WHERE wallet = '${wallet0.address.toLowerCase()}'`,
    (res) => res.rows.length >= 1 && (res.rows[0] as any).name === TEST_NAME,
    (res) => (res.rows[0] as any).name === TEST_NAME,
  );
}

// DIRECT path: account #0 self-sequences a gainedExperience input.
// calculateProgress adds experience*10 to the current value.
export async function gainExperienceDirectTest(db: Client) {
  const before = await db.query(
    `SELECT experience FROM users WHERE wallet = '${wallet0.address.toLowerCase()}'`,
  );
  const beforeXp = Number(before.rows[0]?.experience ?? 0);

  await submitInput(["gainedExperience", TEST_XP]);
  await assertSQL(
    `gainedExperience (direct): users.experience grows by ${TEST_XP * 10}`,
    db,
    `SELECT experience FROM users WHERE wallet = '${wallet0.address.toLowerCase()}'`,
    (res) => Number((res.rows[0] as any)?.experience ?? 0) >= beforeXp + TEST_XP * 10,
    (res) => Number((res.rows[0] as any).experience) === beforeXp + TEST_XP * 10,
  );
}
