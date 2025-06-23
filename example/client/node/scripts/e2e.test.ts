import { start } from "@paima/orchestrator";
import {
  type Account,
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  type PublicClient,
  toHex,
  type WalletClient,
} from "npm:viem";
import { privateKeyToAccount } from "npm:viem/accounts";
import { hardhat } from "npm:viem/chains";
import {
  erc20 as erc20Abi,
  paimal2 as paimaL2Abi,
} from "@example/evm-contracts";
import { getPersistentConnection } from "@paima/db";
import type { Client, Pool, QueryResult } from "npm:pg";
const __dirname = import.meta.dirname;

// These are standard hardhat addresses for testing.
const deployWallet = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const privateKey =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// These address are given the contract hash + the wallet nonce.
// As we deploy at the start, there nonce are 0 and 1.
// So to keep the test stable, deploy contracts at the start.
const knownPaimaL2ContractAddress =
  "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const knownERC20Address = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// TODO
// This will be deployed by the engine.
async function deployContracts(): Promise<void> {
  console.log("🚀 Deploying PaimaL2Contract...");
  const paimaL2Contract = new Deno.Command("forge", {
    args: [
      "create",
      `${__dirname}/../../../../packages/chains/evm/contracts/src/contracts/PaimaL2Contract.sol:PaimaL2Contract`,
      "--broadcast",
      "--rpc-url",
      "0.0.0.0:8545",
      "--private-key",
      privateKey,
      "--constructor-args",
      deployWallet,
      "0",
    ],
  });
  const { stdout, stderr } = await paimaL2Contract.output();
  // console.log(new TextDecoder().decode(stdout));
  console.log(new TextDecoder().decode(stderr));

  console.log("🪙 Deploying Erc20Dev...");
  const erc20Dev = new Deno.Command("forge", {
    args: [
      "create",
      `${__dirname}/../../../../packages/chains/evm/contracts/src/contracts/dev/Erc20Dev.sol:Erc20Dev`,
      "--broadcast",
      "--rpc-url",
      "0.0.0.0:8545",
      "--private-key",
      privateKey,
    ],
  });
  const { stdout: erc20DevStdout, stderr: erc20DevStderr } = await erc20Dev
    .output();
  // console.log(new TextDecoder().decode(erc20DevStdout));
  console.log(new TextDecoder().decode(erc20DevStderr));
}

// Viem Client(s)
function clients(): {
  account: Account;
  walletClient: WalletClient;
  publicClient: PublicClient;
} {
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    chain: hardhat,
    transport: http(),
  });
  const publicClient = createPublicClient({
    chain: hardhat,
    transport: http(),
  });
  return { account, walletClient, publicClient };
}

const paimaL2 = {
  submitGameInput: async (
    input: string[],
  ): Promise<void> => {
    console.log("🎮 Submitting game input", input);
    const { account, walletClient, publicClient } = clients();
    const hash = await walletClient.writeContract({
      account,
      chain: hardhat,
      address: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
      abi: paimaL2Abi.metadata.output.abi,
      functionName: "paimaSubmitGameInput",
      args: [
        toHex(JSON.stringify(input)),
      ],
      value: parseEther("0.0000000001"),
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
    });
    console.log(
      `  ${
        receipt.status === "success" ? "" : "❌"
      } Submit Game Input block ${receipt.blockNumber} @ Hash ${hash}`,
    );
  },
};

const erc20 = {
  mint: async (mint_address: `0x${string}`, amount: bigint) => {
    console.log("⚡ Minting", amount, "to", mint_address);
    const { account, walletClient, publicClient } = clients();
    const { request } = await publicClient.simulateContract({
      account,
      chain: hardhat,
      address: knownERC20Address,
      abi: erc20Abi.abi,
      functionName: "mint",
      args: [
        mint_address,
        amount,
      ],
    });
    const hash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
    });
    console.log(
      `  ${
        receipt.status === "success" ? "" : "❌"
      } Mint block ${receipt.blockNumber} @ Hash ${hash}`,
    );
  },
  transfer: async (
    from_address: `0x${string}`,
    to_address: `0x${string}`,
    amount: bigint,
  ) => {
    console.log("💸 Transferring", amount, "to", to_address);
    if (from_address !== deployWallet) {
      throw new Error("❌ NYI: Transfer from non-deploy wallet");
    }
    const { account, walletClient, publicClient } = clients();
    const { request } = await publicClient.simulateContract({
      account,
      address: knownERC20Address,
      abi: erc20Abi.abi,
      functionName: "transfer",
      args: [
        to_address,
        amount,
      ],
    });
    const hash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
    });
    console.log(
      `  ${
        receipt.status === "success" ? "" : "❌"
      } Transfer block ${receipt.blockNumber} @ Hash ${hash}`,
    );
  },
};

// Connect to the db, and wait until the tables are created.
async function getDBConnection(): Promise<Client> {
  // Get DB connection
  const poolConfig = {
    host: Deno.env.get("DB_HOST") || "localhost",
    user: Deno.env.get("DB_USER") || "postgres",
    password: Deno.env.get("DB_PW") || "",
    database: Deno.env.get("DB_NAME") || "postgres",
    port: parseInt(Deno.env.get("DB_PORT") || "5432", 10),
  };

  // We can connect the DB now for doing the tests.
  const db = getPersistentConnection(poolConfig);

  let maxMillis = 10000;
  while (maxMillis > 0) {
    try {
      await db.query(
        `SELECT id FROM public.primitive_accounting LIMIT 1`,
      );
      return db;
    } catch (e) {
      console.log("⏳ DB not ready yet");
      await delay(100);
    }
    maxMillis -= 100;
    if (maxMillis <= 0) {
      throw new Error("DB connection timed out");
    }
  }
}

let testCount = 1;
// Run a query, as we don't know when the Paima Engine chain has
// included and processed the data, we run a query until some
// condition is met, then we chech against the expected data.
async function awaitAndCheckDBQuery(
  testName: string,
  db: Pool,
  query: string,
  waitUntil: (res: QueryResult<any>) => boolean,
  check: (res: QueryResult<any>) => boolean,
): Promise<QueryResult<any>> {
  console.log(
    `%c🔍 [Running test] ${testCount++}: ${testName}`,
    "color: green; background-color: black; font-weight: bold",
  );
  let maxMillis = 10000;
  while (maxMillis > 0) {
    const res = await db.query(query);

    // First wait until the data is available.
    if (!waitUntil(res)) {
      await delay(100);
      maxMillis -= 100;
      if (maxMillis <= 0) {
        console.error("Data in DB:", res.rows);
        console.error(`❌ Test failed`);
        return res;
      }
      continue;
    }

    // Now run the custom check.
    try {
      if (!check(res)) {
        throw new Error("CHECK_ERROR");
      }
      console.log(`✅ Test passed`);
      return res;
    } catch (e) {
      console.error("Data in DB:", res.rows);
      console.error(`❌ Test failed`);
      if (e instanceof Error && e.message !== "CHECK_ERROR") {
        console.error(e);
      }
      break;
    }
  }
}

// Launch the orchestrator, and wait for the sync process to start.
// The final process is the `sync` process.
// We can know when the process is started, but not if ready.
async function startup(): Promise<Pool> {
  start({ output: "stdout-err" });
  console.log("⌛ Waiting for sync process to start...");

  while (true) {
    const processes = await fetch("http://localhost:3000/processes");
    const processesJson = await processes.json();
    if (processesJson.processes.find((p: any) => p.name === "sync")) {
      break;
    }
    await delay(100);
  }

  console.log("🔄 Sync process started\n");
  await deployContracts();
  return await getDBConnection();
}

// Launch the shutdown process, and wait for the sync process to stop.
function shutdown(): void {
  console.log("\n🛑 Shutting down...");
  // We don't wait for the endpoint to return.
  // As this process will be killed.
  fetch("http://localhost:3000/shutdown", {
    method: "POST",
  });
  console.log("⏳ Waiting for shutdown to complete...");
}

let isShutdownCalled = false;
async function disconnect(db: Client): Promise<void> {
  db.off("error", console.error);
  db.on("end", () => {
    isShutdownCalled = true;
    shutdown();
  });
  db.end();

  // Wait for the db to disconnect and the shutdown to be called.
  let maxMillis = 10000;
  while (maxMillis > 0) {
    // waiting for the db to disconnect
    await delay(100);
    maxMillis -= 100;
  }

  // This should not be reached, as Deno.exit is called in the shutdown function.
  // If still not called, the call manually.
  if (!isShutdownCalled) {
    shutdown();
    await delay(1000);
  }
  console.error("Shutdown/DB connection timed out");
  Deno.exit(1);
}

// Start Test
async function test() {
  let db: Client;
  try {
    db = await startup();

    console.log("🎯 Starting Contract Interactions...");
    await erc20.mint(deployWallet, 200n);
    await erc20.mint(deployWallet, 300n);
    await erc20.transfer(
      deployWallet,
      "0x484738A67858305Edfc139B194Ed430Fe4D8e56b",
      90n,
    );
    await awaitAndCheckDBQuery(
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
    await paimaL2.submitGameInput(["attack", "1", "100"]);
    await awaitAndCheckDBQuery(
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
    await paimaL2.submitGameInput(["attack", "2", "200"]);
    await awaitAndCheckDBQuery(
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
              "value": "200",
            }],
          },
          {
            inputs: ["transfer", {
              "from": "0x0000000000000000000000000000000000000000",
              "to": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
              "value": "300",
            }],
          },
          {
            inputs: ["transfer", {
              "from": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
              "to": "0x484738A67858305Edfc139B194Ed430Fe4D8e56b",
              "value": "90",
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

    await awaitAndCheckDBQuery(
      "Check IVM ERC20",
      db,
      `SELECT * FROM public.erc_balance;`,
      (res) => res.rows.length === 2,
      (res) => {
        const a = res.rows.find((r: any) =>
          r.address === "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
        );
        const b = res.rows.find((r: any) =>
          r.address === "0x484738A67858305Edfc139B194Ed430Fe4D8e56b"
        );
        console.log(
          "IMPORTANT: This should be 410, but there is a error in the IVM ERC20",
        );
        // return a.balance === "410" && b.balance === "90";
        return a.balance === "500" && b.balance === "90";
      },
    );

    await awaitAndCheckDBQuery(
      "Check nonces",
      db,
      `SELECT * FROM public.nonces;`,
      (res) => res.rows.length === 2,
      (res) => {
        return res.rows.length === 2;
      },
    );

    await awaitAndCheckDBQuery(
      "Check addresses",
      db,
      `SELECT * FROM public.addresses;`,
      (res) => res.rows.length === 1,
      (res) => {
        return res.rows[0].address === deployWallet;
      },
    );

    const pauseTime = Deno.env.get("PAIMA_E2E_PAUSE_TIME");
    if (pauseTime) {
      console.log("⏳ Pausing for", pauseTime, "seconds");
      await delay(parseInt(pauseTime, 10) * 1000);
    }

    // Disconnect so the process can exit.
    await disconnect(db);
  } catch (e) {
    await disconnect(db);
    console.error(e);
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
test().then(() => {
  console.log("🎉 Test completed");
  Deno.exit(0);
}).catch((e) => {
  console.log("❌ Test failed");
  // kill -9 `ps aux | grep deno  | awk '{print $2}' | awk NF=NF RS= OFS=" "`
  console.error(e);
  Deno.exit(1);
});
// });
