import {
  OrchestratorConfig,
  start,
} from "@paimaexample/orchestrator";
import { ComponentNames } from "@paimaexample/log";
import { Value } from "@sinclair/typebox/value";
import { launchMidnight } from "@paimaexample/orchestrator/start-midnight";

// Development launcher: starts an embedded PGlite DB, the Midnight stack, and the node.
// For production, set MIDNIGHT_NODE_HTTP, MIDNIGHT_INDEXER_HTTP, MIDNIGHT_INDEXER_WS
// and CELESTIA_RPC_URL to point at real services.
const config = Value.Parse(OrchestratorConfig, {
  packageName: "@paimaexample",
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
