import type { OrchestratorConfig } from "../../packages/build-tools/orchestrator-v2/src/config.ts";

/**
 * EVM-only orchestrator config (orchestrator-v2 format).
 *
 * Infrastructure:
 *   1. PGLite DB -> wait
 *   2. Hardhat node (chain 31337 + 31338) -> wait -> deploy contracts
 * Node:
 *   3. Sync node (e2e-v2/evm/node.ts) - depends on both DB and contracts
 */
export default {
  processes: [
    // ── Database ──────────────────────────────────────────────────────────────
    {
      name: "pglite",
      description: "PGLite embedded database",
      args: ["-e", "process.argv.splice(1, 0, '_'); await import('@effectstream/db/start-pglite')", "--port", "5432"],
      stopProcessAtPort: [5432],
      waitToExit: false,
      critical: true,
    },
    {
      name: "pglite-wait",
      args: ["./node_modules/.bin/wait-on", "tcp:5432"],
      waitToExit: true,
      dependsOn: ["pglite"],
    },

    // ── EVM Chains (Hardhat) ──────────────────────────────────────────────────
    {
      name: "hardhat",
      description: "Hardhat node (chain 31337 + 31338)",
      cwd: "e2e-v2/shared/contracts/evm",
      stopProcessAtPort: [8545, 8546],
      args: ["./node_modules/.bin/hardhat", "node"],
      waitToExit: false,
      critical: true,
    },
    {
      name: "hardhat-wait",
      cwd: "e2e-v2/shared/contracts/evm",
      args: ["./node_modules/.bin/hardhat", "node", "wait"],
      waitToExit: true,
      dependsOn: ["hardhat"],
    },
    {
      name: "compile-evm-contracts",
      description: "Compile Solidity contracts",
      cwd: "e2e-v2/shared/contracts/evm",
      args: ["run", "build:hardhat"],
      waitToExit: true,
      critical: true,
    },
    {
      name: "deploy-evm-contracts",
      description: "Deploy EVM contracts via Hardhat Ignition",
      cwd: "e2e-v2/shared/contracts/evm",
      args: ["run", "deploy"],
      waitToExit: true,
      critical: true,
      dependsOn: ["hardhat-wait", "compile-evm-contracts"],
    },
    {
      name: "generate-evm-mod",
      description: "Generate mod.ts for @e2e-v2/evm-contracts",
      cwd: "e2e-v2/shared/contracts/evm",
      args: ["-e", "const fs=await import('node:fs');await fs.promises.mkdir('./build',{recursive:true});await fs.promises.writeFile('./build/mod.ts','export {};\\n');await import('@effectstream/evm-hardhat/builder')"],
      waitToExit: true,
      critical: true,
      dependsOn: ["deploy-evm-contracts"],
    },

    // ── Sync (the node) ───────────────────────────────────────────────────────
    {
      name: "sync",
      description: "E2E-V2 EVM sync node",
      args: ["run", "e2e-v2/evm/node.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [
        "pglite-wait",
        "generate-evm-mod",
      ],
    },

    // ── Batcher ─────────────────────────────────────────────────────────────
    {
      name: "batcher",
      description: "E2E-V2 EVM Batcher (PaimaL2 + Counter adapters)",
      stopProcessAtPort: [3334],
      args: ["run", "e2e-v2/evm/batcher/main.ts"],
      waitToExit: false,
      type: "system-dependency",
      dependsOn: ["generate-evm-mod"],
    },
  ],
} satisfies OrchestratorConfig;
