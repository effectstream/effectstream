import type { ProcessConfig } from "../src/config.ts";
import { resolvePackageDir } from "./resolve-package.ts";

export const BitcoinNames = {
  BITCOIN_CORE: "bitcoin-core",
  BITCOIN_CORE_WAIT: "bitcoin-core-wait",
  BITCOIN_MINE_BLOCKS: "bitcoin-mine-blocks",
  BITCOIN_WAIT_FOR_BLOCK: "bitcoin-wait-for-block",
} as const;

const REQUIRED_SCRIPTS = {
  "chain:start": "Start Bitcoin Core in regtest mode",
  "chain:wait": "Wait for Bitcoin Core RPC to be ready",
  "generate:blocks": "Continuously generate regtest blocks",
  "wait-for-block": "Wait until block height exceeds a threshold (e.g. > 100)",
} as const;

export function launchBitcoin(
  packageName: string,
  resolveFrom: string,
  opts?: { ports?: number[] },
): ProcessConfig[] {
  const cwd = resolvePackageDir("launchBitcoin", packageName, resolveFrom, REQUIRED_SCRIPTS);
  const ports = opts?.ports ?? [18334, 18443];

  return [
    {
      stopProcessAtPort: ports,
      name: BitcoinNames.BITCOIN_CORE,
      description: `Start Bitcoin Core regtest node (${packageName} chain:start)`,
      cwd,
      args: ["run", "chain:start"],
      waitToExit: false,
      critical: true,
    },
    {
      name: BitcoinNames.BITCOIN_CORE_WAIT,
      description: `Wait for Bitcoin Core RPC (${packageName} chain:wait)`,
      cwd,
      args: ["run", "chain:wait"],
      waitToExit: true,
      dependsOn: [BitcoinNames.BITCOIN_CORE],
    },
    {
      name: BitcoinNames.BITCOIN_MINE_BLOCKS,
      description: `Generate blocks continuously (${packageName} generate:blocks)`,
      cwd,
      args: ["run", "generate:blocks"],
      waitToExit: false,
      type: "system-dependency",
      dependsOn: [BitcoinNames.BITCOIN_CORE_WAIT],
    },
    {
      name: BitcoinNames.BITCOIN_WAIT_FOR_BLOCK,
      description: `Wait for block height > 100 (${packageName} wait-for-block)`,
      cwd,
      args: ["run", "wait-for-block"],
      waitToExit: true,
      dependsOn: [BitcoinNames.BITCOIN_MINE_BLOCKS],
    },
  ];
}
