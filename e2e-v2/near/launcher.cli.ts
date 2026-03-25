import type { OrchestratorConfig } from "../../packages/build-tools/orchestrator-v2/src/config.ts";

/**
 * NEAR orchestrator config (orchestrator-v2 format).
 *
 * Infrastructure:
 *   1. PGLite DB -> wait -> apply migrations
 *   2. NEAR sandbox (neard on port 3030)
 *   3. Wait for RPC
 * Node:
 *   4. Create user tables
 *   5. Sync node (e2e-v2/near/node.ts) - depends on DB + sandbox ready
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

    // ── NEAR Sandbox ──────────────────────────────────────────────────────────
    {
      name: "near-sandbox",
      description: "NEAR sandbox node (port 3030)",
      stopProcessAtPort: [3030],
      args: ["run", "packages/binaries/near-sandbox/index.js"],
      waitToExit: false,
      critical: true,
    },
    {
      name: "near-sandbox-wait",
      description: "Wait for NEAR RPC on port 3030",
      args: ["./node_modules/.bin/wait-on", "tcp:3030"],
      waitToExit: true,
      dependsOn: ["near-sandbox"],
    },

    // ── Deploy Contract ────────────────────────────────────────────────────
    {
      name: "deploy-near-contract",
      description: "Deploy test contract and call emit_event",
      args: ["run", "e2e-v2/shared/contracts/near/deploy-and-call.ts"],
      waitToExit: true,
      critical: true,
      dependsOn: ["near-sandbox-wait"],
    },

    // ── User tables ──────────────────────────────────────────────────────────
    {
      name: "create-user-tables",
      description: "Create user-defined DB tables for STM",
      args: ["run", "e2e-v2/near/database/create-tables.ts"],
      waitToExit: true,
      critical: true,
      dependsOn: ["apply-migrations"],
    },

    // ── Sync (the node) ──────────────────────────────────────────────────────
    {
      name: "sync",
      description: "E2E-V2 NEAR sync node",
      args: ["run", "e2e-v2/near/node.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [
        "create-user-tables",
        "near-sandbox-wait",
      ],
    },
  ],
} satisfies OrchestratorConfig;
