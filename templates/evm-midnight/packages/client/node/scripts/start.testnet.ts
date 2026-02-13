import { OrchestratorConfig, start } from "@paimaexample/orchestrator";
import { ComponentNames } from "@paimaexample/log";
import { Value } from "@sinclair/typebox/value";
import { ENV } from "@paimaexample/utils/node-env";
import {
  isExternalProofServerConfigured,
  midnightNetworkConfig,
} from "@paimaexample/midnight-contracts/midnight-env";

const logs = ENV.getBoolean("EFFECTSTREAM_STDOUT") ? "stdout" : "development";
const disableStderr = logs !== "stdout";

const shouldLaunchProofServer = !isExternalProofServerConfigured;
const shouldInjectProofServerEnv =
  !process.env.MIDNIGHT_PROOF_SERVER_URL &&
  !process.env.MIDNIGHT_PROOF_SERVER;
const proofServerEnv = shouldInjectProofServerEnv
  ? { MIDNIGHT_PROOF_SERVER_URL: midnightNetworkConfig.proofServer }
  : undefined;

// Frontend expects base URLs (it appends /api/v3/graphql and /api/v3/graphql/ws).
const indexerBase = midnightNetworkConfig.indexer.replace(/\/api\/v3\/graphql$/, "");
const indexerWsBase = midnightNetworkConfig.indexerWS.replace(
  /\/api\/v3\/graphql\/ws$/,
  "",
);

const frontendEnv = {
  VITE_MIDNIGHT_NETWORK_ID: midnightNetworkConfig.id,
  VITE_MIDNIGHT_INDEXER_HTTP: indexerBase,
  VITE_MIDNIGHT_INDEXER_WS: indexerWsBase,
  VITE_MIDNIGHT_NODE_HTTP: midnightNetworkConfig.node,
  VITE_MIDNIGHT_PROOF_SERVER_URL: midnightNetworkConfig.proofServer,
};

const customProcesses = [
  {
    name: "frontend-build",
    args: ["run", "--filter", "@example-evm-midnight/frontend", "build"],
    waitToExit: true,
    type: "system-dependency",
    env: frontendEnv,
  },
  {
    name: "frontend-server",
    args: ["run", "--filter", "@example-evm-midnight/frontend", "serve"],
    waitToExit: false,
    type: "system-dependency",
    link: "http://localhost:10599",
    stopProcessAtPort: [10599],
    dependsOn: ["frontend-build"],
    env: frontendEnv,
  },
  {
    name: "explorer",
    args: ["run", "@paimaexample/explorer"],
    waitToExit: false,
    type: "system-dependency",
    link: "http://localhost:10590",
    stopProcessAtPort: [10590],
  },
  {
    name: "batcher",
    args: ["run", "--filter", "@example-evm-midnight/batcher", "start"],
    waitToExit: false,
    type: "system-dependency",
    link: "http://localhost:3334",
    stopProcessAtPort: [3334],
  },
];

const config = Value.Parse(OrchestratorConfig, {
  logs,
  packageName: "@paimaexample",
  processes: {
    [ComponentNames.TMUX]: logs === "development",
    [ComponentNames.TUI]: logs === "development",
    // Launch Dev DB & Collector
    [ComponentNames.EFFECTSTREAM_PGLITE]: true,
    [ComponentNames.COLLECTOR]: true,
  },

  // Launch my processes
  processesToLaunch: [
    ...(shouldLaunchProofServer
      ? [
        {
          name: ComponentNames.MIDNIGHT_PROOF_SERVER,
          args: [
            "task",
            "-f",
            "@example-evm-midnight/midnight-contracts",
            "midnight-proof-server:start",
          ],
          waitToExit: false,
          type: "system-dependency",
          logs: "raw",
          logsStartDisabled: true,
          disableStderr,
          env: proofServerEnv,
        },
        {
          name: ComponentNames.MIDNIGHT_PROOF_SERVER_WAIT,
          args: [
            "task",
            "-f",
            "@example-evm-midnight/midnight-contracts",
            "midnight-proof-server:wait",
          ],
          logs: "raw",
          env: proofServerEnv,
          dependsOn: [ComponentNames.MIDNIGHT_PROOF_SERVER],
        },
      ]
      : []),
    ...customProcesses,
  ],
});

await start(config);
