import { spawnSync } from "node:child_process";
import type { ProcessConfig } from "../src/config.ts";
import { resolvePackageDir, type ResolveLocation } from "./resolve-package.ts";

/**
 * Midnight's `compact` compiler is required to compile the Compact contracts
 * (the midnight-contract:deploy step). It is a system toolchain, not an npm
 * dependency, so verify it is on PATH up front and stop with an actionable
 * message instead of failing with a cryptic "command not found" mid-deploy.
 * Install tips mirror .github/Dockerfile.
 */
function assertCompactInstalled(): void {
  const found = spawnSync("compact", ["--version"], { stdio: "ignore" });
  if (found.status === 0) return;
  throw new Error(
    [
      "",
      "Midnight's `compact` compiler was not found on your PATH, but it is required to compile the Midnight contracts.",
      "",
      "  Install Compact from:  https://github.com/midnightntwrk/compact",
      "",
      "  (quick install)        curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh",
      "                         compact update 0.31.0",
      "",
    ].join("\n"),
  );
}

export const MidnightNames = {
  NODE: "midnight-node",
  NODE_WAIT: "midnight-node-wait",
  INDEXER: "midnight-indexer",
  INDEXER_WAIT: "midnight-indexer-wait",
  PROOF_SERVER: "midnight-proof-server",
  PROOF_SERVER_WAIT: "midnight-proof-server-wait",
  CONTRACT_DEPLOY: "midnight-contract",
} as const;

const REQUIRED_SCRIPTS = {
  "midnight-node:start": "Start the Midnight substrate node",
  "midnight-node:wait": "Wait for the Midnight node RPC (e.g. tcp:9944)",
  "midnight-indexer:start": "Start the Midnight indexer",
  "midnight-indexer:wait": "Wait for the Midnight indexer (e.g. tcp:8088)",
  "midnight-proof-server:start": "Start the Midnight proof server",
  "midnight-proof-server:wait": "Wait for the Midnight proof server (e.g. tcp:6300)",
  "midnight-contract:deploy": "Deploy Midnight contracts (Compact-compiled)",
} as const;

export function launchMidnight(
  packageName: string,
  location: ResolveLocation,
  opts?: {
    env?: { MIDNIGHT_STORAGE_PASSWORD?: string };
    dependsOn?: string[];
  },
): ProcessConfig[] {
  const cwd = resolvePackageDir("launchMidnight", packageName, location, REQUIRED_SCRIPTS);
  assertCompactInstalled();
  const deployEnv: Record<string, string> = {};
  if (opts?.env?.MIDNIGHT_STORAGE_PASSWORD) {
    deployEnv.MIDNIGHT_STORAGE_PASSWORD = opts.env.MIDNIGHT_STORAGE_PASSWORD;
  }
  const extraDeps = opts?.dependsOn ?? [];

  return [
    {
      name: MidnightNames.NODE,
      description: `Start Midnight node (${packageName} midnight-node:start)`,
      cwd,
      stopProcessAtPort: [9944, 30333],
      args: ["run", "midnight-node:start"],
      waitToExit: false,
      critical: true,
    },
    {
      name: MidnightNames.INDEXER,
      description: `Start Midnight indexer (${packageName} midnight-indexer:start)`,
      cwd,
      stopProcessAtPort: [8088],
      args: ["run", "midnight-indexer:start"],
      waitToExit: false,
      critical: true,
      dependsOn: [MidnightNames.NODE],
    },
    {
      name: MidnightNames.PROOF_SERVER,
      description: `Start Midnight proof server (${packageName} midnight-proof-server:start)`,
      cwd,
      stopProcessAtPort: [6300],
      args: ["run", "midnight-proof-server:start"],
      waitToExit: false,
      critical: true,
      dependsOn: [MidnightNames.NODE],
    },
    {
      name: MidnightNames.NODE_WAIT,
      description: `Wait for Midnight node (${packageName} midnight-node:wait)`,
      cwd,
      args: ["run", "midnight-node:wait"],
      waitToExit: true,
      dependsOn: [MidnightNames.NODE],
    },
    {
      name: MidnightNames.INDEXER_WAIT,
      description: `Wait for Midnight indexer (${packageName} midnight-indexer:wait)`,
      cwd,
      args: ["run", "midnight-indexer:wait"],
      waitToExit: true,
      dependsOn: [MidnightNames.INDEXER],
    },
    {
      name: MidnightNames.PROOF_SERVER_WAIT,
      description: `Wait for Midnight proof server (${packageName} midnight-proof-server:wait)`,
      cwd,
      args: ["run", "midnight-proof-server:wait"],
      waitToExit: true,
      dependsOn: [MidnightNames.PROOF_SERVER],
    },
    {
      name: MidnightNames.CONTRACT_DEPLOY,
      description: `Deploy Midnight contracts (${packageName} midnight-contract:deploy)`,
      cwd,
      args: ["run", "midnight-contract:deploy"],
      ...(Object.keys(deployEnv).length > 0 ? { env: deployEnv } : {}),
      waitToExit: true,
      dependsOn: [
        MidnightNames.NODE_WAIT,
        MidnightNames.INDEXER_WAIT,
        MidnightNames.PROOF_SERVER_WAIT,
        ...extraDeps,
      ],
    },
  ];
}
