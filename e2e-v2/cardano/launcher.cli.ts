import type { OrchestratorConfig } from "../../packages/build-tools/orchestrator-v2/src/config.ts";

/**
 * Cardano-only orchestrator config (orchestrator-v2 format).
 *
 * Infrastructure:
 *   1. PGLite DB -> wait
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

    // ── Cardano (YACI DevKit + Dolos) ─────────────────────────────────────────
    { name: "yaci-devkit", stopProcessAtPort: [8090, 10000, 3001], cwd: "e2e-v2/shared/contracts/cardano", args: ["run", "devkit:start"], waitToExit: false, type: "system-dependency" as const },
    { name: "yaci-devkit-wait", cwd: "e2e-v2/shared/contracts/cardano", args: ["run", "devkit:wait"], waitToExit: true, dependsOn: ["yaci-devkit"] },
    { name: "dolos-fill-template", cwd: "e2e-v2/shared/contracts/cardano", args: ["run", "dolos:fill-template"], waitToExit: true, dependsOn: ["yaci-devkit-wait"] },
    { name: "dolos", cwd: "e2e-v2/shared/contracts/cardano", args: ["run", "dolos:start"], waitToExit: false, type: "system-dependency" as const, dependsOn: ["dolos-fill-template"] },
    { name: "dolos-wait", cwd: "e2e-v2/shared/contracts/cardano", args: ["run", "dolos:wait"], waitToExit: true, dependsOn: ["dolos"] },
    { name: "dolos-minibf-wait", description: "Wait for Dolos blockfrost API on port 3000", args: ["./node_modules/.bin/wait-on", "http://localhost:3000/blocks/latest", "--timeout", "60000"], waitToExit: true, dependsOn: ["dolos-wait"] },

    // ── Submit transactions (deploy & call Aiken contract) ──────────────────
    { name: "cardano-submit-tx", description: "Submit test transactions via YACI topup", cwd: "e2e-v2/shared/contracts/cardano", args: ["run", "cardano-submit-tx"], waitToExit: true, critical: true, dependsOn: ["yaci-devkit-wait"] },

    // ── Sync (the node) ───────────────────────────────────────────────────────
    {
      name: "sync",
      description: "E2E-V2 Cardano sync node",
      args: ["run", "e2e-v2/cardano/node.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [
        "pglite-wait",
        "cardano-submit-tx",
        "dolos-minibf-wait",
      ],
    },
  ],
} satisfies OrchestratorConfig;
