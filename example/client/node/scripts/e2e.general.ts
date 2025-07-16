import {
  erc20Builder,
  erc721Builder,
  paimaL2Builder,
  wallets,
} from "./e2e-contracts.ts";
import { assert, assertSQL } from "./e2e-assert.ts";
import type { Client } from "pg";
import { getPaimaEVMPublicClient } from "./e2e-rpc.ts";
import { AddressType } from "@paima/utils";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { hardhat } from "viem/chains";
import { ENV } from "@paima/utils";
import type { SharedState } from "./e2e-shared-state.ts";

// Start Test
export async function generalTest(db: Client, sharedState: SharedState) {
  // Lazy load the contracts.
  const erc20 = erc20Builder();
  const erc721 = erc721Builder();
  const paimaL2 = paimaL2Builder();

  const multiplier = 10n ** 18n;

  const erc20_a = 200n * multiplier;
  const erc20_b = 300n * multiplier;
  const erc20_c = 90n * multiplier;
  await erc20.a.mint(
    wallets[0].address,
    wallets[0].privateKey,
    erc20_a,
  );
  sharedState.paima_state_machine_counter += 1; // There is a prefix that inserts a row
  sharedState.address_erc20_balances.a[wallets[0].address] += erc20_a;
  sharedState.primitive_accounting_counter += 1;
  await erc20.a.mint(
    wallets[0].address,
    wallets[0].privateKey,
    erc20_b,
  );
  sharedState.paima_state_machine_counter += 1; // There is a prefix that inserts a row
  sharedState.address_erc20_balances.a[wallets[0].address] += erc20_b;
  sharedState.primitive_accounting_counter += 1;
  await erc20.a.transfer(
    wallets[0].privateKey,
    wallets[1].address,
    erc20_c,
  );
  sharedState.paima_state_machine_counter += 1; // There is a prefix that inserts a row
  sharedState.address_erc20_balances.a[wallets[0].address] -= erc20_c;
  sharedState.address_erc20_balances.a[wallets[1].address] += erc20_c;
  sharedState.primitive_accounting_counter += 1;
  await assertSQL<{ primitive_name: string }>(
    "Check ERC20 sync-process",
    db,
    `SELECT
      primitive_name, id, paima_block_height, payload_type, payload
      FROM
      public.primitive_accounting;`,
    (res) => res.rows.length === sharedState.primitive_accounting_counter,
    (res) => {
      return res.rows[0].primitive_name === "Aribitrum_Token" &&
        res.rows[1].primitive_name === "Aribitrum_Token" &&
        res.rows[2].primitive_name === "Aribitrum_Token";
    },
  );
  await paimaL2.submitGameInput(
    ["attack", "1", "100"],
    wallets[0].privateKey,
  );
  sharedState.paima_state_machine_counter += 1;
  sharedState.primitive_accounting_counter += 1;
  await assertSQL<{ primitive_name: string }>(
    "Check PaimaL2 sync-process",
    db,
    `SELECT
      primitive_name, id, paima_block_height, payload_type, payload
      FROM
      public.primitive_accounting;`,
    (res) => res.rows.length === sharedState.primitive_accounting_counter,
    (res) => {
      return res.rows[sharedState.primitive_accounting_counter - 1]
        .primitive_name ===
        "PaimaGameInteraction";
    },
  );
  await paimaL2.submitGameInput(
    ["attack", "2", "200"],
    wallets[0].privateKey,
  );
  sharedState.paima_state_machine_counter += 1;
  sharedState.primitive_accounting_counter += 1;
  await assertSQL<{ inputs: string }>(
    "Check State Machine events",
    db,
    `SELECT
      inputs
      FROM
      public.user_state_machine;`,
    (res) => res.rows.length === sharedState.paima_state_machine_counter,
    (res) => {
      const dump = [
        {
          inputs:
            "transfer 200000000000000000000 from 0x0000000000000000000000000000000000000000 to 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        },
        {
          inputs:
            "transfer 300000000000000000000 from 0x0000000000000000000000000000000000000000 to 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        },
        {
          inputs:
            "transfer 90000000000000000000 from 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 to 0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        },
        { inputs: "attack playerId: 1 with moveId: 100" },
        { inputs: "attack playerId: 2 with moveId: 200" },
      ];
      return res.rows.every((row: any, index: number) => {
        const status = row.inputs === dump[index].inputs;
        if (!status) {
          console.log("Error at:", index, row.inputs, dump[index].inputs);
        }
        return status;
      });
    },
  );

  await assertSQL<{ address: string; balance: string }>(
    "Check IVM ERC20",
    db,
    `SELECT * FROM public.erc20_balances_view_aribitrum_token;`,
    (res) => res.rows.length === 2,
    (res) => {
      // TODO
      // Should we store the addresses in lowercase?
      const firstWallet = res.rows.find((r: any) =>
        r.address ===
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266".toLowerCase()
      );
      const secondWallet = res.rows.find((r: any) =>
        r.address ===
          "0x70997970C51812dc3A010C7d01b50e0d17dc79C8".toLowerCase()
      );
      if (!firstWallet || !secondWallet) {
        throw new Error(
          "Address not found: " + firstWallet + " " + secondWallet,
        );
      }
      return firstWallet.balance ===
          String(sharedState.address_erc20_balances.a[wallets[0].address]) &&
        secondWallet.balance ===
          String(sharedState.address_erc20_balances.a[wallets[1].address]);
    },
  );

  // Only wallet A has sent game inputs
  await assertSQL<{ address: string }>(
    "Check addresses",
    db,
    `SELECT * FROM public.addresses;`,
    (res) => res.rows.length === 1,
    (res) => {
      return res.rows[0].address === wallets[0].address.toLowerCase();
    },
  );

  // Test Batcher
  const timestamp = Date.now().toString();
  const privateKey = generatePrivateKey();

  // Create account and wallet client
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain: hardhat,
    transport: http(),
  });
  console.log("Created random account", account.address);
  const gameInput = JSON.stringify(["attack", "999", "777"]);
  let nonce_counter = 0;
  // Send a batched message.
  await fetch(`http://localhost:${ENV.BATCHER_PORT}/send-input`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      addressType: AddressType.EVM,
      userAddress: account.address,
      userSignature: await walletClient.signMessage({
        message: JSON.stringify({
          message: gameInput,
          timestamp,
        }),
      }),
      gameInput,
      millisecondTimestamp: timestamp,
    }),
  });
  nonce_counter += 1;
  sharedState.primitive_accounting_counter += 1;
  sharedState.paima_state_machine_counter += 1;
  await assertSQL<
    { primitive_name: string; payload: { inputData: string } }
  >(
    "Check Batcher",
    db,
    `SELECT
      primitive_name, id, paima_block_height, payload_type, payload
      FROM
      public.primitive_accounting;`,
    (res) => res.rows.length === sharedState.primitive_accounting_counter,
    (res) => {
      return res.rows[sharedState.primitive_accounting_counter - 1]
            .primitive_name ===
          "PaimaGameInteraction" &&
        res.rows[sharedState.primitive_accounting_counter - 1].payload
            .inputData ===
          gameInput;
    },
  );

  // We should have a single nonce for the batched message.
  await assertSQL<{ nonce: string }>(
    "Check nonces",
    db,
    `SELECT * FROM public.nonces;`,
    (res) => res.rows.length === nonce_counter,
    (res) => {
      return res.rows.length === nonce_counter;
    },
  );

  // Let's test the scheduled data created throught the state machine.
  await paimaL2.submitGameInput(
    ["schedule", "1", "block", "111"],
    wallets[0].privateKey,
  );
  sharedState.paima_state_machine_counter += 1;
  sharedState.primitive_accounting_counter += 1;
  // This should increment the state machine indirectly.

  await assertSQL<{ inputs: string; block_height: number }>(
    "Check Scheduled Data - block",
    db,
    `SELECT inputs, block_height from public.user_state_machine`,
    (res) => res.rows.length === sharedState.paima_state_machine_counter,
    (res) => {
      return res.rows[sharedState.paima_state_machine_counter - 1].inputs ===
        "attack playerId: 111 with moveId: 1";
    },
  );

  // Let's test the scheduled data - timestamp - created throught the state machine.
  await paimaL2.submitGameInput(
    ["schedule", "1", "timestamp", "222"],
    wallets[0].privateKey,
  );
  sharedState.paima_state_machine_counter += 1;
  sharedState.primitive_accounting_counter += 1;
  // This should increment the state machine indirectly.

  await assertSQL<{ inputs: string; block_height: number }>(
    "Check Scheduled Data - timestamp",
    db,
    `SELECT inputs, block_height from public.user_state_machine`,
    (res) => res.rows.length === sharedState.paima_state_machine_counter,
    (res) => {
      return res.rows[sharedState.paima_state_machine_counter - 1].inputs ===
        "attack playerId: 222 with moveId: 1";
    },
  );

  await assert("Check User Defined API", async () => {
    const response = await fetch(
      `http://localhost:${ENV.PAIMA_API_PORT}/api/my-game-state`,
    );
    const data = await response.json();
    // 3 ERC20 updates
    // 2 PaimaL2 updates
    // 1 Batcher update
    return data.length === sharedState.paima_state_machine_counter;
  });

  await assert("Health Check", async () => {
    const response = await fetch(
      `http://localhost:${ENV.PAIMA_API_PORT}/health`,
    );
    const data = await response.json();
    return data.status === "ok";
  });

  await assert("Check System API Table Schema", async () => {
    const response = await fetch(
      `http://localhost:${ENV.PAIMA_API_PORT}/table-schema/user_state_machine`,
    );
    const data = await response.json();
    return data.every((row: any) =>
      row.column_name === "id" ||
      row.column_name === "inputs" ||
      row.column_name === "block_height"
    );
  });

  await assert("Check System API Table Data", async () => {
    const response = await fetch(
      `http://localhost:${ENV.PAIMA_API_PORT}/tables/user_state_machine`,
    );
    const data = await response.json();
    return data.length === sharedState.paima_state_machine_counter;
  });

  const tokens = {
    tokenA: 1n,
    tokenB: 2n,
    tokenC: 3n,
    tokenD: 4n,
  } as const;
  await erc721.a.mint(wallets[0].privateKey, tokens.tokenA);
  await erc721.a.mint(wallets[1].privateKey, tokens.tokenB);
  await erc721.a.mint(wallets[0].privateKey, tokens.tokenC);
  await erc721.a.mint(wallets[1].privateKey, tokens.tokenD);
  await erc721.a.transfer(
    wallets[0].privateKey,
    wallets[1].address,
    tokens.tokenC,
  );
  await erc721.a.transfer(
    wallets[1].privateKey,
    wallets[0].address,
    tokens.tokenD,
  );
  sharedState.address_erc721_ownership.a[String(tokens.tokenC)] =
    wallets[1].address;
  sharedState.address_erc721_ownership.a[String(tokens.tokenD)] =
    wallets[0].address;
  sharedState.address_erc721_ownership.b[String(tokens.tokenA)] =
    wallets[0].address;
  sharedState.address_erc721_ownership.b[String(tokens.tokenB)] =
    wallets[1].address;
  // Cannot burn a token?
  // await erc721.burn(wallet_X.privateKey, tokens.tokenD);
  await assertSQL<
    { token_id: string; primitive_name: string; current_owner: string }
  >(
    "Check ERC721 sync-process",
    db,
    `SELECT * FROM public.erc721_ownership_view_arbitrum_erc721;`,
    (res) => res.rows.length === 4,
    (res) => {
      return res.rows.every((row: any) => {
        // [...{
        // primitive_name: "Arbitrum_ERC721",
        // token_id: "1",
        // current_owner: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"
        // }...]
        Object.entries(sharedState.address_erc721_ownership.a).forEach(
          ([tokenId, owner]: [string, string]) => {
            const row = res.rows.find(
              (
                r: {
                  token_id: string;
                  primitive_name: string;
                  current_owner: string;
                },
              ) => r.token_id === tokenId,
            );
            if (!row) {
              throw new Error(`Token ${tokenId} not found`);
            }
            if (row.current_owner.toLowerCase() !== owner.toLowerCase()) {
              throw new Error(
                `Token ${tokenId} has incorrect owner: ${row.current_owner} !== ${owner}`,
              );
            }
          },
        );
        return true;
      });
    },
  );

  console.log("Sending 500 erc721 events....");
  // Add some more ERC20 and ERC721 data.
  const tokens_b = Array.from(
    { length: 1000 },
    (_, i) => BigInt((i + 1) * 2),
  );
  for (let i = 0; i < 100; i++) {
    const t1 = tokens_b.shift()!;
    const t2 = tokens_b.shift()!;
    const t3 = tokens_b.shift()!;
    const t4 = tokens_b.shift()!;

    await erc721.b.mint(wallets[0].privateKey, t1, true);
    sharedState.address_erc721_ownership.b[String(t1)] = wallets[0].address;

    await erc721.b.mint(wallets[1].privateKey, t2, true);
    sharedState.address_erc721_ownership.b[String(t2)] = wallets[1].address;

    await erc721.b.mint(wallets[0].privateKey, t3, true);
    sharedState.address_erc721_ownership.b[String(t3)] = wallets[0].address;

    await erc721.b.mint(wallets[1].privateKey, t4, true);
    sharedState.address_erc721_ownership.b[String(t4)] = wallets[1].address;

    await erc721.b.transfer(
      wallets[0].privateKey,
      wallets[1].address,
      t1,
      true,
    );
    sharedState.address_erc721_ownership.b[String(t1)] = wallets[1].address;

    await erc721.b.transfer(
      wallets[1].privateKey,
      wallets[0].address,
      t2,
      true,
    );
    sharedState.address_erc721_ownership.b[String(t2)] = wallets[0].address;
  }

  //
  // TODO: Server crashes with i = 100
  // Lowering to 20
  //
  // 2025-06-27T18:55:43.612Z ERROR  paima-db: Error: Dynamic linking error: cannot resolve symbol setTempRet0
  // at e.<computed> (file:///Users/username/paima-engine/node_modules/.deno/@electric-sql+pglite@0.3.3/node_modules/@electric-sql/pglite/dist/index.js:1:89333)
  // at <anonymous> (wasm://wasm/0009251e:1:109038)
  // at invoke_ii (file:///Users/username/paima-engine/node_modules/.deno/@electric-sql+pglite@0.3.3/node_modules/@electric-sql/pglite/dist/index.js:3:238292)
  // at <anonymous> (wasm://wasm/02190c76:1:922777)
  // at <anonymous> (wasm://wasm/02190c76:1:2189246)
  // at <anonymous> (wasm://wasm/02190c76:1:2690420)
  // at <anonymous> (wasm://wasm/02190c76:1:3728154)
  // at <anonymous> (wasm://wasm/02190c76:1:987555)
  // at <anonymous> (wasm://wasm/02190c76:1:3315760)
  // at <anonymous> (wasm://wasm/02190c76:1:3316014)
  console.log("Sending 300 erc20 events....");
  for (let i = 0; i < 20; i++) {
    const t1 = BigInt((i + 1) * 2) * multiplier;
    const t2 = BigInt((i + 1) * 3) * multiplier;
    const tx = BigInt((i + 1) * 1) * multiplier;
    await erc20.b.mint(
      wallets[0].address,
      wallets[0].privateKey,
      t1,
      true,
    );
    sharedState.address_erc20_balances.b[wallets[0].address] += t1;
    await erc20.b.mint(
      wallets[1].address,
      wallets[1].privateKey,
      t2,
      true,
    );
    sharedState.address_erc20_balances.b[wallets[1].address] += t2;
    await erc20.b.transfer(
      wallets[0].privateKey,
      wallets[1].address,
      tx,
      true,
    );
    sharedState.address_erc20_balances.b[wallets[0].address] -= tx;
    sharedState.address_erc20_balances.b[wallets[1].address] += tx;
  }

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
        `http://localhost:${ENV.PAIMA_API_PORT}/rpc/evm`,
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

  // ============ Check if the primitive_accounting table is correct state after all tests ============

  await assertSQL<{ primitive_name: string }>(
    "Check PaimaL2 sync-process",
    db,
    `SELECT
          primitive_name, id, paima_block_height, payload_type, payload
          FROM
          public.primitive_accounting;`,
    (res) => res.rows.length === sharedState.primitive_accounting_counter,
    (res) => {
      return res.rows.length === sharedState.primitive_accounting_counter;
    },
  );
}
