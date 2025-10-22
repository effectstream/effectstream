import {
  OrchestratorConfig,
  type ProcessComponent,
  start,
} from "@paima/orchestrator";
import { ComponentNames } from "@paima/log";
import { Value } from "@sinclair/typebox/value";
import { launchAvail } from "@paima/orchestrator/start-avail";
import { launchCardano } from "@paima/orchestrator/start-cardano";
import { launchEvm } from "@paima/orchestrator/start-evm";
import { launchMidnight } from "@paima/orchestrator/start-midnight";

const logs = Deno.env.get("PAIMA_E2E_LOG_DEBUG") ? "stdout" : "development";
const external_db_enabled = Deno.env.get("EXTERNAL_DB_ENABLED") === "true";
const yaci_enabled = Deno.env.get("DISABLE_LINUX_YACI") === "true"
  ? false
  : true;

const midnight_enabled = Deno
  ? (Deno.env.get("DISABLE_MIDNIGHT") === "true" ? false : true)
  : true;

const avail_enabled = Deno
  ? (Deno.env.get("DISABLE_AVAIL") === "true" ? false : true)
  : true;

const evmProcessesExtended = launchEvm("@e2e/evm-contracts");
// Add batcher after the evm processes because it needs the contracts to be deployed
evmProcessesExtended.stopProcessAtPort.push(3334);
evmProcessesExtended.processes.push(
  { // Launch the Batcher with our PaimaL2 Contract
    name: "batcher",
    args: ["task", "-f", "@e2e/batcher", "start"],
    waitToExit: false,
    type: "system-dependency",
  },
);

const config = Value.Parse(OrchestratorConfig, {
  logs,
  processes: {
    [ComponentNames.TMUX]: logs === "development",
    [ComponentNames.TUI]: logs === "development",
    [ComponentNames.DOCS]: false,
    // Launch Dev DB & Collector
    [ComponentNames.PAIMA_PGLITE]: !external_db_enabled,
    [ComponentNames.COLLECTOR]: logs === "development",
  },

  packageName: "@paima",

  // Launch my processes
  processesToLaunch: [
    evmProcessesExtended,
    yaci_enabled ? launchCardano("@e2e/cardano-contracts") : {},
    avail_enabled ? launchAvail("@e2e/avail-contracts") : {},
    midnight_enabled ? launchMidnight("@e2e/midnight-contracts") : {},
    {
      stopProcessAtPort: [10590],
      processes: [
        {
          name: "frontend-build",
          args: ["task", "-f", "paima/explorer", "build"],
          waitToExit: true,
        },
        {
          name: "frontend-server",
          args: ["task", "-f", "@paima/explorer", "server:start"],
          waitToExit: false,
          type: "system-dependency",
          link: "http://localhost:10590",
        },
      ],
    },
  ],
});

await start(config);
