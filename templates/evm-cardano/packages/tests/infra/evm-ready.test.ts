import { assert } from "../helpers.ts";

export async function evmReadyTest() {
  await assert("EVM chain (port 8545) responds with chainId 0x7a69", async () => {
    const res = await fetch("http://localhost:8545", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    const json = await res.json();
    return json.result === "0x7a69";
  });
}
