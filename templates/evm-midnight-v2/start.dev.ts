import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchEvm, EvmNames } from "@effectstream/orchestrator/launch-evm";
import { launchMidnight, MidnightNames } from "@effectstream/orchestrator/launch-midnight";
import { compactSelection } from "./toolchain/compact";

const root = import.meta.dirname!;
const midnightDeps = [MidnightNames.CONTRACT_DEPLOY];

export default {
  processes: [
    ...launchPglite().map(p =>
      p.name === "pglite" ? { ...p, env: { ...p.env, DEBUG_PGLITE: "0" } } : p
    ),
    ...launchEvm("@evm-midnight/contracts-evm", { cwd: path.join(root, "packages/contracts-evm") }),
    {
      name: "midnight-compact-preflight",
      description: `Validate Compact compiler selection ${compactSelection}`,
      cwd: root,
      args: ["run", "toolchain/compact.ts", "check"],
      waitToExit: true,
      critical: true,
    },
    {
      name: "midnight-contract-compile",
      description: `Compile Compact contract (compact compile ${compactSelection})`,
      cwd: path.join(root, "packages/contracts-midnight/contract-round-value"),
      args: ["run", "compact"],
      waitToExit: true,
      critical: true,
      dependsOn: ["midnight-compact-preflight"],
    },
    ...launchMidnight("@evm-midnight/contracts-midnight", { cwd: path.join(root, "packages/contracts-midnight") }, {
          env: { MIDNIGHT_STORAGE_PASSWORD: "YourPasswordMy1!" },
          dependsOn: ["midnight-contract-compile"],
    }),

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
      name: "frontend-build",
      description: "Build frontend",
      cwd: path.join(root, "packages/frontend"),
      args: ["run", "build"],
      waitToExit: true,
      type: "system-dependency",
      critical: true,
      dependsOn: [EvmNames.GENERATE_MOD, ...midnightDeps],
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
