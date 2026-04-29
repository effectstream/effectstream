import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchNear, NearNames } from "@effectstream/orchestrator/launch-near";

export default {
  processes: [
    ...launchPglite(),
    ...launchNear("@e2e/near-contracts", import.meta.dirname!),

    // ── Deploy Contract ────────────────────────────────────────────────────
    {
      name: "deploy-near-contract",
      description: "Deploy test contract and call emit_event",
      args: ["run", "e2e/shared/contracts/near/deploy-and-call.ts"],
      waitToExit: true,
      critical: true,
      dependsOn: [NearNames.SANDBOX_WAIT],
    },

    // ── Sync (the node) ──────────────────────────────────────────────────────
    {
      name: "sync",
      description: "E2E NEAR sync node",
      args: ["run", "e2e/near/node.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [
        DbNames.PGLITE_WAIT,
        NearNames.SANDBOX_WAIT,
      ],
    },
  ],
} satisfies OrchestratorConfig;
