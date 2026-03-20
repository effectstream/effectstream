import type { OrchestratorConfig } from "../../packages/build-tools/orchestrator-v2/src/config.ts";

/**
 * Celestia-only orchestrator config (orchestrator-v2 format).
 *
 * Infrastructure:
 *   1. PGLite DB -> wait -> apply migrations
 *   2. (Celestia Light Node must be running externally on port 26658)
 * Node:
 *   3. Create user tables
 *   4. Sync node (e2e-v2/celestia/node.ts) - depends on DB
 */
export default {
  processes: [
    // ── Database ──────────────────────────────────────────────────────────────
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

    // ── User tables ──────────────────────────────────────────────────────────
    {
      name: "create-user-tables",
      description: "Create user-defined DB tables for STM",
      args: ["run", "e2e-v2/celestia/database/create-tables.ts"],
      waitToExit: true,
      critical: true,
      dependsOn: ["apply-migrations"],
    },

    // ── Sync (the node) ──────────────────────────────────────────────────────
    {
      name: "sync",
      description: "E2E-V2 Celestia sync node",
      args: ["run", "e2e-v2/celestia/node.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [
        "create-user-tables",
      ],
    },
  ],
} satisfies OrchestratorConfig;
