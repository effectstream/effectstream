import type { Client, PoolConfig } from "pg";
import pg from "pg";
import { OrchestratorConfig, start } from "@paima/orchestrator";
import { ENV } from "@paima/utils";
import { Value } from "@sinclair/typebox/value";
import { ComponentNames } from "@paima/log";
import { contractAddressesEvmMain } from "@e2e/evm-contracts";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Launch the Sync through the orchestrator,
 * and wait for the sync process to start and be ready.
 */
export async function startup(): Promise<Client> {
  const config = Value.Parse(OrchestratorConfig, {
    logs: "stdout-err",
    processes: {
      [ComponentNames.PAIMA_DB]: true,

      [ComponentNames.TUI]: false,
      [ComponentNames.TMUX]: false,
    },

    packageName: "@paima",

    // Launch my processes
    processesToLaunch: [{
      // Start EVM (Hardhat) Chains and deploy contracts.
      stopProcessAtPort: [8545, 8546],
      processes: [
        {
          name: ComponentNames.HARDHAT,
          args: ["task", "-f", "@e2e/evm-contracts", "chain:start"],
          waitToExit: false,
          logs: "otel-compatible",
          type: "system-dependency",
        },
        {
          name: ComponentNames.HARDHAT_WAIT,
          args: ["task", "-f", "@e2e/evm-contracts", "chain:wait"],
        },
        {
          name: ComponentNames.DEPLOY_EVM_CONTRACTS,
          args: ["task", "-f", "@e2e/evm-contracts", "deploy"],
          type: "system-dependency",
        },
      ],
    }, {
      stopProcessAtPort: [8090, 10000, 50051, 3001],
      processes: [
        {
          name: ComponentNames.YACI_DEVKIT,
          args: ["task", "-f", "@e2e/cardano-contracts", "devkit:start"],
          waitToExit: false,
          logs: "otel-compatible",
          type: "system-dependency",
        },
        {
          name: ComponentNames.YACI_DEVKIT_WAIT,
          args: ["task", "-f", "@e2e/cardano-contracts", "devkit:wait"],
        },
        {
          name: ComponentNames.DOLOS,
          args: ["task", "-f", "@e2e/cardano-contracts", "dolos:start"],
          waitToExit: false,
          type: "system-dependency",
        },
        {
          name: ComponentNames.DOLOS_WAIT,
          args: ["task", "-f", "@e2e/cardano-contracts", "dolos:wait"],
        },
      ],
    }, {
      stopProcessAtPort: [9944, 8088, 6300],
      processes: [
        {
          name: ComponentNames.MIDNIGHT_NODE,
          args: [
            "task",
            "-f",
            "@e2e/midnight-contracts",
            "midnight-node:start",
          ],
          logs: "none",
          waitToExit: false,
          type: "system-dependency",
        },
        {
          name: ComponentNames.MIDNIGHT_INDEXER,
          args: [
            "task",
            "-f",
            "@e2e/midnight-contracts",
            "midnight-indexer:start",
          ],
          waitToExit: false,
          type: "system-dependency",
        },
        {
          name: ComponentNames.MIDNIGHT_PROOF_SERVER,
          args: [
            "task",
            "-f",
            "@e2e/midnight-contracts",
            "midnight-proof-server:start",
          ],
          waitToExit: false,
          type: "system-dependency",
        },
        {
          name: ComponentNames.MIDNIGHT_NODE_WAIT,
          args: [
            "task",
            "-f",
            "@e2e/midnight-contracts",
            "midnight-node:wait",
          ],
        },
        {
          name: ComponentNames.MIDNIGHT_INDEXER_WAIT,
          args: [
            "task",
            "-f",
            "@e2e/midnight-contracts",
            "midnight-indexer:wait",
          ],
        },
        {
          name: ComponentNames.MIDNIGHT_PROOF_SERVER_WAIT,
          args: [
            "task",
            "-f",
            "@e2e/midnight-contracts",
            "midnight-proof-server:wait",
          ],
        },
        {
          name: ComponentNames.MIDNIGHT_CONTRACT,
          args: [
            "task",
            "-f",
            "@e2e/midnight-contracts",
            "midnight-contract:deploy",
          ],
        },
      ],
    } // // Uncomment to enable Avail Process
      // // Note: Check ports as 9944 is used by Midnight Node by default in the lace wallet
      //  {
      //   stopProcessAtPort: [9944, 7007],
      //   processes: [
      //     {
      //       name: ComponentNames.AVAIL_NODE,
      //       args: ["task", "-f", "@e2e/avail-contracts", "avail-node:start"],
      //       waitToExit: false,
      //       logs: "none",
      //       type: "system-dependency",
      //     },
      //     {
      //       name: ComponentNames.AVAIL_CLIENT,
      //       args: [
      //         "task",
      //         "-f",
      //         "@e2e/avail-contracts",
      //         "avail-light-client:start",
      //       ],
      //       waitToExit: false,
      //       type: "system-dependency",
      //     },
      //     {
      //       name: ComponentNames.AVAIL_NODE_WAIT,
      //       args: ["task", "-f", "@e2e/avail-contracts", "avail-node:wait"],
      //     },
      //     {
      //       name: ComponentNames.AVAIL_CLIENT_WAIT,
      //       args: [
      //         "task",
      //         "-f",
      //         "@e2e/avail-contracts",
      //         "avail-light-client:wait",
      //       ],
      //     },
      //   ],
      // }
    ],

    batcher: {
      paimaL2Address: contractAddressesEvmMain()["chain31337"][
        "PaimaL2ContractModule#MyPaimaL2Contract"
      ],
      batcherPrivateKey:
        "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
      chainName: "hardhat",
    },
  });
  start(config);
  console.log("⌛ Waiting for sync process to start...");
  while (true) {
    try {
      const processes = await fetch(
        `http://localhost:${ENV.ORCHESTRATOR_PORT}/processes`,
      );
      const processesJson = await processes.json();
      if (processesJson.processes.find((p: any) => p.name === "sync")) {
        await fetch(`http://localhost:${ENV.PAIMA_API_PORT}/health`);
        break;
      }
      await delay(100);
    } catch (e) {
      await delay(100);
    }
  }

  console.log("🔄 Sync process started\n");
  return await getDBConnection();
}

/**
 * Cleanup for shutdown.
 * @param db - The database connection.
 */
export async function cleanup(db: Client): Promise<void> {
  await db.end();
}

/**
 * Launch the shutdown process, and wait for the sync process to stop.
 */
export function shutdown(): void {
  console.log("\n🛑 Shutting down...");
  // We don't wait for the endpoint to return.
  // As this process will be killed.
  fetch(`http://localhost:${ENV.ORCHESTRATOR_PORT}/shutdown`, {
    method: "POST",
  });
  console.log("⏳ Waiting for shutdown to complete...");
}

/**
 * Get a persistent connection to the DB.
 * IMPORTANT: PGLite does not support multiple connections; so we use the network mutex.
 * @param creds - The database credentials.
 * @returns The database connection.
 */
const getPersistentConnection = (creds: PoolConfig): Client => {
  const client = new pg.Client(creds);
  client.connect(() => {});
  client.on("error", (err: Error) => {
    console.error(err);
  });
  return client;
};

// Connect to the db, and wait until the tables are created.
export async function getDBConnection(): Promise<Client> {
  // Get DB connection
  const poolConfig = {
    host: ENV.DB_HOST,
    user: ENV.DB_USER,
    password: ENV.DB_PW,
    database: ENV.DB_NAME,
    port: ENV.DB_PORT,
  };

  // We can connect the DB now for doing the tests.
  const db = getPersistentConnection(poolConfig);

  let maxMillis = 10000;

  // Wait until the DB is ready and the tables are created.
  while (maxMillis > 0) {
    let didLock = false;
    let isReady = false;
    try {
      await fetch(`http://localhost:${ENV.PAIMA_API_PORT}/db_aquire_lock`);
      didLock = true;
      await db.query(
        `SELECT id FROM public.primitive_accounting LIMIT 1`,
      );
      isReady = true;
    } finally {
      if (didLock) {
        await fetch(`http://localhost:${ENV.PAIMA_API_PORT}/db_release_lock`);
      }
    }
    if (isReady) {
      return db;
    }
    await delay(100);

    maxMillis -= 100;
    if (maxMillis <= 0) {
      throw new Error("DB connection timed out");
    }
  }
}
