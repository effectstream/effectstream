import {
  OrchestratorConfig,
  type ProcessComponent,
  start,
} from "@effectstream/orchestrator";
import { ComponentNames } from "@effectstream/log";
import { Value } from "@sinclair/typebox/value";
import { launchAvail } from "@effectstream/orchestrator/start-avail";
import { launchCardano } from "@effectstream/orchestrator/start-cardano";
import { launchEvm } from "@effectstream/orchestrator/start-evm";
import { launchMidnight } from "@effectstream/orchestrator/start-midnight";

const logs = Deno.env.get("EFFECTSTREAM_STDOUT") ? "stdout" : "development";
const external_db_enabled = Deno.env.get("EXTERNAL_DB_ENABLED") === "true";
const yaci_enabled = Deno.env.get("DISABLE_YACI") === "true"
  ? false
  : true;

const midnight_enabled = Deno
  ? (Deno.env.get("DISABLE_MIDNIGHT") === "true" ? false : true)
  : true;

const avail_enabled = Deno
  ? (Deno.env.get("DISABLE_AVAIL") === "true" ? false : true)
  : true;

const config = Value.Parse(OrchestratorConfig, {
  logs,
  processes: {
    [ComponentNames.TMUX]: logs === "development",
    [ComponentNames.TUI]: logs === "development",
    // Launch Dev DB & Collector
    [ComponentNames.PAIMA_PGLITE]: !external_db_enabled,
    [ComponentNames.COLLECTOR]: logs === "development",
  },

  packageName: "@effectstream",

  // Launch my processes
  processesToLaunch: [
    ...launchEvm("@e2e/evm-contracts"),
    ...(yaci_enabled ? launchCardano("@e2e/cardano-contracts") : []),
    ...(avail_enabled ? launchAvail("@e2e/avail-contracts") : []),
    ...(midnight_enabled ? launchMidnight("@e2e/midnight-contracts") : []),
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
      dependsOn: [],
    },
    { 
      // Launch the Batcher with our PaimaL2 Contract
      stopProcessAtPort: [3334],
      name: "batcher",
      args: ["task", "-f", "@e2e/batcher", "start"],
      waitToExit: false,
      type: "system-dependency",
      dependsOn: [ComponentNames.DEPLOY_EVM_CONTRACTS, midnight_enabled ? ComponentNames.MIDNIGHT_CONTRACT : undefined].filter(Boolean),
    }
  ],
});

await start(config);
