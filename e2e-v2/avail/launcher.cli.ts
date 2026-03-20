import type { OrchestratorConfig } from "../../packages/build-tools/orchestrator-v2/src/config.ts";

/**
 * Avail-only orchestrator config (orchestrator-v2 format).
 *
 * Infrastructure:
 *   1. PGLite DB -> wait -> apply migrations
 *   2. Avail dev node (port 9955) -> wait
 *   3. Deploy light client (creates app key + starts light client) -> wait for light client (port 7007)
 * Node:
 *   4. Create user tables
 *   5. Sync node (e2e-v2/avail/node.ts) - depends on DB + light client
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

    // ── Avail Dev Node ────────────────────────────────────────────────────────
    {
      name: "avail-node",
      description: "Avail dev node (port 9955)",
      cwd: "e2e/shared/contracts/avail",
      args: ["run", "avail-node:start"],
      stopProcessAtPort: [9955],
      waitToExit: false,
      critical: true,
    },
    {
      name: "avail-node-wait",
      description: "Wait for Avail node RPC",
      cwd: "e2e/shared/contracts/avail",
      args: ["run", "avail-node:wait"],
      waitToExit: true,
      dependsOn: ["avail-node"],
    },

    // ── Avail Light Client (deploy app key + start light client) ──────────────
    {
      name: "avail-light-client-deploy",
      description: "Deploy Avail application key and start light client",
      cwd: "e2e/shared/contracts/avail",
      args: ["run", "avail-light-client:deploy"],
      stopProcessAtPort: [7007],
      waitToExit: false,
      critical: true,
      dependsOn: ["avail-node-wait"],
    },
    {
      name: "avail-light-client-wait",
      description: "Wait for Avail light client (port 7007)",
      cwd: "e2e/shared/contracts/avail",
      args: ["run", "avail-light-client:wait"],
      waitToExit: true,
      dependsOn: ["avail-light-client-deploy"],
    },

    // ── User tables ──────────────────────────────────────────────────────────
    {
      name: "create-user-tables",
      description: "Create user-defined DB tables for STM",
      args: ["run", "e2e-v2/avail/database/create-tables.ts"],
      waitToExit: true,
      critical: true,
      dependsOn: ["apply-migrations"],
    },

    // ── Sync (the node) ──────────────────────────────────────────────────────
    {
      name: "sync",
      description: "E2E-V2 Avail sync node",
      args: ["run", "e2e-v2/avail/node.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [
        "create-user-tables",
        "avail-light-client-wait",
      ],
    },
  ],
} satisfies OrchestratorConfig;
