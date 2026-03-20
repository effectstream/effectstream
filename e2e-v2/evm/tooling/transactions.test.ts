/**
 * Transactions tooling test - verifies contracts respond to read-only calls.
 *
 * NOTE: We do NOT submit write transactions here because the sync node
 * hasn't started yet. Any events emitted now would be replayed during sync
 * before user migration tables exist, causing STM errors.
 * Write transactions are done in the sync/ phase instead.
 */
import { assert } from "@e2e-v2/engine";
import {
  createPublicClient,
  http,
} from "viem";
import { hardhat } from "viem/chains";
import { contractAddressesEvmMain } from "@e2e-v2/evm-contracts";

const counterReadAbi = [
  {
    inputs: [],
    name: "getCount",
    outputs: [{ name: "", type: "int256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export async function transactionsTest() {
  const publicClient = createPublicClient({
    chain: hardhat,
    transport: http(),
  });

  await assert("Counter contract responds to getCount()", async () => {
    const addresses = contractAddressesEvmMain();
    const count = await publicClient.readContract({
      address: addresses.chain31337["CounterModule#Counter"],
      abi: counterReadAbi,
      functionName: "getCount",
    });
    // Fresh counter should be 0
    return count === 0n;
  });

  await assert("Can send ETH between wallets", async () => {
    // Simple ETH transfer doesn't produce any primitive events
    const response = await fetch("http://localhost:8545", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "latest"],
      }),
    });
    const json = await response.json();
    const balance = BigInt(json.result);
    return balance > 0n;
  });
}
