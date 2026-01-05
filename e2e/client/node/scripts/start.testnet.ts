import {
    OrchestratorConfig,
    start,
  } from "@effectstream/orchestrator";
  import { ComponentNames } from "@effectstream/log";
  import { Value } from "@sinclair/typebox/value";
  import { ENV } from "@effectstream/utils/node-env";
  
  const logs = ENV.getBoolean("EFFECTSTREAM_STDOUT") ? "stdout" : "development";
  const external_db_enabled = ENV.getBoolean("EXTERNAL_DB_ENABLED");
  
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
  