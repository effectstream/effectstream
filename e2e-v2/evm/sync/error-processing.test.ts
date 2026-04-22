/**
 * Error Processing Test
 *
 * Verifies that a STM transition that throws an error does not break sync.
 * After submitting a throw_error input, sync should continue processing
 * subsequent inputs normally.
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

async function submitInput(input: (string | number)[]): Promise<void> {
  const addresses = contractAddressesEvmMain();
  const effectstreamL2Address = addresses.chain31337["EffectstreamL2ContractModule#MyEffectstreamL2Contract"];
  const account = privateKeyToAccount(wallet0.privateKey);
  const walletClient = createWalletClient({ account, chain: hardhat, transport: http() });
  const publicClient = createPublicClient({ chain: hardhat, transport: http() });

  const hash = await walletClient.writeContract({
    address: effectstreamL2Address,
    abi: effectstreamL2Abi,
    functionName: "effectstreamSubmitGameInput",
    args: [toHex(JSON.stringify(input.map(String)))],
    value: parseEther("0.0000000001"),
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

export async function errorProcessingTest(db: Client, sharedState: SharedState) {
  // Record count before the error
  const beforeRes = await db.query(`SELECT COUNT(*)::text as cnt FROM effectstream.primitive_accounting`);
  const countBefore = parseInt(beforeRes.rows[0].cnt);

  // Submit a throw_error input — this should NOT crash the sync
  await submitInput(["throw_error"]);
  sharedState.primitive_accounting_counter += 1;

  // The error input should still be recorded in primitive_accounting
  await assertSQL<{ cnt: string }>(
    "Error: throw_error input recorded in primitive_accounting",
    db,
    `SELECT COUNT(*)::text as cnt FROM effectstream.primitive_accounting;`,
    (res) => parseInt(res.rows[0].cnt) > countBefore,
    (res) => parseInt(res.rows[0].cnt) > countBefore,
  );

  // Submit a normal add input AFTER the error — sync should still be working
  await submitInput(["add", "42", "58"]);
  sharedState.primitive_accounting_counter += 1;

  // Verify the normal input was processed and game_results was updated
  await assertSQL<{ a: number; b: number; result: number }>(
    "Error: sync continues after throw_error — add(42,58)=100 in game_results",
    db,
    `SELECT a, b, result FROM game_results WHERE a = 42 AND b = 58;`,
    (res) => res.rows.length >= 1,
    (res) => {
      return res.rows[0].a === 42 && res.rows[0].b === 58 && res.rows[0].result === 100;
    },
  );
}
