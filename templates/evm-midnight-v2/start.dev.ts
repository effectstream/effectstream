import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import {
  launchPglite,
  DbNames,
} from "@effectstream/orchestrator/launch-pglite";
import { launchEvm, EvmNames } from "@effectstream/orchestrator/launch-evm";
import {
  launchMidnight,
  MidnightNames,
} from "@effectstream/orchestrator/launch-midnight";
import {
  compactSelection,
  validateCompactSelection,
} from "./toolchain/compact";

const root = import.meta.dirname!;
const midnightDeps = [MidnightNames.CONTRACT_DEPLOY];
const compactPreflight = "midnight-compact-preflight";

// Validate the template's exact selection before the shared launcher performs
// its generic executable check, then keep the runtime task as a dependency of
// every Midnight process so partial/targeted orchestrator runs remain gated.
validateCompactSelection();
const midnightProcesses = launchMidnight(
  "@evm-midnight/contracts-midnight",
  { cwd: path.join(root, "packages/contracts-midnight") },
  {
    env: { MIDNIGHT_STORAGE_PASSWORD: "YourPasswordMy1!" },
    dependsOn: ["midnight-contract-compile"],
  },
).map((process) => ({
  ...process,
  dependsOn: [
    compactPreflight,
    ...(process.dependsOn ?? []).filter(
      (dependency) => dependency !== compactPreflight,
    ),
  ],
}));

export default {
  processes: [
    ...launchPglite().map((p) =>
      p.name === "pglite" ? { ...p, env: { ...p.env, DEBUG_PGLITE: "0" } } : p,
    ),
    ...launchEvm("@evm-midnight/contracts-evm", {
      cwd: path.join(root, "packages/contracts-evm"),
    }),
    {
      name: compactPreflight,
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
      dependsOn: [compactPreflight],
    },
    ...midnightProcesses,

    {
      name: "sync",
      description: "EVM-Midnight sync node",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [DbNames.PGLITE_WAIT, EvmNames.GENERATE_MOD, ...midnightDeps],
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
