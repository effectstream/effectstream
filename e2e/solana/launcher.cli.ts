import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchSolana, SolanaNames } from "@effectstream/orchestrator/scripts/launch-solana";

export default {
  processes: [
    ...launchPglite(),
    // Validator + the shared test program, from e2e/shared/contracts/solana —
    // the reference any template can crib from.
    ...launchSolana("@e2e/solana-contracts", { resolveFrom: import.meta.dirname! }),

    // ── Sync (the node) ──────────────────────────────────────────────────
    {
      name: "sync",
      description: "E2E Solana sync node",
      args: ["run", "e2e/solana/node.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [
        DbNames.PGLITE_WAIT,
        SolanaNames.SOLANA_VALIDATOR_WAIT,
      ],
    },

    // ── Batcher (fee-payer sponsor) ──────────────────────────────────────
    {
      name: "batcher",
      description: "E2E Solana fee-payer sponsor batcher",
      stopProcessAtPort: [3334],
      args: ["run", "e2e/solana/batcher/main.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [
        SolanaNames.SOLANA_VALIDATOR_WAIT,
      ],
    },
  ],
} satisfies OrchestratorConfig;
