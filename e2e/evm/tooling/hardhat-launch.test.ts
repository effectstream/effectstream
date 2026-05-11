import { assert } from "@e2e/engine";

export async function hardhatLaunchTest() {
  await assert("Hardhat node is running on port 8545", async () => {
    const response = await fetch("http://localhost:8545", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_blockNumber",
        params: [],
      }),
    });
    const json = await response.json();
    return json.result !== undefined;
  });

  await assert("Hardhat parallel chain is running on port 8546", async () => {
    const response = await fetch("http://localhost:8546", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_blockNumber",
        params: [],
      }),
    });
    const json = await response.json();
    return json.result !== undefined;
  });

  await assert("Chain 31337 has correct chain ID", async () => {
    const response = await fetch("http://localhost:8545", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_chainId",
        params: [],
      }),
    });
    const json = await response.json();
    return parseInt(json.result, 16) === 31337;
  });

  await assert("Chain 31338 has correct chain ID", async () => {
    const response = await fetch("http://localhost:8546", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_chainId",
        params: [],
      }),
    });
    const json = await response.json();
    return parseInt(json.result, 16) === 31338;
  });
}
