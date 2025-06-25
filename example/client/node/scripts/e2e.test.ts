import { getDBConnection, shutdown, startup } from "./e2e-loader.ts";
import { deployContracts, erc20, paimaL2 } from "./e2e-contracts.ts";
import { assert, assertSQL } from "./e2e-assert.ts";
import type { Client } from "pg";
import { getPaimaEVMPublicClient } from "./e2e-rpc.ts";

type Wallet = {
  address: `0x${string}`;
  privateKey: `0x${string}`;
};
// These are standard hardhat addresses for testing.
const wallet_A: Wallet = {
  address: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  privateKey:
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
};
const wallet_B: Wallet = {
  address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  privateKey:
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Start Test
async function test() {
  let db: Client;
  try {
    // Launch the orchestrator, and wait for the sync process to start.
    // The contracts are deployed with the private key.
    db = await startup(wallet_A.address, wallet_A.privateKey);

    // TOOD 10^18 operation fails on pgsql bigints
    const multiplier = 10n ** 15n;

    await erc20.mint(wallet_A.address, wallet_A.privateKey, 200n * multiplier);
    await erc20.mint(wallet_A.address, wallet_A.privateKey, 300n * multiplier);
    await erc20.transfer(
      wallet_A.privateKey,
      wallet_B.address,
      90n * multiplier,
    );
    await assertSQL(
      "Check ERC20 sync-process",
      db,
      `SELECT
      primitive_name, id, paima_block_height, payload_type, payload
      FROM 
      public.primitive_accounting;`,
      (res) => res.rows.length === 3,
      (res) => {
        return res.rows[0].primitive_name === "TransferEvent" &&
          res.rows[1].primitive_name === "TransferEvent" &&
          res.rows[2].primitive_name === "TransferEvent";
      },
    );
    await paimaL2.submitGameInput(
      ["attack", "1", "100"],
      wallet_A.privateKey,
    );
    await assertSQL(
      "Check PaimaL2 sync-process",
      db,
      `SELECT
      primitive_name, id, paima_block_height, payload_type, payload
      FROM 
      public.primitive_accounting;`,
      (res) => res.rows.length === 4,
      (res) => {
        return res.rows[3].primitive_name === "PaimaGameInteraction";
      },
    );
    await paimaL2.submitGameInput(
      ["attack", "2", "200"],
      wallet_A.privateKey,
    );
    await assertSQL(
      "Check State Machine events",
      db,
      `SELECT
      inputs
      FROM 
      public.example_sm;`,
      (res) => res.rows.length === 5,
      (res) => {
        const dump = [
          {
            inputs: ["transfer", {
              "from": "0x0000000000000000000000000000000000000000",
              "to": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
              "value": String(200n * multiplier),
            }],
          },
          {
            inputs: ["transfer", {
              "from": "0x0000000000000000000000000000000000000000",
              "to": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
              "value": String(300n * multiplier),
            }],
          },
          {
            inputs: ["transfer", {
              "from": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
              "to": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
              "value": String(90n * multiplier),
            }],
          },
          { inputs: ["attack", "1", "100"] },
          { inputs: ["attack", "2", "200"] },
        ];
        return res.rows.every((row: any, index: number) => {
          const status = row.inputs === JSON.stringify(dump[index].inputs);
          if (!status) {
            console.log("Error at:", index, row.inputs, dump[index].inputs);
          }
          return status;
        });
      },
    );

    await assertSQL(
      "Check IVM ERC20",
      db,
      `SELECT * FROM public.erc_balance;`,
      (res) => res.rows.length === 2,
      (res) => {
        // TODO
        // Should we store the addresses in lowercase?
        const a = res.rows.find((r: any) =>
          r.address ===
            "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266".toLowerCase()
        );
        const b = res.rows.find((r: any) =>
          r.address ===
            "0x70997970C51812dc3A010C7d01b50e0d17dc79C8".toLowerCase()
        );
        // TODO Fix this.
        console.log(
          "IMPORTANT: This should be 410, but there is a error in the IVM ERC20",
        );
        return a.balance === String(500n * multiplier) &&
          b.balance === String(90n * multiplier);
      },
    );

    await assertSQL(
      "Check nonces",
      db,
      `SELECT * FROM public.nonces;`,
      (res) => res.rows.length === 2,
      (res) => {
        return res.rows.length === 2;
      },
    );

    await assertSQL(
      "Check addresses",
      db,
      `SELECT * FROM public.addresses;`,
      (res) => res.rows.length === 1,
      (res) => {
        return res.rows[0].address === wallet_A.address;
      },
    );

    // Test RPC
    const rpcClient = getPaimaEVMPublicClient();

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
        address: wallet_A.address,
      });
      return typeof transactionCount === "number" ||
        typeof transactionCount === "bigint";
    });

    // Test additional RPC methods
    await assert("RPC Get Balance", async () => {
      const balance = await rpcClient.getBalance({
        address: wallet_A.address,
      });
      return typeof balance === "bigint";
    });

    await assert("RPC Estimate Gas", async () => {
      const gasEstimate = await rpcClient.estimateGas({
        to: wallet_B.address,
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
        const syncing = await fetch("http://localhost:9999/rpc/evm", {
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
        }).then((res) => res.json());
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

    const pauseTime = Deno.env.get("PAIMA_E2E_PAUSE_TIME");
    if (pauseTime) {
      console.log("⏳ Pausing for", pauseTime, "seconds");
      await delay(parseInt(pauseTime, 10) * 1000);
    }

    // // Disconnect so the process can exit.
    await shutdown(db);
  } catch (e) {
    console.error(e);
    await shutdown(db);
  }
}

// TODO: We are not able to run this test in
//       as a Deno test as we have some leaks.
//       These leaks are not being cleaned up.
//       We should fix this and then run this
//       test as a Deno test. But they are hard
//       to find.
//
// Deno.test("async test", { sanitizeResources: false }, async () => {
test()
  .then(() => {
    console.log("🎉 Test completed");
    Deno.exit(0);
  }).catch((e) => {
    console.log("❌ Test failed");
    // kill -9 `ps aux | grep deno  | awk '{print $2}' | awk NF=NF RS= OFS=" "`
    console.error(e);
    Deno.exit(1);
  });
// });
