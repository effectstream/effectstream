/**
 * EffectstreamL2 Sync Test
 *
 * Flow: submit ["add", "100", "50"] on-chain via effectstreamSubmitGameInput
 *       -> sync picks up the event
 *       -> STM parses the grammar and logs: "add: 100 + 50 = 150"
 *       -> test checks primitive_accounting for the parsed payload data
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

const effectstreamL2Abi = [
  {
    inputs: [{ name: "data", type: "bytes" }],
    name: "effectstreamSubmitGameInput",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

export async function effectstreamL2SyncTest(db: Client, sharedState: SharedState) {
  const addresses = contractAddressesEvmMain();
  const effectstreamL2Address = addresses.chain31337["EffectstreamL2ContractModule#MyEffectstreamL2Contract"];

  const account = privateKeyToAccount(wallet0.privateKey);
  const walletClient = createWalletClient({ account, chain: hardhat, transport: http() });
  const publicClient = createPublicClient({ chain: hardhat, transport: http() });

  // Submit ["add", "100", "50"]
  const hash1 = await walletClient.writeContract({
    address: effectstreamL2Address,
    abi: effectstreamL2Abi,
    functionName: "effectstreamSubmitGameInput",
    args: [toHex(JSON.stringify(["add", "100", "50"]))],
    value: parseEther("0.0000000001"),
  });
  await publicClient.waitForTransactionReceipt({ hash: hash1 });
  sharedState.primitive_accounting_counter += 1;

  // Submit ["add", "7", "3"]
  const hash2 = await walletClient.writeContract({
    address: effectstreamL2Address,
    abi: effectstreamL2Abi,
    functionName: "effectstreamSubmitGameInput",
    args: [toHex(JSON.stringify(["add", "7", "3"]))],
    value: parseEther("0.0000000001"),
  });
  await publicClient.waitForTransactionReceipt({ hash: hash2 });
  sharedState.primitive_accounting_counter += 1;

  // Check primitive_accounting: 2 EffectstreamGameInteraction entries with parsed data
  await assertSQL<{ primitive_name: string; payload: any }>(
    "EffectstreamL2: add(100,50) and add(7,3) parsed in primitive_accounting",
    db,
    `SELECT primitive_name, payload FROM effectstream.primitive_accounting
     WHERE primitive_name = 'EffectstreamGameInteraction' ORDER BY id ASC;`,
    (res) => res.rows.length >= 2,
    (res) => {
      const p1 = res.rows[0].payload;
      const p2 = res.rows[1].payload;
      const d1 = p1.data || p1;
      const d2 = p2.data || p2;
      return JSON.stringify(d1) === JSON.stringify(["add", "100", "50"])
          && JSON.stringify(d2) === JSON.stringify(["add", "7", "3"]);
    },
  );

  // Check STM custom table: game_results has computed values
  await assertSQL<{ a: number; b: number; result: number }>(
    "EffectstreamL2: STM wrote game_results: 100+50=150, 7+3=10",
    db,
    `SELECT a, b, result FROM game_results ORDER BY id ASC;`,
    (res) => res.rows.length >= 2,
    (res) => {
      return res.rows[0].a === 100 && res.rows[0].b === 50 && res.rows[0].result === 150
          && res.rows[1].a === 7  && res.rows[1].b === 3  && res.rows[1].result === 10;
    },
  );

  // Check that wallet0's address was tracked after submitting game inputs
  await assertSQL<{ address: string }>(
    "EffectstreamL2: wallet0 address tracked in effectstream.addresses",
    db,
    `SELECT address FROM effectstream.addresses;`,
    (res) => res.rows.length >= 1,
    (res) => {
      return res.rows.some(
        (r: any) => r.address === wallet0.address.toLowerCase()
      );
    },
  );
}
