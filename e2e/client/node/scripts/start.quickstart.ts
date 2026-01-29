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
import { launchBitcoin } from "@effectstream/orchestrator/start-bitcoin";
import { ENV } from "@effectstream/utils/node-env";

const logs = ENV.getBoolean("EFFECTSTREAM_STDOUT") ? "stdout" : "development";
const external_db_enabled = ENV.getBoolean("EXTERNAL_DB_ENABLED");
const yaci_enabled = false; //!ENV.getBoolean("DISABLE_YACI");
const midnight_enabled = !ENV.getBoolean("DISABLE_MIDNIGHT");
const avail_enabled = !ENV.getBoolean("DISABLE_AVAIL");
const bitcoin_enabled = !ENV.getBoolean("DISABLE_BITCOIN");

const cardano_processes = (yaci_enabled ? launchCardano("@e2e/cardano-contracts") : []);

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
    ...launchEvm("@e2e/evm-contracts"),
    ...(bitcoin_enabled ? launchBitcoin("@e2e/bitcoin-contracts") : []),
    ...cardano_processes,
    ...(avail_enabled ? launchAvail("@e2e/avail-contracts") : []),
    ...(midnight_enabled ? launchMidnight("@e2e/midnight-contracts") : []),
    { 
      // Launch the Batcher with our PaimaL2 Contract
      stopProcessAtPort: [3334],
      name: "batcher",
      args: ["task", "-f", "@e2e/batcher", "start"],
      waitToExit: false,
      type: "system-dependency",
      dependsOn: [
        ComponentNames.DEPLOY_EVM_CONTRACTS, 
        midnight_enabled ? ComponentNames.MIDNIGHT_CONTRACT : undefined,
        bitcoin_enabled ? ComponentNames.BITCOIN_GENERATE_BLOCKS : undefined,
      ].filter(Boolean),
    },
    { 
      name: "build explorer",
      stopProcessAtPort: [10590],
      args: ["task", "-f", "@effectstream/explorer", "build"],
      waitToExit: true,
      dependsOn: [
        'batcher',
        (yaci_enabled && cardano_processes.length > 0) ? ComponentNames.DOLOS_WAIT : undefined,
        avail_enabled ? ComponentNames.AVAIL_CLIENT_WAIT : undefined,
      ].filter(Boolean),
    },
    {
      name: "serve explorer",
      args: ["task", "-f", "@effectstream/explorer", "server:start"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:10590",
      dependsOn: ['build explorer'],
    },

  ],
});

await start(config);
