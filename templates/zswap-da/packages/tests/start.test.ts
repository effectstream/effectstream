import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { DbNames, launchPglite } from "@effectstream/orchestrator/launch-pglite";
import {
  launchMidnight,
  MidnightNames,
} from "@effectstream/orchestrator/launch-midnight";

const root = path.resolve(import.meta.dirname!, "../..");
const CELESTIA_HOME = "/tmp/celestia-test-zswap-home";

const midnightDeps = [MidnightNames.CONTRACT_DEPLOY];

export default {
  processes: [
    ...launchPglite(),

    {
      name: "compact-build",
      description: "Compile Compact contract (offer-files)",
      cwd: path.join(root, "packages/contracts-midnight/contract-offer-files"),
      args: ["run", "compact"],
      waitToExit: true,
    },

    ...launchMidnight(
      "@zswap-da/contracts-midnight",
      { cwd: path.join(root, "packages/contracts-midnight") },
      {
        env: { MIDNIGHT_STORAGE_PASSWORD: "YourPasswordMy1!" },
        dependsOn: ["compact-build"],
      },
    ),

    // Celestia devnet (no launchCelestia helper exists yet).
    {
      name: "celestia-clean",
      description: "Remove stale Celestia devnet data",
      args: [
        "-e",
        `await import('fs').then(fs => { try { fs.rmSync('${CELESTIA_HOME}', { recursive: true, force: true }); } catch {} }); console.log('Celestia home cleaned');`,
      ],
      waitToExit: true,
    },
    {
      name: "celestia-devnet",
      description: "Celestia consensus node + bridge (ports 26657, 26658)",
      cwd: path.join(root, "packages/contracts-celestia"),
      stopProcessAtPort: [26657, 26658],
      args: ["run", "celestia-bridge:start"],
      env: {
        CELESTIA_HOME,
        CELESTIA_FORCE_NO_BBR: process.env.CELESTIA_FORCE_NO_BBR || "",
      },
      waitToExit: false,
      critical: true,
      silent: true,
      dependsOn: ["celestia-clean"],
    },
    {
      name: "celestia-bridge-wait",
      description: "Wait for Celestia bridge RPC on port 26658",
      cwd: path.join(root, "packages/contracts-celestia"),
      args: ["run", "celestia-bridge:wait"],
      waitToExit: true,
      dependsOn: ["celestia-devnet"],
    },
    {
      name: "celestia-fund-bridge",
      description: "Fund the bridge node wallet with tokens",
      cwd: path.join(root, "packages/contracts-celestia"),
      args: ["run", "celestia-fund:bridge"],
      env: { CELESTIA_HOME },
      waitToExit: true,
      critical: true,
      dependsOn: ["celestia-bridge-wait"],
    },

    {
      name: "sync",
      description: "ZSwap-DA sync node (test)",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true", ENABLE_DEV_AND_DEBUG_ENDPOINTS: "true" },
      dependsOn: [
        DbNames.PGLITE_WAIT,
        "celestia-fund-bridge",
        ...midnightDeps,
      ],
    },

    {
      name: "batcher",
      description: "ZSwap-DA balancing batcher (port 3334)",
      args: ["run", "packages/batcher/batcher.dev.ts"],
      stopProcessAtPort: [3334],
      waitToExit: false,
      type: "system-dependency",
      dependsOn: [...midnightDeps],
    },
  ],
} satisfies OrchestratorConfig;
