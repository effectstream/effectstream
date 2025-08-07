import type { HardhatUserConfig } from "hardhat/config";
import util from "node:util";
import HardhatViem from "@nomicfoundation/hardhat-viem";
// import HardhatAbiExporter from "hardhat-abi-exporter";
import { overrideTask, task } from "hardhat/config";
import { ArgumentType } from "hardhat/types/arguments";
// required for https://github.com/NomicFoundation/hardhat/issues/6472
import {
  type JsonRpcServer,
  JsonRpcServerImplementation,
} from "./json-rpc-server/json-rpc/server.ts";
import fs from "node:fs";
import type { NetworkConfig } from "hardhat/types/config";
import waitOn from "wait-on";
import {
  ComponentNames,
  defaultOtelSetup,
  log,
  SeverityNumber,
} from "@paimaexample/log";
import { parse } from "jsonc-parser";
import { NodeSDK } from "@opentelemetry/sdk-node";
import HardhatIgnitionViem from "@nomicfoundation/hardhat-ignition-viem";

const __dirname: any = import.meta.dirname;
const DenoConfig = parse(fs.readFileSync("./deno.json", "utf8"));

// TODO: ideally hardhat/edr itself would implement opentelemetry instead of inlining it ourselves
export function initTelemetry(): void {
  const sdk = new NodeSDK({
    ...defaultOtelSetup("hardhat", DenoConfig.version),
  });

  sdk.start();
}
initTelemetry();

function logNetwork(networkName: string, ...msg: any[]) {
  log.remote(
    ComponentNames.HARDHAT,
    [networkName],
    SeverityNumber.INFO,
    (log) => log(...msg),
  );
}

util.inspect.defaultOptions.depth = null;

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
  .setAction(
    async (args, hre): Promise<void> => {
      const hostname = (() => {
        if (args.hostname !== "127.0.0.1" && args.hostname !== "") {
          return args.hostname;
        }
        const insideDocker = fs.existsSync("/.dockerenv");
        return insideDocker ? "0.0.0.0" : "127.0.0.1";
      })();
      let port = args.port;

      const connections: JsonRpcServer[] = [];
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

        const connection = await hre.network.connect(name); // , network.chainType);

        const server = new JsonRpcServerImplementation({
          hostname,
          port,
          provider: connection.provider,
        }, (msg) => logNetwork(name, msg));
        port++; // increase port so next network has a unique port number
        const publicClient = await connection.viem.getPublicClient();
        publicClient.watchBlocks(
          {
            onBlock: (block) => {
              // there seems to be a bug on block 0 where it triggers watchBlock in an infinite loop
              if (block.number === 0n) return;

              const txsMessage = block.transactions.length === 0
                ? ""
                : `\nTransactions:\n${
                  block.transactions.map((tx) => tx.hash).join("\n\t")
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
  )
  .build();

const nodeWaitTask = task(["node", "wait"])
  .addOption({
    name: "port",
    type: ArgumentType.INT,
    defaultValue: 8545,
  }).setAction(
    async (args, hre): Promise<void> => {
      const networkEntries = getNetworkList(hre.config.networks);
      for (
        let port = args.port;
        port < args.port + networkEntries.length;
        port++
      ) {
        await waitOn({
          resources: [`tcp:${port}`],
        });
        port++;
      }
    },
  )
  .build();

const config: HardhatUserConfig = {
  // This is an example of two networks.
  // The first network "evmMain" will automatically start at port 8545 with id=31337, matching the default hardhat setup.
  // The second network "evmParallel" will automatically start at port 8546 with id=31338.
  // You can edit this to match your requirements.
  networks: {
    evmMain: {
      type: "edr",
      chainType: "l1",
      chainId: 31337,
      mining: {
        auto: true,
        interval: 250, // Arbitrum (250ms)
      },
      allowBlocksWithSameTimestamp: true,
    },
    // This is a helper network to allow to hardhat/ignition to connect to the network.
    evmMainHttp: {
      type: "http",
      chainType: "l1",
      url: "http://0.0.0.0:8545",
    },
    evmParallel: {
      type: "edr",
      chainType: "l1",
      chainId: 31338,
      mining: {
        auto: true,
        interval: 1 * 1000, // 1s
      },
    },
    // This is a helper network to allow to hardhat/ignition to connect to the network.
    evmParallelHttp: {
      type: "http",
      chainType: "l1",
      url: "http://0.0.0.0:8546",
    },
  },
  paths: {
    sources: [
      `${__dirname}/src/contracts`,
    ],
    artifacts: `${__dirname}/build/artifacts/hardhat`,
    cache: `${__dirname}/build/cache/hardhat`,
  },
  tasks: [
    nodeTask,
    nodeWaitTask,
  ],
  plugins: [
    HardhatViem,
    HardhatIgnitionViem,
    // HardhatFoundry,
    // HardhatAbiExporter,
  ],

  solidity: {
    profiles: {
      /*
       * The default profile is used when no profile is defined or specified
       * in the CLI or by the tasks you are running.
       */
      default: {
        version: "0.8.28",
      },
    },
    // dependenciesToCompile: [
    //   // TODO
    // ],
    // remappings: [
    //   "remapped/=npm/@openzeppelin/contracts@5.1.0/access/",
    //   //   // This is necessary because most people import forge-std/Test.sol, and not forge-std/src/Test.sol
    //   "forge-std/=npm/forge-std@local/src/",
    // ],
  },
  // abiExporter: {
  //   path: "./build/abi",
  //   runOnCompile: true,
  //   clear: true,
  //   flat: false,
  //   tsWrapper: true,
  // },
};

// avoid the user having to manually run contracts when using the localhost network as it's tedious
// if ((process.env["NETWORK"] ?? "localhost") === "localhost") {
//   defaultDeployment(__dirname, outDir, {
//     modulePath: path.resolve(
//       __dirname,
//       "src",
//       "ignition",
//       "modules",
//       "deploy.ts",
//     ),
//     parameters: path.resolve(__dirname, "src", "ignition", "parameters.json5"),
//     reset: false,
//     verify: false, // likely you want this to true for mainnet
//     strategy: "basic", // change if you want create2
//     deploymentId: undefined,
//     defaultSender: undefined,
//     writeLocalhostDeployment: true,
//   });
// }

export default config;
