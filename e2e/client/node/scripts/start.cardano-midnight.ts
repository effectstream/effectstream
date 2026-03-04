import {
  OrchestratorConfig,
  start,
} from "@effectstream/orchestrator";
import { ComponentNames } from "@effectstream/log";
import { Value } from "@sinclair/typebox/value";
import { launchCardano } from "@effectstream/orchestrator/start-cardano";
import { launchMidnight } from "@effectstream/orchestrator/start-midnight";
import { ENV } from "@effectstream/utils/node-env";

const logs = ENV.getBoolean("EFFECTSTREAM_STDOUT") ? "stdout" : "development";
const external_db_enabled = ENV.getBoolean("EXTERNAL_DB_ENABLED");

const cardano_processes = launchCardano("@e2e/cardano-contracts");
const midnight_processes = launchMidnight("@e2e/midnight-contracts");

const config = Value.Parse(OrchestratorConfig, {
  logs,
  processes: {
    [ComponentNames.TMUX]: logs === "development",
    [ComponentNames.TUI]: logs === "development",
    [ComponentNames.EFFECTSTREAM_PGLITE]: !external_db_enabled,
    [ComponentNames.COLLECTOR]: true,
  },

  packageName: "@effectstream",

  processesToLaunch: [
    ...cardano_processes,
    ...midnight_processes,
  ],
});

await start(config);
