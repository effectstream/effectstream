import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchEvm, EvmNames } from "@effectstream/orchestrator/launch-evm";
import { launchMidnight, MidnightNames } from "@effectstream/orchestrator/launch-midnight";

const root = path.resolve(import.meta.dirname!, "../..");

export default {
  processes: [
    ...launchPglite(),
    ...launchEvm("@evm-midnight/contracts-evm", { cwd: path.join(root, "packages/contracts-evm") }),
    // Recompile the Compact contract before deploy: the committed src/managed/
    // output is stripped from the CI Docker context by `.dockerignore`'s
    // `**/src/managed`, so midnight-contract:deploy (which imports
    // ./managed/contract/index.js) needs it regenerated first. Mirrors zswap-da.
    {
      name: "compact-build",
      description: "Compile Compact contract (counter)",
      cwd: path.join(root, "packages/contracts-midnight/contract-round-value"),
      args: ["run", "compact"],
      waitToExit: true,
    },
    ...launchMidnight("@evm-midnight/contracts-midnight", { cwd: path.join(root, "packages/contracts-midnight") }, {
      env: { MIDNIGHT_STORAGE_PASSWORD: "YourPasswordMy1!" },
      dependsOn: ["compact-build"],
    }),

    {
      name: "sync",
      description: "EVM-Midnight sync node (test)",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true", ENABLE_DEV_AND_DEBUG_ENDPOINTS: "true" },
      dependsOn: [
        DbNames.PGLITE_WAIT,
        EvmNames.GENERATE_MOD,
        MidnightNames.CONTRACT_DEPLOY,
      ],
    },
  ],
} satisfies OrchestratorConfig;
