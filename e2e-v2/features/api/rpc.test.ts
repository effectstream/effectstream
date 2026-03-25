/**
 * RPC tests - validates the Paima EVM RPC proxy at /rpc/evm.
 * Covers: block number, get block, transactions, balance, gas, chain ID,
 *         logs, web3, net, syncing, uncle methods.
 */
import { assert } from "@e2e-v2/engine";
import { createPublicClient, defineChain, http } from "viem";

function getRpcClient(apiPort: number) {
  const chain = defineChain({
    id: 1,
    name: "Effectstream",
    nativeCurrency: { decimals: 18, name: "E", symbol: "E" },
    rpcUrls: { default: { http: [`http://localhost:${apiPort}/rpc/evm`] } },
  });
  return createPublicClient({ chain, transport: http() });
}

export async function rpcTest(apiPort: number) {
  const rpc = getRpcClient(apiPort);
  const rpcUrl = `http://localhost:${apiPort}/rpc/evm`;

  async function rawRpc(method: string, params: any[] = []) {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    return res.json();
  }

  await assert("RPC: eth_blockNumber", async () => {
    // Retry a few times - the RPC proxy needs at least one block processed
    for (let i = 0; i < 10; i++) {
      try {
        const bn = await rpc.getBlockNumber();
        if (typeof bn === "bigint" && bn > 0n) return true;
      } catch { /* not ready yet */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  });

  await assert("RPC: eth_getBlockByNumber", async () => {
    const block = await rpc.getBlock({ blockNumber: 1n });
    return block !== null && typeof block === "object";
  });

  await assert("RPC: eth_getBalance", async () => {
    const balance = await rpc.getBalance({ address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" });
    return typeof balance === "bigint";
  });

  await assert("RPC: eth_chainId", async () => {
    const chainId = await rpc.getChainId();
    return typeof chainId === "number" && chainId > 0;
  });

  await assert("RPC: eth_gasPrice", async () => {
    const gasPrice = await rpc.getGasPrice();
    return typeof gasPrice === "bigint" && gasPrice === 0n;
  });

  await assert("RPC: eth_getLogs", async () => {
    const logs = await rpc.getLogs({ fromBlock: 1n, toBlock: "latest" });
    return Array.isArray(logs);
  });

  await assert("RPC: eth_getTransactionCount", async () => {
    const count = await rpc.getTransactionCount({ address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" });
    return typeof count === "number" || typeof count === "bigint";
  });

  await assert("RPC: eth_getBlockByHash", async () => {
    const block1 = await rpc.getBlock({ blockNumber: 1n });
    if (!block1?.hash) return true;
    const block = await rpc.getBlock({ blockHash: block1.hash });
    return block !== null && typeof block === "object";
  });

  await assert("RPC: eth_estimateGas", async () => {
    const gas = await rpc.estimateGas({ to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", value: 1000n });
    return typeof gas === "bigint" && gas === 0n;
  });

  await assert("RPC: eth_syncing", async () => {
    const json = await rawRpc("eth_syncing");
    return json.result !== undefined;
  });

  await assert("RPC: web3_clientVersion", async () => {
    const json = await rawRpc("web3_clientVersion");
    return typeof json.result === "string" && json.result.includes("PaimaEngine");
  });

  await assert("RPC: web3_sha3", async () => {
    const json = await rawRpc("web3_sha3", ["0x68656c6c6f20776f726c64"]);
    return typeof json.result === "string" && json.result.startsWith("0x") && json.result.length === 66;
  });

  await assert("RPC: net_version", async () => {
    const json = await rawRpc("net_version");
    return typeof json.result === "string";
  });

  await assert("RPC: net_listening", async () => {
    const json = await rawRpc("net_listening");
    return json.result === true;
  });

  await assert("RPC: net_peerCount", async () => {
    const json = await rawRpc("net_peerCount");
    return json.result === "0x0";
  });

  await assert("RPC: eth_getBlockTransactionCountByNumber", async () => {
    const count = await rpc.getBlockTransactionCount({ blockNumber: 1n });
    return typeof count === "number" && count === 0;
  });

  await assert("RPC: eth_getUncleCountByBlockNumber", async () => {
    const json = await rawRpc("eth_getUncleCountByBlockNumber", ["0x1"]);
    return json.result === "0x0";
  });

  await assert("RPC: eth_getUncleByBlockNumberAndIndex", async () => {
    const json = await rawRpc("eth_getUncleByBlockNumberAndIndex", ["0x1", "0x0"]);
    return json.result === null;
  });

  // ── Methods ported from old e2e ──────────────────────────────────────────

  await assert("RPC: eth_getTransactionByHash", async () => {
    const json = await rawRpc("eth_getTransactionByHash", ["0x0000000000000000000000000000000000000000000000000000000000000000"]);
    // Either null (tx not found) or an object - both are valid responses
    return json.result === null || typeof json.result === "object";
  });

  await assert("RPC: eth_getTransactionReceipt", async () => {
    const json = await rawRpc("eth_getTransactionReceipt", ["0x0000000000000000000000000000000000000000000000000000000000000000"]);
    return json.result === null || typeof json.result === "object";
  });

  await assert("RPC: eth_getBlockTransactionCountByHash", async () => {
    const block1 = await rpc.getBlock({ blockNumber: 1n });
    if (!block1?.hash) return true;
    const json = await rawRpc("eth_getBlockTransactionCountByHash", [block1.hash]);
    return json.result === "0x0" || typeof json.result === "string";
  });

  await assert("RPC: eth_getTransactionByBlockHashAndIndex", async () => {
    const block1 = await rpc.getBlock({ blockNumber: 1n });
    if (!block1?.hash) return true;
    const json = await rawRpc("eth_getTransactionByBlockHashAndIndex", [block1.hash, "0x0"]);
    return json.result === null || typeof json.result === "object";
  });

  await assert("RPC: eth_getTransactionByBlockNumberAndIndex", async () => {
    const json = await rawRpc("eth_getTransactionByBlockNumberAndIndex", ["0x1", "0x0"]);
    return json.result === null || typeof json.result === "object";
  });

  await assert("RPC: eth_getUncleCountByBlockHash", async () => {
    const block1 = await rpc.getBlock({ blockNumber: 1n });
    if (!block1?.hash) return true;
    const json = await rawRpc("eth_getUncleCountByBlockHash", [block1.hash]);
    return json.result === "0x0";
  });

  await assert("RPC: eth_getUncleByBlockHashAndIndex", async () => {
    const block1 = await rpc.getBlock({ blockNumber: 1n });
    if (!block1?.hash) return true;
    const json = await rawRpc("eth_getUncleByBlockHashAndIndex", [block1.hash, "0x0"]);
    return json.result === null;
  });
}
