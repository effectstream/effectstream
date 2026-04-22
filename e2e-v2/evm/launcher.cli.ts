import type { OrchestratorConfig } from "@effectstream/orchestrator-v2/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator-v2/launch-pglite";
import { launchEvm, EvmNames } from "@effectstream/orchestrator-v2/launch-evm";

export default {
  processes: [
    ...launchPglite(),
    ...launchEvm("@e2e-v2/evm-contracts", import.meta.dirname!),

    // ── Sync (the node) ───────────────────────────────────────────────────────
    {
      name: "sync",
      description: "E2E-V2 EVM sync node",
      args: ["run", "e2e-v2/evm/node.ts"],
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
      description: "E2E-V2 EVM Batcher (EffectstreamL2 + Counter adapters)",
      stopProcessAtPort: [3334],
      args: ["run", "e2e-v2/evm/batcher/main.ts"],
      waitToExit: false,
      type: "system-dependency",
      dependsOn: [EvmNames.GENERATE_MOD],
    },
  ],
} satisfies OrchestratorConfig;
