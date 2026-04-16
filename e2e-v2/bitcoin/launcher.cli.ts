import type { OrchestratorConfig } from "../../packages/build-tools/orchestrator-v2/src/config.ts";

/**
 * Bitcoin-only orchestrator config (orchestrator-v2 format).
 *
 * Infrastructure:
 *   1. PGLite DB -> wait
 *   2. Bitcoin Core regtest -> wait -> mine blocks -> wait-for-block(101+)
 * Node:
 *   3. Sync node (e2e-v2/bitcoin/node.ts)
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

    // ── Bitcoin Core (regtest) ────────────────────────────────────────────────
    {
      name: "bitcoin-core",
      description: "Bitcoin Core regtest node",
      cwd: "e2e-v2/shared/contracts/bitcoin",
      stopProcessAtPort: [18334, 18443],
      args: ["./node_modules/.bin/bitcoin-core"],
      waitToExit: false,
      critical: true,
    },
    {
      name: "bitcoin-core-wait",
      cwd: "e2e-v2/shared/contracts/bitcoin",
      args: ["./node_modules/.bin/wait-on", "tcp:18443"],
      waitToExit: true,
      dependsOn: ["bitcoin-core"],
    },
    {
      name: "bitcoin-mine-blocks",
      description: "Generate blocks continuously",
      cwd: "e2e-v2/shared/contracts/bitcoin",
      args: ["run", "generate:blocks"],
      waitToExit: false,
      type: "system-dependency",
      dependsOn: ["bitcoin-core-wait"],
    },
    {
      name: "bitcoin-wait-for-block",
      description: "Wait for block height > 100",
      cwd: "e2e-v2/shared/contracts/bitcoin",
      args: ["run", "wait-for-block"],
      waitToExit: true,
      dependsOn: ["bitcoin-mine-blocks"],
    },

    // ── Sync (the node) ───────────────────────────────────────────────────────
    {
      name: "sync",
      description: "E2E-V2 Bitcoin sync node",
      args: ["run", "e2e-v2/bitcoin/node.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [
        "pglite-wait",
        "bitcoin-wait-for-block",
      ],
    },

    // ── Batcher ─────────────────────────────────────────────────────────────
    {
      name: "batcher",
      description: "E2E-V2 Bitcoin Batcher",
      stopProcessAtPort: [3334],
      args: ["run", "e2e-v2/bitcoin/batcher/main.ts"],
      waitToExit: false,
      type: "system-dependency",
      dependsOn: ["bitcoin-wait-for-block"],
    },
  ],
} satisfies OrchestratorConfig;
