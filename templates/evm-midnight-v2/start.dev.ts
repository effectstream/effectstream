import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchEvm, EvmNames } from "@effectstream/orchestrator/launch-evm";
import { launchMidnight, MidnightNames } from "@effectstream/orchestrator/launch-midnight";

const root = import.meta.dirname!;
const midnightDeps = [MidnightNames.CONTRACT_DEPLOY];

export default {
  processes: [
    // Build the frontend alone, before the memory-heavy Midnight runtime starts:
    // low-memory machines OOM when the vite build runs alongside the Midnight
    // node/proof-server/indexer. Its only generated dependency is the EVM
    // bindings (erc721dev, from GENERATE_MOD) — the Compact contract it imports
    // is committed — so it can run as soon as the EVM contracts are ready.
    {
      name: "frontend-build",
      description: "Build frontend",
      cwd: path.join(root, "packages/frontend"),
      args: ["run", "build"],
      waitToExit: true,
      type: "system-dependency",
      critical: true,
      dependsOn: [EvmNames.GENERATE_MOD],
    },

    ...launchPglite().map(p =>
      p.name === "pglite" ? { ...p, env: { ...p.env, DEBUG_PGLITE: "0" } } : p
    ),
    ...launchEvm("@evm-midnight/contracts-evm", { cwd: path.join(root, "packages/contracts-evm") }),

    // Gate the whole Midnight runtime on frontend-build (and transitively
    // sync/batcher, which depend on the contract deploy) so nothing heavy runs
    // during the build.
    ...launchMidnight("@evm-midnight/contracts-midnight", { cwd: path.join(root, "packages/contracts-midnight") }, {
      env: { MIDNIGHT_STORAGE_PASSWORD: "YourPasswordMy1!" },
    }).map(p =>
      p.name === MidnightNames.NODE
        ? { ...p, dependsOn: [...(p.dependsOn ?? []), "frontend-build"] }
        : p
    ),

    {
      name: "sync",
      description: "EVM-Midnight sync node",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [
        DbNames.PGLITE_WAIT,
        EvmNames.GENERATE_MOD,
        ...midnightDeps,
      ],
    },

    {
      name: "batcher",
      description: "Transaction batcher (EVM + Midnight)",
      args: ["run", "packages/batcher/batcher.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:3334",
      stopProcessAtPort: [3334],
      dependsOn: [EvmNames.GENERATE_MOD, ...midnightDeps],
    },

    {
      // Mirrors the freshly-deployed address into dist, overwriting the
      // placeholder that frontend-build copied. Avoids a rebuild after deploy.
      name: "publish-contract-address",
      description: "Copy freshly-deployed contract address into frontend dist",
      cwd: root,
      args: [
        "-e",
        [
          "import { copyFile, mkdir } from 'node:fs/promises';",
          "import { dirname } from 'node:path';",
          "const src = 'packages/contracts-midnight/contract-round-value.undeployed.json';",
          "const dst = 'packages/frontend/client/dist/contract_address/contract-round-value.undeployed.json';",
          "await mkdir(dirname(dst), { recursive: true });",
          "await copyFile(src, dst);",
          "console.log('Published', src, '→', dst);",
        ].join("\n"),
      ],
      waitToExit: true,
      type: "system-dependency",
      dependsOn: [MidnightNames.CONTRACT_DEPLOY, "frontend-build"],
    },

    {
      // Serves the dist produced by frontend-build (no rebuild here).
      name: "frontend-server",
      description: "Serve frontend",
      cwd: path.join(root, "packages/frontend"),
      args: ["run", "server:start"],
      waitToExit: false,
      type: "system-dependency",
      critical: true,
      link: "http://localhost:10599",
      stopProcessAtPort: [10599],
      dependsOn: ["frontend-build", "publish-contract-address"],
    },

  ],
} satisfies OrchestratorConfig;
