import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchCardano, CardanoNames } from "@effectstream/orchestrator/launch-cardano";

export default {
  processes: [
    ...launchPglite(),
    ...launchCardano("@e2e/cardano-contracts", { resolveFrom: import.meta.dirname! }),

    // ── Sync (the node) ───────────────────────────────────────────────────────
    {
      name: "sync",
      description: "E2E Cardano sync node",
      args: ["run", "e2e/cardano/node.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [
        DbNames.PGLITE_WAIT,
        CardanoNames.CARDANO_SUBMIT_TX,
        CardanoNames.DOLOS_MINIBF_WAIT,
      ],
    },
  ],
} satisfies OrchestratorConfig;
