import type { ProcessConfig } from "../src/config.ts";
import { resolvePackageDir } from "./resolve-package.ts";

export const EvmNames = {
  HARDHAT: "hardhat",
  HARDHAT_WAIT: "hardhat-wait",
  COMPILE: "compile-evm-contracts",
  DEPLOY: "deploy-evm-contracts",
  GENERATE_MOD: "generate-evm-mod",
} as const;

const REQUIRED_SCRIPTS = {
  "chain:start": "Start the Hardhat node (e.g. `bun ./node_modules/.bin/hardhat node`)",
  "chain:wait": "Wait for the Hardhat node to be ready (e.g. `bun ./node_modules/.bin/hardhat node wait`)",
  "build:hardhat": "Compile Solidity contracts with Hardhat (e.g. `hardhat compile`)",
  "deploy": "Deploy compiled contracts to the running chain (e.g. via Hardhat Ignition)",
} as const;

export function launchEvm(
  packageName: string,
  resolveFrom: string,
  opts?: { ports?: number[] },
): ProcessConfig[] {
  const cwd = resolvePackageDir("launchEvm", packageName, resolveFrom, REQUIRED_SCRIPTS);
  const ports = opts?.ports ?? [8545, 8546];

  return [
    {
      stopProcessAtPort: ports,
      name: EvmNames.HARDHAT,
      description: `Start the Hardhat node (${packageName} chain:start)`,
      cwd,
      args: ["run", "chain:start"],
      waitToExit: false,
      critical: true,
    },
    {
      name: EvmNames.HARDHAT_WAIT,
      description: `Wait for the Hardhat node to be ready (${packageName} chain:wait)`,
      cwd,
      args: ["run", "chain:wait"],
      waitToExit: true,
      dependsOn: [EvmNames.HARDHAT],
    },
    {
      name: EvmNames.COMPILE,
      description: `Compile Solidity contracts (${packageName} build:hardhat)`,
      cwd,
      args: ["run", "build:hardhat"],
      waitToExit: true,
      critical: true,
    },
    {
      name: EvmNames.DEPLOY,
      description: `Deploy contracts to the running chain (${packageName} deploy)`,
      cwd,
      args: ["run", "deploy"],
      waitToExit: true,
      critical: true,
      dependsOn: [EvmNames.HARDHAT_WAIT, EvmNames.COMPILE],
    },
    {
      name: EvmNames.GENERATE_MOD,
      description: `Generate TypeScript bindings from deployed contracts (${packageName})`,
      cwd,
      args: ["-e", "const fs=await import('node:fs');await fs.promises.mkdir('./build',{recursive:true});await fs.promises.writeFile('./build/mod.ts','export {};\\n');await import('@effectstream/evm-hardhat/builder')"],
      waitToExit: true,
      critical: true,
      dependsOn: [EvmNames.DEPLOY],
    },
  ];
}
