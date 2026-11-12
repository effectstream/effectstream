import { assert } from "../helpers.ts";

export async function chainReadyTest() {
  await assert("EVM chain responds on port 8545", async () => {
    const res = await fetch("http://localhost:8545", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    const json = await res.json();
    return parseInt(json.result, 16) === 31337;
  });
}
