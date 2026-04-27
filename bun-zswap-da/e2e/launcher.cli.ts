import type { OrchestratorConfig } from "@effectstream/orchestrator-v2/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator-v2/launch-pglite";

const CELESTIA_HOME = "/tmp/celestia-e2e-zswap-home";
const USE_CELESTIA_MAINNET = process.env["CELESTIA_NETWORK"] === "mainnet";

/**
 * ZSwap-DA e2e orchestrator: combined Celestia + Midnight infrastructure.
 *
 * 1. PGLite DB -> migrations -> user tables
 * 2. Celestia devnet -> bridge wait -> fund bridge
 * 3. Midnight node -> indexer -> proof server -> wait all
 * 4. Compile + deploy offer-files contract
 * 5. Sync node (reads from both chains)
 */
export default {
  logDir: "bun-zswap-da/logs",
  processes: [
    // ── Database ──────────────────────────────────────────────────────────────
    ...launchPglite(),
    {
      name: "apply-migrations",
      description: "Apply database migrations",
      args: ["-e", "await import('@effectstream/db/apply-migrations')"],
      waitToExit: true,
      critical: true,
      dependsOn: [DbNames.PGLITE_WAIT],
    },
    // Note: when using the full node (packages/node/main.ts), user tables are
    // created by the node's migration system. When using e2e/node.ts, uncomment
    // the create-user-tables step below.
    // {
    //   name: "create-user-tables",
    //   description: "Create ZSwap-DA user tables",
    //   args: ["run", "bun-zswap-da/e2e/database/create-tables.ts"],
    //   waitToExit: true,
    //   critical: true,
    //   dependsOn: ["apply-migrations"],
    // },

    // ── Compile Midnight offer-files contract ─────────────────────────────────
    {
      name: "compile-midnight-offer-files",
      description: "Compile offer-files contract with Compact",
      cwd: "bun-zswap-da/packages/midnight-contracts/contract-offer-files",
      args: ["run", "compact"],
      waitToExit: true,
      critical: true,
    },

    // ── Celestia Infrastructure (devnet only; skipped in --celestia-mainnet) ─
    ...(USE_CELESTIA_MAINNET ? [] : [
      {
        name: "celestia-clean",
        description: "Remove stale Celestia devnet data",
        args: ["-e", `await import('fs').then(fs => { try { fs.rmSync('${CELESTIA_HOME}', { recursive: true, force: true }); } catch {} }); console.log('Celestia home cleaned');`],
        waitToExit: true,
      },
      {
        name: "celestia-devnet",
        description: "Celestia consensus node + bridge (ports 26657, 26658)",
        cwd: "e2e-v2/shared/contracts/celestia",
        stopProcessAtPort: [26657, 26658],
        args: ["run", "celestia-bridge:start"],
        env: { CELESTIA_HOME, CELESTIA_FORCE_NO_BBR: process.env.CELESTIA_FORCE_NO_BBR || "" },
        waitToExit: false,
        critical: true,
        silent: true,
        dependsOn: ["celestia-clean"],
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
    ] as const),

    // ── Midnight Infrastructure ───────────────────────────────────────────────
    {
      name: "midnight-node",
      cwd: "e2e-v2/shared/contracts/midnight",
      stopProcessAtPort: [9944, 30333],
      args: ["run", "midnight-node:start"],
      waitToExit: false,
      critical: true,
      silent: true,
    },
    {
      name: "midnight-indexer",
      cwd: "e2e-v2/shared/contracts/midnight",
      stopProcessAtPort: [8088],
      args: ["run", "midnight-indexer:start"],
      waitToExit: false,
      critical: true,
      silent: true,
      dependsOn: ["midnight-node"],
    },
    {
      name: "midnight-proof-server",
      cwd: "e2e-v2/shared/contracts/midnight",
      stopProcessAtPort: [6300],
      args: ["run", "midnight-proof-server:start"],
      waitToExit: false,
      critical: true,
      silent: true,
      dependsOn: ["midnight-node"],
    },
    {
      name: "midnight-node-wait",
      cwd: "e2e-v2/shared/contracts/midnight",
      args: ["run", "midnight-node:wait"],
      waitToExit: true,
      dependsOn: ["midnight-node"],
    },
    {
      name: "midnight-indexer-wait",
      cwd: "e2e-v2/shared/contracts/midnight",
      args: ["run", "midnight-indexer:wait"],
      waitToExit: true,
      dependsOn: ["midnight-indexer"],
    },
    {
      name: "midnight-proof-server-wait",
      cwd: "e2e-v2/shared/contracts/midnight",
      args: ["run", "midnight-proof-server:wait"],
      waitToExit: true,
      dependsOn: ["midnight-proof-server"],
    },

    // ── Deploy offer-files contract ───────────────────────────────────────────
    {
      name: "midnight-contract-deploy",
      description: "Deploy offer-files contract to Midnight",
      cwd: "bun-zswap-da/packages/midnight-contracts",
      args: ["run", "midnight-contract:deploy"],
      waitToExit: true,
      env: {
        MIDNIGHT_STORAGE_PASSWORD: process.env["MIDNIGHT_STORAGE_PASSWORD"] ?? "YourPasswordMy1!",
      },
      dependsOn: [
        "midnight-node-wait",
        "midnight-indexer-wait",
        "midnight-proof-server-wait",
        "compile-midnight-offer-files",
      ],
    },

    // ── Sync node ─────────────────────────────────────────────────────────────
    {
      name: "sync",
      description: "ZSwap-DA sync node (Celestia + Midnight)",
      args: ["run", "bun-zswap-da/packages/node/main.ts"],
      waitToExit: false,
      type: "system-dependency" as const,
      env: { PGLITE: "true" },
      dependsOn: [
        "apply-migrations",
        ...(USE_CELESTIA_MAINNET ? [] : ["celestia-fund-bridge"]),
        "midnight-contract-deploy",
      ],
    },

    // ── Balancing batcher ─────────────────────────────────────────────────────
    // Pays Midnight fees on behalf of browser-wallet flows (mint + offer
    // completion). Uses a dedicated seed (not alice) to avoid colliding with
    // the sync node's wallet subscription.
    {
      name: "batcher",
      description: "ZSwap-DA balancing batcher (port 3334)",
      stopProcessAtPort: [3334],
      args: ["run", "bun-zswap-da/packages/batcher/src/main.ts"],
      waitToExit: false,
      type: "system-dependency" as const,
      dependsOn: [
        "midnight-node-wait",
        "midnight-indexer-wait",
        "midnight-proof-server-wait",
      ],
    },
  ],
} satisfies OrchestratorConfig;
