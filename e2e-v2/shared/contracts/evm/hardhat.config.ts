import type { HardhatUserConfig } from "hardhat/config";
import {
  createHardhatConfig,
  createNodeTasks,
  initTelemetry,
} from "@effectstream/evm-hardhat/hardhat-config-builder";

const __dirname: any = import.meta.dirname;

initTelemetry("@e2e-v2/evm-contracts", "0.1.0");

const nodeTasks = createNodeTasks();

const evmMainPort = 8545;
const evmParallelPort = 8546;
const evmMainChainId = 31337;
const evmParallelChainId = 31338;
const evmMainInterval = 250;
const evmParallelInterval = 1000;

const config: HardhatUserConfig = createHardhatConfig({
  sourcesDir: `${__dirname}/src/contracts`,
  artifactsDir: `${__dirname}/build/artifacts/hardhat`,
  cacheDir: `${__dirname}/build/cache/hardhat`,
  networks: {
    evmMain: {
      type: "edr-simulated",
      chainType: "l1",
      chainId: evmMainChainId,
      mining: {
        auto: true,
        interval: evmMainInterval,
      },
      allowBlocksWithSameTimestamp: true,
    },
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
        interval: evmParallelInterval,
      },
    },
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
