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
    ...launchMidnight("@evm-midnight/contracts-midnight", { cwd: path.join(root, "packages/contracts-midnight") }, {
      env: { MIDNIGHT_STORAGE_PASSWORD: "YourPasswordMy1!" },
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
