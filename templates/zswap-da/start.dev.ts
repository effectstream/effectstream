import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { DbNames, launchPglite } from "@effectstream/orchestrator/launch-pglite";
import {
  launchMidnight,
  MidnightNames,
} from "@effectstream/orchestrator/launch-midnight";

const root = import.meta.dirname!;
const CELESTIA_HOME = "/tmp/celestia-zswap-da-home";

const COMPACT_VERSION = "0.30.0";

const compactCheckScript = `
const { execSync } = require("child_process");
try {
  execSync("compact --version", { stdio: "pipe" });
} catch {
  console.error([
    "",
    "ERROR: 'compact' CLI not found.",
    "",
    "Install it with:",
    "  curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh",
    "  compact update",
    "",
    "(See Dockerfile for full instructions)",
    "",
  ].join("\\n"));
  process.exit(1);
}
const list = execSync("compact list", { encoding: "utf8" });
if (!list.includes("${COMPACT_VERSION}")) {
  console.error([
    "",
    "ERROR: Compact version ${COMPACT_VERSION} is not installed.",
    "",
    "Install it with:",
    "  compact update",
    "",
    "Then verify with:",
    "  compact list",
    "",
  ].join("\\n"));
  process.exit(1);
}
console.log("compact v${COMPACT_VERSION} is available");
`.trim();

const midnightDeps = [MidnightNames.CONTRACT_DEPLOY];

export default {
  processes: [
    {
      name: "compact-check",
      description: `Check that the Compact compiler (v${COMPACT_VERSION}) is installed`,
      args: ["-e", compactCheckScript],
      waitToExit: true,
      critical: true,
    },

    ...launchPglite(),

    {
      name: "compact-build",
      description: "Compile Compact contract (offer-files)",
      cwd: path.join(root, "packages/contracts-midnight/contract-offer-files"),
      args: ["run", "compact"],
      waitToExit: true,
      dependsOn: ["compact-check"],
    },

    ...launchMidnight(
      "@zswap-da/contracts-midnight",
      { cwd: path.join(root, "packages/contracts-midnight") },
      {
        env: { MIDNIGHT_STORAGE_PASSWORD: "YourPasswordMy1!" },
        dependsOn: ["compact-build"],
      },
    ),

    // Celestia devnet — no `launchCelestia` helper exists, so inline the
    // bridge/fund processes against the local @zswap-da/contracts-celestia
    // package.
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
      description: "ZSwap-DA sync node (Celestia + Midnight)",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [
        DbNames.PGLITE_WAIT,
        "celestia-fund-bridge",
        ...midnightDeps,
      ],
    },

    {
      name: "batcher",
      description: "ZSwap-DA balancing batcher (Celestia + Midnight, port 3334)",
      args: ["run", "packages/batcher/batcher.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:3334",
      stopProcessAtPort: [3334],
      dependsOn: [...midnightDeps],
    },

    {
      name: "frontend-build",
      description: "Build frontend",
      cwd: path.join(root, "packages/frontend"),
      args: ["run", "build"],
      waitToExit: true,
      type: "system-dependency",
      critical: true,
      dependsOn: [...midnightDeps],
    },

    {
      name: "frontend-server",
      description: "Serve frontend",
      cwd: path.join(root, "packages/frontend"),
      args: ["run", "serve"],
      waitToExit: false,
      type: "system-dependency",
      critical: true,
      link: "http://localhost:10599",
      stopProcessAtPort: [10599],
      dependsOn: ["frontend-build"],
    },
  ],
} satisfies OrchestratorConfig;
