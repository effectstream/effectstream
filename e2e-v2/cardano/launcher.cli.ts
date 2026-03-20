import type { OrchestratorConfig } from "../../packages/build-tools/orchestrator-v2/src/config.ts";

/**
 * Cardano-only orchestrator config (orchestrator-v2 format).
 *
 * Infrastructure:
 *   1. PGLite DB -> wait -> apply migrations -> create user tables
 *   2. YACI DevKit -> wait -> Dolos fill-template -> Dolos -> wait
 * Node:
 *   3. Sync node (e2e-v2/cardano/node.ts) - depends on both DB and Dolos
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

    // ── User tables (created before sync to avoid PGLite PREPARE issues) ────
    {
      name: "create-user-tables",
      description: "Create user-defined DB tables for STM",
      args: ["run", "e2e-v2/cardano/database/create-tables.ts"],
      waitToExit: true,
      critical: true,
      dependsOn: ["apply-migrations"],
    },

    // ── Cardano (YACI DevKit + Dolos) ─────────────────────────────────────────
    {
      name: "yaci-devkit",
      description: "Cardano YACI DevKit node",
      cwd: "e2e/shared/contracts/cardano",
      stopProcessAtPort: [8090, 10000, 3001],
      args: ["run", "devkit:start"],
      waitToExit: false,
      type: "system-dependency",
    },
    {
      name: "yaci-devkit-wait",
      cwd: "e2e/shared/contracts/cardano",
      args: ["run", "devkit:wait"],
      waitToExit: true,
      dependsOn: ["yaci-devkit"],
    },
    {
      name: "dolos-fill-template",
      description: "Fetch genesis files and generate Dolos config",
      cwd: "e2e/shared/contracts/cardano",
      args: ["run", "dolos:fill-template"],
      waitToExit: true,
      dependsOn: ["yaci-devkit-wait"],
    },
    {
      name: "dolos",
      description: "Cardano Dolos relay node",
      cwd: "e2e/shared/contracts/cardano",
      stopProcessAtPort: [3000, 50051],
      args: ["run", "dolos:start"],
      waitToExit: false,
      type: "system-dependency",
      dependsOn: ["dolos-fill-template"],
    },
    {
      name: "dolos-wait",
      cwd: "e2e/shared/contracts/cardano",
      args: ["run", "dolos:wait"],
      waitToExit: true,
      dependsOn: ["dolos"],
    },

    // ── Sync (the node) ───────────────────────────────────────────────────────
    {
      name: "sync",
      description: "E2E-V2 Cardano sync node",
      args: ["run", "e2e-v2/cardano/node.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [
        "create-user-tables",
        "dolos-wait",
      ],
    },
  ],
} satisfies OrchestratorConfig;
