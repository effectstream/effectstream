import {
    OrchestratorConfig,
    start,
  } from "@effectstream/orchestrator";
  import { ComponentNames } from "@effectstream/log";
  import { Value } from "@sinclair/typebox/value";
  import { ENV } from "@effectstream/utils/node-env";
  import {
    isExternalProofServerConfigured,
    midnightNetworkConfig,
  } from "@effectstream/midnight-contracts/midnight-env";
  
  const logs = ENV.getBoolean("EFFECTSTREAM_STDOUT") ? "stdout" : "development";
  const disableStderr = logs !== "stdout";
  const external_db_enabled = ENV.getBoolean("EXTERNAL_DB_ENABLED");

  const midnightWalletSeed = Deno.env.get("MIDNIGHT_WALLET_SEED");
  if (!midnightWalletSeed) {
    throw new Error("MIDNIGHT_WALLET_SEED is not set");
  }

  const shouldLaunchProofServer = !isExternalProofServerConfigured;
  const shouldInjectProofServerEnv =
    !Deno.env.get("MIDNIGHT_PROOF_SERVER_URL") &&
    !Deno.env.get("MIDNIGHT_PROOF_SERVER");
  const proofServerEnv = shouldInjectProofServerEnv
    ? { MIDNIGHT_PROOF_SERVER_URL: midnightNetworkConfig.proofServer }
    : undefined;

  const config = Value.Parse(OrchestratorConfig, {
    logs,
    processes: {
      [ComponentNames.TMUX]: logs === "development",
      [ComponentNames.TUI]: logs === "development",
      // Launch Dev DB & Collector
      [ComponentNames.EFFECTSTREAM_PGLITE]: !external_db_enabled,
      [ComponentNames.COLLECTOR]: true,
    },
  
    packageName: "@effectstream",
  
    // Launch my processes
    processesToLaunch: [
      ...(shouldLaunchProofServer
        ? [
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
              "@e2e/midnight-contracts",
              "midnight-proof-server:wait",
            ],
            logs: "raw",
            env: proofServerEnv,
            dependsOn: [ComponentNames.MIDNIGHT_PROOF_SERVER],
          },
        ]
        : []),
      { 
        name: "build explorer",
        stopProcessAtPort: [10590],
        args: ["task", "-f", "@effectstream/explorer", "build"],
        waitToExit: true,
        dependsOn: [],
      },
      {
        name: "serve explorer",
        args: ["task", "-f", "@effectstream/explorer", "server:start"],
        waitToExit: false,
        type: "system-dependency",
        link: "http://localhost:10590",
        dependsOn: ['build explorer'],
      },
      { 
        // Launch the Batcher with our PaimaL2 Contract
        stopProcessAtPort: [3334],
        name: "batcher",
        args: ["task", "-f", "@e2e/batcher", "start:testnet"],
        waitToExit: false,
        type: "system-dependency",
      }
    ],
  });
  
  await start(config);
  