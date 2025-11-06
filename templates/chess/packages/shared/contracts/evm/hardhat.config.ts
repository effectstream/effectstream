import type { HardhatUserConfig } from "hardhat/config";
import {
  createHardhatConfig,
  createNodeTasks,
  initTelemetry,
} from "@paimaexample/evm-contracts";
import {
  JsonRpcServerImplementation,
} from "@paimaexample/evm-hardhat/json-rpc-server";
import fs from "node:fs";
import waitOn from "wait-on";
import {
  ComponentNames,
  log,
  SeverityNumber,
} from "@paimaexample/log";

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

// Create unified config with default networks
const config: HardhatUserConfig = createHardhatConfig({
  sourcesDir: `${__dirname}/src/contracts`,
  artifactsDir: `${__dirname}/build/artifacts/hardhat`,
  cacheDir: `${__dirname}/build/cache/hardhat`,
  // Default networks (evmMain, evmMainHttp, evmParallel, evmParallelHttp) are used automatically
  tasks: nodeTasks,
  solidityVersion: "0.8.30",
});

export default config;
