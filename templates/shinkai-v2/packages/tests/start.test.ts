import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchEvm, EvmNames } from "@effectstream/orchestrator/launch-evm";

const root = import.meta.dirname!;

export default {
  processes: [
    ...launchPglite(),
    ...launchEvm("@shinkai-v2/contracts-evm", { resolveFrom: root }),
    {
      name: "sync",
      description: "Sync node (test mode)",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true", ENABLE_DEV_AND_DEBUG_ENDPOINTS: "true" },
      dependsOn: [DbNames.PGLITE_WAIT, EvmNames.GENERATE_MOD],
    },
    {
      name: "batcher",
      description: "Transaction batcher (test)",
      args: ["run", "packages/batcher/batcher.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      dependsOn: [EvmNames.GENERATE_MOD],
    },
  ],
} satisfies OrchestratorConfig;
