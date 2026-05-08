import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchEvm, EvmNames } from "@effectstream/orchestrator/launch-evm";

export default {
  processes: [
    ...launchPglite(),
    ...launchEvm("@e2e/evm-contracts", { resolveFrom: import.meta.dirname! }),

    // ── Sync (the node) ───────────────────────────────────────────────────────
    {
      name: "sync",
      description: "E2E EVM sync node",
      args: ["run", "e2e/evm/node.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true", ENABLE_DEV_AND_DEBUG_ENDPOINTS: "true" },
      dependsOn: [
        DbNames.PGLITE_WAIT,
        EvmNames.GENERATE_MOD,
      ],
    },

    // ── Batcher ─────────────────────────────────────────────────────────────
    {
      name: "batcher",
      description: "E2E EVM Batcher (EffectstreamL2 + Counter adapters)",
      stopProcessAtPort: [3334],
      args: ["run", "e2e/evm/batcher/main.ts"],
      waitToExit: false,
      type: "system-dependency",
      dependsOn: [EvmNames.GENERATE_MOD],
    },
  ],
} satisfies OrchestratorConfig;
