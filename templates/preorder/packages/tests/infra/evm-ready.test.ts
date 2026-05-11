import { assert } from "../helpers.ts";

export async function evmReadyTest() {
  await assert("Hardhat EVM responds on port 8545", async () => {
    const res = await fetch("http://localhost:8545", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }),
    });
    const data = await res.json() as any;
    return data.result === "0x7a69"; // 31337
  });
}
