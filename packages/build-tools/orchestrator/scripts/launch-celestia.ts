import type { ProcessConfig } from "../src/config.ts";
import { resolvePackageDir, type ResolveLocation } from "./resolve-package.ts";

export const CelestiaNames = {
  CLEAN:       "celestia-clean",
  DEVNET:      "celestia-devnet",
  BRIDGE_WAIT: "celestia-bridge-wait",
  FUND:        "celestia-fund-bridge",
} as const;

const REQUIRED_SCRIPTS = {
  "celestia-bridge:start": "Start the Celestia consensus node + bridge",
  "celestia-bridge:wait":  "Wait for the Celestia bridge RPC to be ready",
  "celestia-fund:bridge":  "Fund the bridge node wallet with tokens",
} as const;

export function launchCelestia(
  packageName: string,
  location: ResolveLocation,
  opts?: { ports?: number[]; home?: string },
): ProcessConfig[] {
  const cwd   = resolvePackageDir("launchCelestia", packageName, location, REQUIRED_SCRIPTS);
  const ports = opts?.ports ?? [26657, 26658];
  const home  = opts?.home  ?? "/tmp/celestia-home";

  const cleanScript =
    `await import('fs').then(fs => { try { fs.rmSync('${home}', { recursive: true, force: true }); } catch {} }); console.log('Celestia home cleaned');`;

  return [
    {
      name: CelestiaNames.CLEAN,
      description: "Remove stale Celestia devnet data",
      args: ["-e", cleanScript],
      waitToExit: true,
    },
    {
      name: CelestiaNames.DEVNET,
      description: `Celestia consensus node + bridge (${packageName} celestia-bridge:start)`,
      cwd,
      stopProcessAtPort: ports,
      args: ["run", "celestia-bridge:start"],
      env: { CELESTIA_HOME: home, CELESTIA_FORCE_NO_BBR: "1" },
      waitToExit: false,
      critical: true,
      silent: true,
      dependsOn: [CelestiaNames.CLEAN],
    },
    {
      name: CelestiaNames.BRIDGE_WAIT,
      description: `Wait for Celestia bridge RPC (${packageName} celestia-bridge:wait)`,
      cwd,
      args: ["run", "celestia-bridge:wait"],
      waitToExit: true,
      dependsOn: [CelestiaNames.DEVNET],
    },
    {
      name: CelestiaNames.FUND,
      description: `Fund the Celestia bridge wallet (${packageName} celestia-fund:bridge)`,
      cwd,
      args: ["run", "celestia-fund:bridge"],
      env: { CELESTIA_HOME: home },
      waitToExit: true,
      critical: true,
      dependsOn: [CelestiaNames.BRIDGE_WAIT],
    },
  ];
}
