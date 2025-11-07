import { ENV } from "@effectstream/utils/node-env";
import { assert, getEffectstreamEVMPublicClient, wallets } from "@e2e/engine";

export async function RPCTest() {
  // Test RPC
  const rpcClient = getEffectstreamEVMPublicClient();

  await assert("RPC Block Number", async () => {
    const blockNumber = await rpcClient.getBlockNumber();
    return typeof blockNumber === "bigint" && blockNumber > 0n;
  });

  await assert("RPC Get Block", async () => {
    const block = await rpcClient.getBlock({
      blockNumber: 1n,
    });
    return block !== null && typeof block === "object";
  });

  await assert("RPC Get Transaction", async () => {
    const transaction = await rpcClient.getTransaction({
      hash:
        "0x323d02ede660d8b453f5a70732acfc32d60fafe862772ec71a9b3c3c5e325cd2",
    });
    return transaction !== null && typeof transaction === "object";
  });

  await assert("RPC Get Transaction Receipt", async () => {
    const transactionReceipt = await rpcClient.getTransactionReceipt({
      hash:
        "0x323d02ede660d8b453f5a70732acfc32d60fafe862772ec71a9b3c3c5e325cd2",
    });
    return transactionReceipt !== null &&
      typeof transactionReceipt === "object";
  });

  await assert("RPC Get Transaction Count", async () => {
    const transactionCount = await rpcClient.getTransactionCount({
      address: wallets[0].address,
    });
    return typeof transactionCount === "number" ||
      typeof transactionCount === "bigint";
  });

  // Test additional RPC methods
  await assert("RPC Get Balance", async () => {
    const balance = await rpcClient.getBalance({
      address: wallets[0].address,
    });
    return typeof balance === "bigint";
  });

  await assert("RPC Estimate Gas", async () => {
    const gasEstimate = await rpcClient.estimateGas({
      to: wallets[1].address,
      value: 1000n,
    });
    return typeof gasEstimate === "bigint" && gasEstimate === 0n;
  });

  await assert("RPC Get Block by Hash", async () => {
    // First get a block to get its hash
    const latestBlock = await rpcClient.getBlock({ blockNumber: 1n });
    if (latestBlock?.hash) {
      const block = await rpcClient.getBlock({ blockHash: latestBlock.hash });
      return block !== null && typeof block === "object";
    }
    return true; // Skip if no hash available
  });

  await assert("RPC Get Logs", async () => {
    const logs = await rpcClient.getLogs({
      fromBlock: 1n,
      toBlock: "latest",
    });
    return Array.isArray(logs);
  });

  await assert("RPC Get Chain ID", async () => {
    const chainId = await rpcClient.getChainId();
    return typeof chainId === "number" && chainId > 0;
  });

  await assert("RPC Get Gas Price", async () => {
    const gasPrice = await rpcClient.getGasPrice();
    return typeof gasPrice === "bigint" && gasPrice === 0n;
  });

  await assert("RPC Get Block Transaction Count by Hash", async () => {
    const latestBlock = await rpcClient.getBlock({ blockNumber: 1n });
    if (latestBlock?.hash) {
      const count = await rpcClient.getBlockTransactionCount({
        blockHash: latestBlock.hash,
      });
      return typeof count === "number" && count === 0;
    }
    return true; // Skip if no hash available
  });

  await assert("RPC Get Block Transaction Count by Number", async () => {
    const count = await rpcClient.getBlockTransactionCount({
      blockNumber: 1n,
    });
    return typeof count === "number" && count === 0;
  });

  await assert("RPC Get Transaction by Block Hash and Index", async () => {
    const latestBlock = await rpcClient.getBlock({ blockNumber: 1n });
    if (latestBlock?.hash) {
      const transaction = await rpcClient.request({
        method: "eth_getTransactionByBlockHashAndIndex",
        params: [latestBlock.hash, "0x0"],
      });
      return transaction !== null && typeof transaction === "object";
    }
    return true; // Skip if no hash available
  });

  await assert("RPC Get Transaction by Block Number and Index", async () => {
    const transaction = await rpcClient.request({
      method: "eth_getTransactionByBlockNumberAndIndex",
      params: ["0x1", "0x0"],
    });
    return transaction !== null && typeof transaction === "object";
  });

  // Test web3 methods using request directly
  await assert("RPC Web3 Client Version", async () => {
    const version = await rpcClient.request({
      method: "web3_clientVersion",
    });
    return typeof version === "string" && version.includes("PaimaEngine");
  });

  await assert("RPC Web3 SHA3", async () => {
    const hash = await rpcClient.request({
      method: "web3_sha3",
      params: ["0x68656c6c6f20776f726c64"], // "hello world" in hex
    });
    return typeof hash === "string" && hash.startsWith("0x") &&
      hash.length === 66;
  });

  await assert("RPC Net Version", async () => {
    const version = await rpcClient.request({
      method: "net_version",
    });
    return typeof version === "string";
  });

  await assert("RPC Net Listening", async () => {
    const listening = await rpcClient.request({
      method: "net_listening",
    });
    return typeof listening === "boolean" && listening === true;
  });

  await assert("RPC Net Peer Count", async () => {
    const peerCount = await rpcClient.request({
      method: "net_peerCount",
    });
    return typeof peerCount === "string" && peerCount === "0x0";
  });

  await assert("RPC Eth Syncing", async () => {
    // Use a more direct approach since eth_syncing might not be in the viem type
    try {
      const syncing = await fetch(
        `http://localhost:${ENV.EFFECTSTREAM_API_PORT}/rpc/evm`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "eth_syncing",
            params: [],
            id: 1,
          }),
        },
      ).then((res) => res.json());
      return syncing.result !== null && typeof syncing.result === "object";
    } catch (error) {
      return false;
    }
  });

  // Test uncle-related methods (should return 0x0 or null since Paima has no uncles)
  await assert("RPC Get Uncle Count by Block Hash", async () => {
    const latestBlock = await rpcClient.getBlock({ blockNumber: 1n });
    if (latestBlock?.hash) {
      const count = await rpcClient.request({
        method: "eth_getUncleCountByBlockHash",
        params: [latestBlock.hash],
      });
      return count === "0x0";
    }
    return true; // Skip if no hash available
  });

  await assert("RPC Get Uncle Count by Block Number", async () => {
    const count = await rpcClient.request({
      method: "eth_getUncleCountByBlockNumber",
      params: ["0x1"],
    });
    return count === "0x0";
  });

  await assert("RPC Get Uncle by Block Hash and Index", async () => {
    const latestBlock = await rpcClient.getBlock({ blockNumber: 1n });
    if (latestBlock?.hash) {
      const uncle = await rpcClient.request({
        method: "eth_getUncleByBlockHashAndIndex",
        params: [latestBlock.hash, "0x0"],
      });
      return uncle === null;
    }
    return true; // Skip if no hash available
  });

  await assert("RPC Get Uncle by Block Number and Index", async () => {
    const uncle = await rpcClient.request({
      method: "eth_getUncleByBlockNumberAndIndex",
      params: ["0x1", "0x0"],
    });
    return uncle === null;
  });
}
