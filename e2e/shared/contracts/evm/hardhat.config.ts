import type { HardhatUserConfig } from "hardhat/config";
import {
  createHardhatConfig,
  createNodeTasks,
  initTelemetry,
} from "@effectstream/evm-hardhat/hardhat-config-builder";
import {
  JsonRpcServerImplementation,
} from "@effectstream/evm-hardhat/json-rpc-server";
import fs from "node:fs";
import waitOn from "wait-on";
import {
  ComponentNames,
  log,
  SeverityNumber,
} from "@effectstream/log";

const __dirname: any = import.meta.dirname;

// Initialize telemetry
initTelemetry("@paimaexample/log", "./deno.json");

// Create node tasks
const nodeTasks = createNodeTasks({
  JsonRpcServer: {} as unknown as never, // Type placeholder, not used
  JsonRpcServerImplementation,
  ComponentNames,
  log,
  SeverityNumber,
  waitOn,
  fs,
});

const evmMainPort = 8545;
const evmParallelPort = 8546;
const evmMainChainId = 31337;
const evmParallelChainId = 31338;
const evmMainInterval = 5000;
const evmParallelInterval = 12000;

// Create unified config with default networks
const config: HardhatUserConfig = createHardhatConfig({
  sourcesDir: `${__dirname}/src/contracts`,
  artifactsDir: `${__dirname}/build/artifacts/hardhat`,
  cacheDir: `${__dirname}/build/cache/hardhat`,
  // Default networks (evmMain, evmMainHttp, evmParallel, evmParallelHttp) are used automatically if networks are not specified,
  // but we additionally add arbitrumSepolia for testnet settings.
  networks: {
    // This is needed to set once, to deploy contracts in testnet:
    // deno task deploy:testnet
    // deno task build:mod
    arbitrumSepolia: {
      type: "http",
      chainId: 421614,
      url: "https://arb-sepolia.g.alchemy.com/v2/API-KEY",
      accounts: ["0000000000000000000000000000000000000000000000000000000000000000"], // Private key with no funds to deploy contracts.
    },
    evmMain: {
      type: "edr-simulated",
      chainType: "l1",
      chainId: evmMainChainId,
      mining: {
        auto: true,
        interval: evmMainInterval, // Arbitrum (250ms)
      },
      allowBlocksWithSameTimestamp: true,
    },
    // This is a helper network to allow to hardhat/ignition to connect to the network.
    evmMainHttp: {
      type: "http",
      chainType: "l1",
      url: `http://0.0.0.0:${evmMainPort}`,
    },
    evmParallel: {
      type: "edr-simulated",
      chainType: "l1",
      chainId: evmParallelChainId,
      mining: {
        auto: true,
        interval: evmParallelInterval, // 1s
      },
    },
    // This is a helper network to allow to hardhat/ignition to connect to the network.
    evmParallelHttp: {
      type: "http",
      chainType: "l1",
      url: `http://0.0.0.0:${evmParallelPort}`,
    },
  },
  tasks: nodeTasks,
  solidityVersion: "0.8.30",
});

export default config;
