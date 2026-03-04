import {
  OrchestratorConfig,
  start,
} from "@effectstream/orchestrator";
import { ComponentNames } from "@effectstream/log";
import { Value } from "@sinclair/typebox/value";
import { launchMidnight } from "@effectstream/orchestrator/start-midnight";

// Development launcher: starts an embedded PGlite DB, the Midnight stack, and the node.
// For production, set MIDNIGHT_NODE_HTTP, MIDNIGHT_INDEXER_HTTP, MIDNIGHT_INDEXER_WS
// and CELESTIA_RPC_URL to point at real services.
const config = Value.Parse(OrchestratorConfig, {
  packageName: "@effectstream",
  // logs: "stdout",
  processes: {
    // Embedded PostgreSQL-compatible database for development
    [ComponentNames.EFFECTSTREAM_PGLITE]: true,
    [ComponentNames.COLLECTOR]: true,
    [ComponentNames.TMUX]: true,
    [ComponentNames.TUI]: true,
  },
  processesToLaunch: [
    ...launchMidnight("@zswap-da/midnight-contracts"),
  ],
});

await start(config);
