import type { HardhatUserConfig } from "hardhat/config";
import type { NetworkConfig, TaskArguments } from "hardhat/types";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import HardhatViem from "@nomicfoundation/hardhat-viem";
import { overrideTask, task } from "hardhat/config";
import { ArgumentType } from "hardhat/types/arguments";
import HardhatIgnitionViem from "@nomicfoundation/hardhat-ignition-viem";

/**
 * Dependencies required for creating node tasks.
 * These should be imported in the calling code and passed to createNodeTasks.
 */
export interface NodeTaskDependencies {
  /** JsonRpcServer type placeholder (not actually used, kept for type compatibility) */
  JsonRpcServer?: unknown;
  /** JsonRpcServerImplementation from evm-hardhat package */
  JsonRpcServerImplementation: new (
    options: { hostname: string; port: number; provider: any },
    logCallback: (msg: string) => void,
  ) => any;
  /** Log utilities from log package */
  ComponentNames: { HARDHAT: string };
  log: {
    remote: (
      component: string,
      tags: string[],
      severity: number,
      fn: (log: (...args: unknown[]) => void) => void,
    ) => void;
  };
  SeverityNumber: { INFO: number };
  /** wait-on module for waiting on ports */
  waitOn: (options: { resources: string[] }) => Promise<void>;
  /** fs module for checking Docker environment */
  fs: { existsSync: (path: string) => boolean };
}

/**
 * Options for creating default networks
 */
export interface DefaultNetworkOptions {
  /** Base port for evmMain (defaults to 8545) */
  evmMainPort?: number;
  /** Base port for evmParallel (defaults to 8546) */
  evmParallelPort?: number;
  /** Chain ID for evmMain (defaults to 31337) */
  evmMainChainId?: number;
  /** Chain ID for evmParallel (defaults to 31338) */
  evmParallelChainId?: number;
  /** Mining interval for evmMain in ms (defaults to 250) */
  evmMainInterval?: number;
  /** Mining interval for evmParallel in ms (defaults to 1000) */
  evmParallelInterval?: number;
}

/**
 * Configuration options for creating a Hardhat config
 */
export interface HardhatConfigOptions {
  /** Directory containing contract sources */
  sourcesDir: string;
  /** Directory for compiled artifacts */
  artifactsDir: string;
  /** Directory for Hardhat cache */
  cacheDir: string;
  /** Networks configuration - if not provided, default networks will be used */
  networks?: Record<string, NetworkConfig>;
  /** Whether to use default networks (defaults to true if networks is not provided) */
  useDefaultNetworks?: boolean;
  /** Options for default networks (only used if useDefaultNetworks is true) */
  defaultNetworkOptions?: DefaultNetworkOptions;
  /** Custom Hardhat tasks (e.g., from createNodeTasks) */
  tasks?: HardhatUserConfig["tasks"];
  /** Solidity compiler version */
  solidityVersion?: string;
}

/**
 * Creates node tasks for running local blockchain nodes.
 * These tasks allow starting JSON-RPC servers for configured networks.
 * 
 * @param deps Dependencies required for the tasks (imported in calling code)
 * @returns Array of Hardhat tasks (node and node:wait)
 */
export function createNodeTasks(
  deps: NodeTaskDependencies,
): HardhatUserConfig["tasks"] {
  const {
    JsonRpcServerImplementation,
    ComponentNames,
    log,
    SeverityNumber,
    waitOn,
    fs,
  } = deps;

  function logNetwork(networkName: string, ...msg: unknown[]) {
    log.remote(
      ComponentNames.HARDHAT,
      [networkName],
      SeverityNumber.INFO,
      (logFn) => logFn(...msg),
    );
  }

  function getNetworkList(networks: Record<string, NetworkConfig>) {
    const networkEntries = Object.entries(networks);
    // ensure we always run the `hardhat` network first
    networkEntries.sort((a, b) => {
      if (a[0] === "hardhat") return -1;
      if (b[0] === "hardhat") return 1;
      return 0;
    });

    return networkEntries.filter(([name, network]) =>
      // skip the builtin localhost network, since hardhat node is meant to explicitly not use it
      name !== "localhost" &&
      // hardhat network seems broken and the block number never advances on it
      name !== "hardhat" &&
      // if http type, then it already has a JSON-RPC server
      network.type !== "http"
    );
  }

  const nodeTask = overrideTask("node")
    .setAction(async () => ({
      default: async (
        args: TaskArguments,
        hre: HardhatRuntimeEnvironment,
      ): Promise<void> => {
        const hostname = (() => {
          if (args.hostname !== "127.0.0.1" && args.hostname !== "") {
            return args.hostname as string;
          }
          const insideDocker = fs.existsSync("/.dockerenv");
          return insideDocker ? "0.0.0.0" : "127.0.0.1";
        })();
        let port = args.port as number;

        const connections: any[] = [];
        const networkEntries = getNetworkList(hre.config.networks);
        for (const [name, network] of networkEntries) {
          // skip the builtin localhost network, since hardhat node is meant to explicitly not use it
          if (name === "localhost") {
            continue;
          }
          // hardhat network seems broken and the block number never advances on it
          if (name === "hardhat") {
            continue;
          }
          // if http type, then it already has a JSON-RPC server
          if (network.type === "http") {
            continue;
          }

          const connection = await hre.network.connect(name);

          const server = new JsonRpcServerImplementation(
            {
              hostname,
              port,
              provider: connection.provider,
            },
            (msg: string) => logNetwork(name, msg),
          );
          port++; // increase port so next network has a unique port number
          const publicClient = await connection.viem.getPublicClient();
          publicClient.watchBlocks(
            {
              onBlock: (block: any) => {
                // there seems to be a bug on block 0 where it triggers watchBlock in an infinite loop
                if (block.number === 0n) return;

                const txsMessage = block.transactions.length === 0
                  ? ""
                  : `\nTransactions:\n${
                    block.transactions.map((tx: any) => tx.hash).join("\n\t")
                  }`;
                logNetwork(
                  name,
                  `block ${block.number} (${block.hash})`,
                  txsMessage,
                );
              },
              includeTransactions: true,
            },
          );

          const { port: actualPort, address } = await server.listen();
          logNetwork(
            name,
            `Started HTTP and WebSocket JSON-RPC server at ${address}:${actualPort}\n`,
          );

          connections.push(server);

          logNetwork(name, "Accounts for", name);
          logNetwork(name, "========");
          // we use this over network.genesisAccounts
          // since we don't have access to some of the hardhat v3 util functions otherwise
          const wallets = await connection.viem.getWalletClients();
          for (let i = 0; i < wallets.length; i++) {
            const weiBalance = await publicClient.getBalance({
              address: wallets[i].account.address,
            });
            const balance = (weiBalance / 10n ** 18n).toString(10);
            logNetwork(
              name,
              `Account #${i}: ${wallets[i].account.address} (${balance} ETH)`,
            );
          }
        }
        await Promise.all(
          connections.map((connection) => connection.waitUntilClosed()),
        );
      },
    }))
    .build();

  const nodeWaitTask = task(["node", "wait"])
    .addOption({
      name: "port",
      type: ArgumentType.INT,
      defaultValue: 8545,
    }).setAction(async () => ({
      default: async (
        args: TaskArguments,
        hre: HardhatRuntimeEnvironment,
      ): Promise<void> => {
        const networkEntries = getNetworkList(hre.config.networks);
        for (
          let port = args.port as number;
          port < (args.port as number) + networkEntries.length;
          port++
        ) {
          await waitOn({
            resources: [`tcp:${port}`],
          });
          port++;
        }
      },
    }))
    .build();

  return [nodeTask, nodeWaitTask];
}

/**
 * Creates default network configurations commonly used in e2e tests and templates.
 * 
 * Returns networks:
 * - evmMain: Fast network (250ms block interval) on chainId 31337, port 8545
 * - evmMainHttp: HTTP wrapper for evmMain
 * - evmParallel: Slower network (1s block interval) on chainId 31338, port 8546
 * - evmParallelHttp: HTTP wrapper for evmParallel
 * 
 * @param options Optional configuration to override defaults
 * @returns Network configuration object
 */
export function createDefaultNetworks(
  options?: DefaultNetworkOptions,
): Record<string, NetworkConfig> {
  const {
    evmMainPort = 8545,
    evmParallelPort = 8546,
    evmMainChainId = 31337,
    evmParallelChainId = 31338,
    evmMainInterval = 250,
    evmParallelInterval = 1000,
  } = options || {};

  return {
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
  };
}

/**
 * Initializes OpenTelemetry for Hardhat.
 * This should be called at the top level of your hardhat.config.ts file.
 * 
 * Note: This function uses dynamic imports and executes asynchronously.
 * Errors are caught and logged as warnings to avoid breaking Hardhat initialization.
 * 
 * @param logPackage Package name for log utilities (e.g., "@effectstream/log" or "@paimaexample/log")
 * @param denoJsonPath Path to deno.json file for version detection
 */
export function initTelemetry(
  logPackage: string,
  denoJsonPath: string = "./deno.json",
): void {
  // Dynamic import to support both @effectstream and @paimaexample packages
  // Execute asynchronously - errors won't break Hardhat initialization
  (async () => {
    try {
      const fs = await import("node:fs");
      const { parse } = await import("jsonc-parser");
      const { NodeSDK } = await import("@opentelemetry/sdk-node");
      const { defaultOtelSetup } = await import(logPackage);

      const DenoConfig = parse(fs.readFileSync(denoJsonPath, "utf8"));
      const sdk = new NodeSDK({
        ...defaultOtelSetup("hardhat", DenoConfig.version),
      });
      sdk.start();
    } catch (error) {
      console.warn("Failed to initialize telemetry:", error);
    }
  })();
}

/**
 * Creates a unified Hardhat configuration that can be used across e2e tests and templates.
 * 
 * This function consolidates the common Hardhat setup including:
 * - Network configuration
 * - Path configuration
 * - Plugin setup
 * - Solidity compiler configuration
 * 
 * For node tasks, use createNodeTasks() separately and pass the result in the tasks option.
 * 
 * @param options Configuration options
 * @returns HardhatUserConfig object
 */
export function createHardhatConfig(
  options: HardhatConfigOptions,
): HardhatUserConfig {
  const {
    sourcesDir,
    artifactsDir,
    cacheDir,
    networks,
    useDefaultNetworks = networks === undefined,
    defaultNetworkOptions,
    tasks,
    solidityVersion = "0.8.30",
  } = options;

  // Use default networks if none provided and useDefaultNetworks is true
  const finalNetworks = networks ||
    (useDefaultNetworks
      ? createDefaultNetworks(defaultNetworkOptions)
      : {});

  const config: HardhatUserConfig = {
    networks: finalNetworks,
    paths: {
      sources: [sourcesDir],
      artifacts: artifactsDir,
      cache: cacheDir,
    },
    tasks,
    plugins: [
      HardhatViem,
      HardhatIgnitionViem,
    ],
    solidity: {
      profiles: {
        default: {
          version: solidityVersion,
        },
      },
    },
  };

  return config;
}

