import type { ProcessConfig } from "../src/config.ts";
import { resolvePackageDir, type ResolveLocation } from "./resolve-package.ts";

export const NearNames = {
  SANDBOX: "near-sandbox",
  SANDBOX_WAIT: "near-sandbox-wait",
} as const;

const REQUIRED_SCRIPTS = {
  "chain:start": "Start the NEAR sandbox node",
  "chain:wait": "Wait for the NEAR sandbox RPC to be ready (e.g. tcp:3030)",
} as const;

export function launchNear(
  packageName: string,
  location: ResolveLocation,
  opts?: { ports?: number[] },
): ProcessConfig[] {
  const cwd = resolvePackageDir("launchNear", packageName, location, REQUIRED_SCRIPTS);
  const ports = opts?.ports ?? [3030];

  return [
    {
      stopProcessAtPort: ports,
      name: NearNames.SANDBOX,
      description: `Start NEAR sandbox node (${packageName} chain:start)`,
      cwd,
      args: ["run", "chain:start"],
      waitToExit: false,
      critical: true,
    },
    {
      name: NearNames.SANDBOX_WAIT,
      description: `Wait for NEAR sandbox RPC (${packageName} chain:wait)`,
      cwd,
      args: ["run", "chain:wait"],
      waitToExit: true,
      dependsOn: [NearNames.SANDBOX],
    },
  ];
}
