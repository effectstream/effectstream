import type { OrchestratorConfig } from "../../packages/build-tools/orchestrator-v2/src/config.ts";

const CELESTIA_HOME = "/tmp/celestia-e2e-home";

/**
 * Celestia orchestrator config (orchestrator-v2 format).
 *
 * Infrastructure:
 *   1. PGLite DB -> wait
 *   2. Celestia devnet (consensus node on 26657 + bridge on 26658)
 *   3. Wait for bridge RPC
 *   4. Fund bridge node wallet with tokens
 * Node:
 *   5. Sync node (e2e-v2/celestia/node.ts) - depends on DB + funded bridge
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

    // ── Celestia Infrastructure ───────────────────────────────────────────────
    {
      name: "celestia-devnet",
      description: "Celestia consensus node + bridge (ports 26657, 26658)",
      cwd: "e2e-v2/shared/contracts/celestia",
      stopProcessAtPort: [26657, 26658],
      args: ["run", "celestia-bridge:start"],
      env: { CELESTIA_HOME, CELESTIA_FORCE_NO_BBR: process.env.CELESTIA_FORCE_NO_BBR || "" },
      waitToExit: false,
      critical: true,
    },
    {
      name: "celestia-bridge-wait",
      description: "Wait for Celestia bridge RPC on port 26658",
      cwd: "e2e-v2/shared/contracts/celestia",
      args: ["run", "celestia-bridge:wait"],
      waitToExit: true,
      dependsOn: ["celestia-devnet"],
    },
    {
      name: "celestia-fund-bridge",
      description: "Fund the bridge node wallet with tokens",
      cwd: "e2e-v2/shared/contracts/celestia",
      args: ["run", "celestia-fund:bridge"],
      env: { CELESTIA_HOME },
      waitToExit: true,
      critical: true,
      dependsOn: ["celestia-bridge-wait"],
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
        "pglite-wait",
        "celestia-fund-bridge",
      ],
    },
  ],
} satisfies OrchestratorConfig;
