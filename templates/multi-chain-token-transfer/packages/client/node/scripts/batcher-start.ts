/*
batcher: {
  paimaL2Address: contractAddressesEvmMain()["chain31337"][
    "PaimaL2ContractModule#MyPaimaL2Contract"
  ],
  paimaSyncProtocolName: "mainEvmRPC",
  batcherPrivateKey:
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  chainName: "hardhat",
},
*/
import {
  EvmChainConnector,
  FileStorage,
  PaimaBatcher,
  type PaimaBatcherConfig,
} from "@paimaexample/batcher";
import { contractAddressesEvmMain } from "@multi-chain-transfer/evm-contracts";
import * as chains from "viem/chains";

// First version of a standalone launcher for the new batcher, configured like the old E2E batcher.

// Config values mirroring e2e/client/node/scripts/start.ts
const batchIntervalMs = 1000;
const paimaL2Address = contractAddressesEvmMain()["chain31337"][
  "PaimaL2ContractModule#MyPaimaL2Contract"
] as `0x${string}`;
const paimaSyncProtocolName = "mainEvmRPC";
const batcherPrivateKey =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const chain = chains.hardhat;

// Defaults consistent with E2E usage
const paimaL2Fee = 0n; // old batcher defaulted to 0 for local dev
const port = Number(Deno.env.get("BATCHER_PORT") ?? "3334");

// Storage location (JSONL queue)
const storage = new FileStorage("./batcher-data");

// EVM connector
const evm = new EvmChainConnector(
  paimaL2Address,
  batcherPrivateKey,
  chain,
  paimaL2Fee,
  paimaSyncProtocolName,
);

// Batcher config matching old behavior
const config: PaimaBatcherConfig = {
  pollingIntervalMs: batchIntervalMs,
  connectors: { evm },
  defaultTarget: "evm",
  confirmationLevel: "wait-paima-processed", // By Connector
  batchBuilding: { maxSize: 10000 }, // By Connector
  port,
};

// Instantiate and run
const batcher = new PaimaBatcher(storage, config);

// Align signature namespace with E2E (empty namespace)
batcher.namespace = "";

await batcher.init();

const publicConfig = batcher.getPublicConfig();
console.log(
  `🎯 Batcher started - polling every ${publicConfig.pollingIntervalMs} ms`,
);
console.log(`📍 Default Target: ${publicConfig.defaultTarget}`);
console.log(
  `⛓️ Connector Targets: ${publicConfig.connectorTargets.join(", ")}`,
);
console.log(
  `📦 Batching Criteria: ${
    Object.entries(publicConfig.criteriaTypes).map(([target, type]) =>
      `${target}=${type}`
    ).join(", ")
  }`,
);
console.log(`🌐 HTTP Server: http://localhost:${publicConfig.port}`);
console.log("📋 Press Ctrl+C to stop gracefully");

// Graceful shutdown on SIGINT/SIGTERM
function setupSignals() {
  const shutdown = async (sig: string) => {
    console.log(`\n🛑 Received ${sig}, initiating graceful shutdown...`);
    try {
      await batcher.gracefulShutdown();
    } finally {
      Deno.exit(0);
    }
  };
  Deno.addSignalListener("SIGINT", () => shutdown("SIGINT"));
  Deno.addSignalListener("SIGTERM", () => shutdown("SIGTERM"));
}

setupSignals();
