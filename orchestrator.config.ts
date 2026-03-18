// NOTE: This is a SAMPLE FILE.
//       Each app, e2e, launcher should have it's own orchestrator.config.ts file.

/**
 * orchestrator-v2 config for local quickstart development.
 *
 * Run with (from repo root):
 *   bun packages/build-tools/orchestrator-v2/src/cli.ts start
 *   bun packages/build-tools/orchestrator-v2/src/cli.ts start --only=hardhat,deploy-evm-contracts
 *   bun packages/build-tools/orchestrator-v2/src/cli.ts status
 *   bun packages/build-tools/orchestrator-v2/src/cli.ts restart midnight-node
 *
 * Feature flags (set env vars to disable optional chains):
 *   DISABLE_EVM=true  DISABLE_MIDNIGHT=true  DISABLE_BITCOIN=true  DISABLE_CARDANO=true  DISABLE_AVAIL=true
 */

import type { OrchestratorConfig } from "./packages/build-tools/orchestrator-v2/src/config.ts";

const evm_enabled      = process.env["DISABLE_EVM"]      !== "true";
const midnight_enabled = process.env["DISABLE_MIDNIGHT"] !== "true";
const bitcoin_enabled  = process.env["DISABLE_BITCOIN"]  !== "true";
const cardano_enabled  = process.env["DISABLE_CARDANO"]  !== "true";
const avail_enabled    = process.env["DISABLE_AVAIL"]    !== "true";

export default {
  apiPort: 4747,

  processes: [
    // ── EVM / Hardhat (optional) ──────────────────────────────────────────────
    ...(evm_enabled ? [
      {
        name: "hardhat",
        description: "Local Hardhat EVM chain",
        cwd: "e2e/shared/contracts/evm",
        stopProcessAtPort: [8545, 8546],
        args: ["run", "chain:start"],
        waitToExit: false,
        type: "system-dependency" as const,
      },
      {
        name: "hardhat-wait",
        cwd: "e2e/shared/contracts/evm",
        args: ["run", "chain:wait"],
        waitToExit: true,
        dependsOn: ["hardhat"],
      },
      {
        name: "build-evm-contracts",
        description: "Compile Solidity contracts",
        cwd: "e2e/shared/contracts/evm",
        args: ["run", "build"],
        waitToExit: true,
        dependsOn: ["hardhat-wait"],
      },
      {
        name: "deploy-evm-contracts",
        description: "Deploy Solidity contracts to Hardhat",
        cwd: "e2e/shared/contracts/evm",
        args: ["run", "deploy"],
        waitToExit: true,
        type: "system-dependency" as const,
        dependsOn: ["build-evm-contracts"],
      },
    ] : []),

    // ── Bitcoin (optional) ───────────────────────────────────────────────────
    ...(bitcoin_enabled ? [
      {
        name: "bitcoin-core",
        description: "Bitcoin Core regtest node",
        cwd: "e2e/shared/contracts/bitcoin",
        stopProcessAtPort: [18334, 18443],
        args: ["run", "chain:start"],
        waitToExit: false,
        type: "system-dependency" as const,
      },
      {
        name: "bitcoin-core-wait",
        cwd: "e2e/shared/contracts/bitcoin",
        args: ["run", "chain:wait"],
        waitToExit: true,
        dependsOn: ["bitcoin-core"],
      },
      {
        name: "bitcoin-generate-blocks",
        description: "Continuously mines regtest blocks",
        cwd: "e2e/shared/contracts/bitcoin",
        args: ["run", "generate:blocks"],
        waitToExit: false,
        type: "system-dependency" as const,
        dependsOn: ["bitcoin-core-wait"],
      },
    ] : []),

    // ── Midnight (optional) ──────────────────────────────────────────────────
    ...(midnight_enabled ? [
      {
        name: "midnight-node",
        description: "Midnight blockchain node",
        cwd: "e2e/shared/contracts/midnight",
        stopProcessAtPort: [9944, 8088, 6300, 30333],
        args: ["run", "midnight-node:start"],
        waitToExit: false,
        type: "system-dependency" as const,
      },
      {
        name: "midnight-indexer",
        description: "Midnight indexer",
        cwd: "e2e/shared/contracts/midnight",
        args: ["run", "midnight-indexer:start"],
        waitToExit: false,
        type: "system-dependency" as const,
        dependsOn: ["midnight-node"],
      },
      {
        name: "midnight-proof-server",
        description: "Midnight proof server",
        cwd: "e2e/shared/contracts/midnight",
        args: ["run", "midnight-proof-server:start"],
        waitToExit: false,
        type: "system-dependency" as const,
        dependsOn: ["midnight-node"],
      },
      {
        name: "midnight-node-wait",
        cwd: "e2e/shared/contracts/midnight",
        args: ["run", "midnight-node:wait"],
        waitToExit: true,
        dependsOn: ["midnight-node"],
      },
      {
        name: "midnight-indexer-wait",
        cwd: "e2e/shared/contracts/midnight",
        args: ["run", "midnight-indexer:wait"],
        waitToExit: true,
        dependsOn: ["midnight-indexer"],
      },
      {
        name: "midnight-proof-server-wait",
        cwd: "e2e/shared/contracts/midnight",
        args: ["run", "midnight-proof-server:wait"],
        waitToExit: true,
        dependsOn: ["midnight-proof-server"],
      },
      {
        name: "compile-midnight-eip20",
        description: "Compile Midnight EIP-20 contract",
        cwd: "e2e/shared/contracts/midnight/contract-eip-20",
        args: ["run", "contract:compile"],
        waitToExit: true,
      },
      {
        name: "compile-midnight-counter",
        description: "Compile Midnight counter contract",
        cwd: "e2e/shared/contracts/midnight/contract-counter",
        args: ["run", "contract:compile"],
        waitToExit: true,
      },
      {
        name: "midnight-contract",
        description: "Deploy Midnight smart contract",
        cwd: "e2e/shared/contracts/midnight",
        args: ["run", "midnight-contract:deploy"],
        waitToExit: true,
        env: {
          MIDNIGHT_STORAGE_PASSWORD: process.env["MIDNIGHT_STORAGE_PASSWORD"] ?? "YourPasswordMy1!",
        },
        dependsOn: [
          "compile-midnight-eip20",
          "compile-midnight-counter",
          "midnight-node-wait",
          "midnight-indexer-wait",
          "midnight-proof-server-wait",
        ],
      },
    ] : []),

    // ── Avail (optional) ─────────────────────────────────────────────────────
    ...(avail_enabled ? [
      {
        name: "avail-client",
        description: "Avail node",
        cwd: "e2e/shared/contracts/avail",
        stopProcessAtPort: [9955, 30334],
        args: ["run", "avail-node:start"],
        waitToExit: false,
        type: "system-dependency" as const,
      },
      {
        name: "avail-client-wait",
        cwd: "e2e/shared/contracts/avail",
        args: ["run", "avail-node:wait"],
        waitToExit: true,
        dependsOn: ["avail-client"],
      },
    ] : []),

    // ── Cardano (optional) ───────────────────────────────────────────────────
    ...(cardano_enabled ? [
      {
        name: "cardano-node",
        description: "Cardano Yaci devkit node",
        cwd: "e2e/shared/contracts/cardano",
        stopProcessAtPort: [8090, 10000, 3001],
        args: ["run", "devkit:start"],
        waitToExit: false,
        type: "system-dependency" as const,
      },
      {
        name: "cardano-node-wait",
        cwd: "e2e/shared/contracts/cardano",
        args: ["run", "devkit:wait"],
        waitToExit: true,
        dependsOn: ["cardano-node"],
      },
      {
        name: "dolos-fill-template",
        cwd: "e2e/shared/contracts/cardano",
        args: ["run", "dolos:fill-template"],
        waitToExit: true,
        dependsOn: ["cardano-node-wait"],
      },
      {
        name: "dolos",
        description: "Cardano Dolos node",
        cwd: "e2e/shared/contracts/cardano",
        stopProcessAtPort: [3000, 50051],
        args: ["run", "dolos:start"],
        waitToExit: false,
        type: "system-dependency" as const,
        dependsOn: ["dolos-fill-template"],
      },
      {
        name: "dolos-wait",
        cwd: "e2e/shared/contracts/cardano",
        args: ["run", "dolos:wait"],
        waitToExit: true,
        dependsOn: ["dolos"],
      },
    ] : []),

    // ── Compile (manual — run before `start` to generate mod.ts) ──────────────
    ...(evm_enabled ? [{
      name: "compile-evm",
      description: "Compile EVM contracts and generate TypeScript bindings (standalone)",
      cwd: "e2e/shared/contracts/evm",
      args: ["run", "build:mod"],
      waitToExit: true,
      autoStart: false as const,
    }] : []),

    // ── System services (opt-in) ──────────────────────────────────────────────
    {
      name: "loki",
      description: "Grafana Loki log aggregator",
      args: ["./node_modules/.bin/grafana-loki", "grafana-loki"],
      stopProcessAtPort: [3100],
      waitToExit: false,
      autoStart: false,
      critical: false,
    },
    {
      name: "collector",
      description: "OpenTelemetry collector (Grafana Alloy)",
      args: ["./node_modules/.bin/grafana-alloy", "grafana-alloy"],
      stopProcessAtPort: [4318],
      waitToExit: false,
      autoStart: false,
      critical: false,
    },
    {
      name: "collector-wait",
      args: ["./node_modules/.bin/wait-on", "tcp:4318"],
      waitToExit: true,
      autoStart: false,
      dependsOn: ["collector"],
    },
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
    {
      name: "apply-migrations",
      description: "Apply database migrations",
      args: ["-e", "await import('@effectstream/db/apply-migrations')"],
      waitToExit: true,
      critical: true,
      dependsOn: ["pglite-wait"],
    },
    {
      name: "checker",
      description: "Run project checks",
      args: ["run", "check"],
      waitToExit: true,
      autoStart: false,
      critical: true,
    },
    // ── Batcher ──────────────────────────────────────────────────────────────
    {
      name: "batcher",
      description: "PaimaL2 batcher",
      cwd: "e2e/client/batcher",
      stopProcessAtPort: [3334],
      args: ["run", "start"],
      waitToExit: false,
      type: "system-dependency",
      env: {
        BATCHER_EVM_SECRET_KEY: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
      },
      dependsOn: [
        ...(evm_enabled      ? ["deploy-evm-contracts"] : []),
        ...(midnight_enabled ? ["midnight-contract"] : []),
        ...(bitcoin_enabled  ? ["bitcoin-generate-blocks"] : []),
      ],
    },

    // ── Explorer ─────────────────────────────────────────────────────────────
    {
      name: "build-explorer",
      description: "Build the Effectstream explorer UI",
      cwd: "packages/build-tools/explorer",
      stopProcessAtPort: [10590],
      args: ["run", "build"],
      waitToExit: true,
      dependsOn: [
        "batcher",
        ...(cardano_enabled ? ["dolos-wait"] : []),
        ...(avail_enabled   ? ["avail-client-wait"] : []),
      ],
    },
    {
      name: "serve-explorer",
      description: "Serve the Effectstream explorer",
      cwd: "packages/build-tools/explorer",
      stopProcessAtPort: [10590],
      args: ["run", "server:start"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:10590",
      dependsOn: ["build-explorer"],
    },

    // ── Sync ────────────────────────────────────────────────────────────────
    {
      name: "sync",
      description: "Effectstream main sync process",
      cwd: "e2e/client/node",
      args: ["run", "node:start:e2e"],
      stopProcessAtPort: [9999],
      waitToExit: false,
      type: "system-dependency",
      dependsOn: [
        "batcher",
        "apply-migrations",
        ...(evm_enabled      ? ["deploy-evm-contracts"] : []),
        ...(midnight_enabled ? ["midnight-contract"] : []),
        ...(bitcoin_enabled  ? ["bitcoin-generate-blocks"] : []),
        ...(cardano_enabled  ? ["dolos-wait"] : []),
        ...(avail_enabled    ? ["avail-client-wait"] : []),
      ],
    },
  ],
} satisfies OrchestratorConfig;
