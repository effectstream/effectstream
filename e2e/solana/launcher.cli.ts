import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchSolana, SolanaNames } from "@effectstream/orchestrator/scripts/launch-solana";

export default {
  processes: [
    ...launchPglite(),
    ...launchSolana({ rpcPort: 8899, faucetPort: 9900 }),

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
  ],
} satisfies OrchestratorConfig;
