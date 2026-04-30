import type { OrchestratorConfig } from "@effectstream/orchestrator-v2/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator-v2/launch-pglite";
import { launchEvm, EvmNames } from "@effectstream/orchestrator-v2/launch-evm";
import { launchMidnight, MidnightNames } from "@effectstream/orchestrator-v2/launch-midnight";

export default {
  processes: [
    ...launchPglite(),
    ...launchEvm("@evm-midnight/contracts-evm", import.meta.dirname!),
    ...launchMidnight("@evm-midnight/contracts-midnight", import.meta.dirname!, {
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
