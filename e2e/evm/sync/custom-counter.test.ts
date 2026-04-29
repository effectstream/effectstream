/**
 * Custom Counter Sync Test
 *
 * Flow: incrementCounter() twice
 *       -> custom primitive parses changedCount events
 *       -> primitive_accounting has entries with counter values 1, 2
 */
import { assertSQL, type SharedState } from "@e2e/engine";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { contractAddressesEvmMain } from "@e2e/evm-contracts";
import type { Client } from "pg";

const wallet0 = {
  address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
  privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`,
};

const counterAbi = [
  { inputs: [], name: "incrementCounter", outputs: [], stateMutability: "nonpayable", type: "function" },
] as const;

export async function customCounterSyncTest(db: Client, sharedState: SharedState) {
  const addresses = contractAddressesEvmMain();
  const counterAddress = addresses.chain31337["CounterModule#Counter"];
  const account = privateKeyToAccount(wallet0.privateKey);
  const walletClient = createWalletClient({ account, chain: hardhat, transport: http() });
  const publicClient = createPublicClient({ chain: hardhat, transport: http() });

  // Increment counter twice
  const h1 = await walletClient.writeContract({ address: counterAddress, abi: counterAbi, functionName: "incrementCounter" });
  await publicClient.waitForTransactionReceipt({ hash: h1 });
  sharedState.primitive_accounting_counter += 1;

  const h2 = await walletClient.writeContract({ address: counterAddress, abi: counterAbi, functionName: "incrementCounter" });
  await publicClient.waitForTransactionReceipt({ hash: h2 });
  sharedState.primitive_accounting_counter += 1;

  // Check primitive_accounting: Counter entries with counter=1 and counter=2
  await assertSQL<{ primitive_name: string; payload: any }>(
    "Counter: incrementCounter() x2 -> payload has counter=1 and counter=2",
    db,
    `SELECT primitive_name, payload FROM effectstream.primitive_accounting
     WHERE primitive_name = 'Counter' ORDER BY id ASC;`,
    (res) => res.rows.length >= 2,
    (res) => {
      const c1 = res.rows[0].payload?.counter ?? res.rows[0].payload?.data?.counter;
      const c2 = res.rows[1].payload?.counter ?? res.rows[1].payload?.data?.counter;
      return c1 === 1 && c2 === 2;
    },
  );

  // Check STM custom table: counter_results has the values
  await assertSQL<{ counter_value: number }>(
    "Counter: STM wrote counter_results with values 1 and 2",
    db,
    `SELECT counter_value FROM counter_results ORDER BY id ASC;`,
    (res) => res.rows.length >= 2,
    (res) => res.rows[0].counter_value === 1 && res.rows[1].counter_value === 2,
  );
}
