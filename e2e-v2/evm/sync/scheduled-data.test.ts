/**
 * Scheduled Data Tests
 *
 * Tests that STM can schedule data for future blocks and timestamps:
 * 1. Submit ["schedule", "1", "block", "111"] -> schedules attack at blockHeight+1
 * 2. Submit ["schedule", "1", "timestamp", "222"] -> schedules attack at timestamp+1ms
 * 3. Verify both scheduled attacks appear in user_state_machine
 */
import { assertSQL, type SharedState } from "@e2e-v2/engine";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { contractAddressesEvmMain } from "@e2e-v2/evm-contracts";
import type { Client } from "pg";

const wallet0 = {
  address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
  privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`,
};

const paimaL2Abi = [
  {
    inputs: [{ name: "data", type: "bytes" }],
    name: "paimaSubmitGameInput",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

async function submitInput(input: (string | number)[]): Promise<void> {
  const addresses = contractAddressesEvmMain();
  const paimaL2Address = addresses.chain31337["PaimaL2ContractModule#MyPaimaL2Contract"];
  const account = privateKeyToAccount(wallet0.privateKey);
  const walletClient = createWalletClient({ account, chain: hardhat, transport: http() });
  const publicClient = createPublicClient({ chain: hardhat, transport: http() });

  const hash = await walletClient.writeContract({
    address: paimaL2Address,
    abi: paimaL2Abi,
    functionName: "paimaSubmitGameInput",
    args: [toHex(JSON.stringify(input.map(String)))],
    value: parseEther("0.0000000001"),
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

export async function scheduledDataTest(db: Client, sharedState: SharedState) {
  // Submit a schedule command that creates an attack at blockHeight+1
  await submitInput(["schedule", "1", "block", "111"]);
  sharedState.primitive_accounting_counter += 1;

  // Wait for the scheduled attack to be processed (needs a few blocks)
  await assertSQL<{ inputs: string }>(
    "Scheduled: block-triggered attack appears in user_state_machine",
    db,
    `SELECT inputs FROM user_state_machine ORDER BY id ASC;`,
    (res) => res.rows.some((r: any) => r.inputs === "attack playerId: 111 with moveId: 1"),
    (res) => {
      return res.rows.some((r: any) => r.inputs === "attack playerId: 111 with moveId: 1");
    },
  );

  // Submit a schedule command that creates an attack at timestamp+1ms
  await submitInput(["schedule", "1", "timestamp", "222"]);
  sharedState.primitive_accounting_counter += 1;

  // Wait for the scheduled attack to be processed
  await assertSQL<{ inputs: string }>(
    "Scheduled: timestamp-triggered attack appears in user_state_machine",
    db,
    `SELECT inputs FROM user_state_machine ORDER BY id ASC;`,
    (res) => res.rows.some((r: any) => r.inputs === "attack playerId: 222 with moveId: 1"),
    (res) => {
      return res.rows.some((r: any) => r.inputs === "attack playerId: 222 with moveId: 1");
    },
  );
}
