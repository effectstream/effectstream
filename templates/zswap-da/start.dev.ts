import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { DbNames, launchPglite } from "@effectstream/orchestrator/launch-pglite";
import {
  launchMidnight,
  MidnightNames,
} from "@effectstream/orchestrator/launch-midnight";
import {
  launchCelestia,
  CelestiaNames,
} from "@effectstream/orchestrator/launch-celestia";

const root = import.meta.dirname!;

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
    "  compact update ${COMPACT_VERSION}",
    "",
  ].join("\\n"));
  process.exit(1);
}
// "compact list" occasionally hangs forever (CLI quirk); the CLI itself
// already responded to --version above, so treat a hung list as non-fatal.
let list = "";
try {
  list = execSync("compact list", { encoding: "utf8", timeout: 30000 });
} catch {
  console.log("compact list timed out — compact CLI responds, continuing");
  process.exit(0);
}
if (!list.includes("${COMPACT_VERSION}")) {
  console.error([
    "",
    "ERROR: Compact version ${COMPACT_VERSION} is not installed.",
    "",
    "Install it with:",
    "  compact update ${COMPACT_VERSION}",
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

    {
      name: "midnight-mint-test-tokens",
      description: "Mint dev test tokens (2 shielded + 1 unshielded) via the offer-files contract",
      cwd: path.join(root, "packages/contracts-midnight"),
      args: ["run", "mint-test-tokens.ts"],
      waitToExit: true,
      // NOT critical: a mint hiccup must not tear the dev stack down.
      dependsOn: [MidnightNames.CONTRACT_DEPLOY],
    },

    ...launchCelestia(
      "@zswap-da/contracts-celestia",
      { cwd: path.join(root, "packages/contracts-celestia") },
      { home: "/tmp/celestia-zswap-da-home" },
    ),

    {
      name: "sync",
      description: "ZSwap-DA sync node (Celestia + Midnight)",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [
        DbNames.PGLITE_WAIT,
        CelestiaNames.FUND,
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
