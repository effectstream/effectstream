import type { OrchestratorConfig } from "../../packages/build-tools/orchestrator-v2/src/config.ts";

/**
 * Midnight-only orchestrator config (orchestrator-v2 format).
 *
 * Infrastructure:
 *   1. PGLite DB -> wait -> apply migrations -> create user tables
 *   2. Midnight node + indexer + proof server -> wait -> deploy contracts
 * Node:
 *   3. Sync node (e2e-v2/midnight/node.ts) - depends on both DB and contracts
 */
export default {
  processes: [
    // -- Database ----------------------------------------------------------------
    {
      name: "pglite",
      description: "PGLite embedded database",
      args: ["-e", "process.argv.splice(1, 0, '_'); await import('@effectstream/db/start-pglite')", "--port", "5432"],
      stopProcessAtPort: [5432],
      waitToExit: false,
      critical: true,
    },
    {
      name: "pglite-wait",
      args: ["./node_modules/.bin/wait-on", "tcp:5432"],
      waitToExit: true,
      dependsOn: ["pglite"],
    },
    {
      name: "apply-migrations",
      description: "Apply database migrations",
      args: ["-e", "await import('@effectstream/db/apply-migrations')"],
      waitToExit: true,
      critical: true,
      dependsOn: ["pglite-wait"],
    },
    {
      name: "create-user-tables",
      description: "Create user-defined DB tables for STM",
      args: ["run", "e2e-v2/midnight/database/create-tables.ts"],
      waitToExit: true,
      critical: true,
      dependsOn: ["apply-migrations"],
    },

    // -- Midnight infrastructure -------------------------------------------------
    {
      name: "midnight-node",
      description: "Midnight substrate node",
      stopProcessAtPort: [9944, 8088, 6300, 30333],
      args: ["run", "--filter", "@e2e/midnight-contracts", "midnight-node:start"],
      waitToExit: false,
      type: "system-dependency" as const,
    },
    {
      name: "midnight-indexer",
      description: "Midnight GraphQL indexer",
      args: ["run", "--filter", "@e2e/midnight-contracts", "midnight-indexer:start"],
      waitToExit: false,
      type: "system-dependency" as const,
      dependsOn: ["midnight-node"],
    },
    {
      name: "midnight-proof-server",
      description: "Midnight proof server",
      args: ["run", "--filter", "@e2e/midnight-contracts", "midnight-proof-server:start"],
      waitToExit: false,
      type: "system-dependency" as const,
      dependsOn: ["midnight-node"],
    },
    {
      name: "midnight-node-wait",
      args: ["run", "--filter", "@e2e/midnight-contracts", "midnight-node:wait"],
      waitToExit: true,
      dependsOn: ["midnight-node"],
    },
    {
      name: "midnight-indexer-wait",
      args: ["run", "--filter", "@e2e/midnight-contracts", "midnight-indexer:wait"],
      waitToExit: true,
      dependsOn: ["midnight-indexer"],
    },
    {
      name: "midnight-proof-server-wait",
      args: ["run", "--filter", "@e2e/midnight-contracts", "midnight-proof-server:wait"],
      waitToExit: true,
      dependsOn: ["midnight-proof-server"],
    },
    {
      name: "midnight-contract",
      description: "Deploy Midnight contracts (counter + eip-20)",
      args: ["run", "--filter", "@e2e/midnight-contracts", "midnight-contract:deploy"],
      waitToExit: true,
      env: {
        MIDNIGHT_STORAGE_PASSWORD: process.env["MIDNIGHT_STORAGE_PASSWORD"] ?? "YourPasswordMy1!",
      },
      dependsOn: [
        "midnight-node-wait",
        "midnight-indexer-wait",
        "midnight-proof-server-wait",
      ],
    },

    // -- Sync (the node) ---------------------------------------------------------
    {
      name: "sync",
      description: "E2E-V2 Midnight sync node",
      args: ["run", "e2e-v2/midnight/node.ts"],
      waitToExit: false,
      type: "system-dependency" as const,
      env: { PGLITE: "true" },
      dependsOn: [
        "create-user-tables",
        "midnight-contract",
      ],
    },
  ],
} satisfies OrchestratorConfig;
