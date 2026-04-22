import type { OrchestratorConfig } from "@effectstream/orchestrator-v2/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator-v2/launch-pglite";
import { launchCardano, CardanoNames } from "@effectstream/orchestrator-v2/launch-cardano";

export default {
  processes: [
    ...launchPglite(),
    ...launchCardano("@e2e-v2/cardano-contracts", import.meta.dirname!),

    // ── Sync (the node) ───────────────────────────────────────────────────────
    {
      name: "sync",
      description: "E2E-V2 Cardano sync node",
      args: ["run", "e2e-v2/cardano/node.ts"],
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
