import type { ProcessConfig } from "../src/config.ts";
import { resolvePackageDir, type ResolveLocation } from "./resolve-package.ts";

export const SolanaNames = {
  SOLANA_VALIDATOR: "solana-validator",
  SOLANA_VALIDATOR_WAIT: "solana-validator-wait",
} as const;

const REQUIRED_SCRIPTS = {
  "chain:start": "Start the Solana test validator",
  "chain:wait": "Wait for the Solana validator RPC to be ready (e.g. tcp:8899)",
} as const;

export function launchSolana(
  packageName: string,
  location: ResolveLocation,
  opts?: { ports?: number[] },
): ProcessConfig[] {
  const cwd = resolvePackageDir(
    "launchSolana",
    packageName,
    location,
    REQUIRED_SCRIPTS,
  );
  const ports = opts?.ports ?? [8899, 9900];

  return [
    {
      stopProcessAtPort: ports,
      name: SolanaNames.SOLANA_VALIDATOR,
      description: `Start Solana test validator (${packageName} chain:start)`,
      cwd,
      args: ["run", "chain:start"],
      waitToExit: false,
      critical: true,
    },
    {
      name: SolanaNames.SOLANA_VALIDATOR_WAIT,
      description: `Wait for Solana validator RPC (${packageName} chain:wait)`,
      cwd,
      args: ["run", "chain:wait"],
      waitToExit: true,
      dependsOn: [SolanaNames.SOLANA_VALIDATOR],
    },
  ];
}
