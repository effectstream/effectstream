import type { OrchestratorConfig } from "@effectstream/orchestrator-v2/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator-v2/launch-pglite";
import { launchNear, NearNames } from "@effectstream/orchestrator-v2/launch-near";

export default {
  processes: [
    ...launchPglite(),
    ...launchNear("@e2e-v2/near-contracts", import.meta.dirname!),

    // ── Deploy Contract ────────────────────────────────────────────────────
    {
      name: "deploy-near-contract",
      description: "Deploy test contract and call emit_event",
      args: ["run", "e2e-v2/shared/contracts/near/deploy-and-call.ts"],
      waitToExit: true,
      critical: true,
      dependsOn: [NearNames.SANDBOX_WAIT],
    },

    // ── Sync (the node) ──────────────────────────────────────────────────────
    {
      name: "sync",
      description: "E2E-V2 NEAR sync node",
      args: ["run", "e2e-v2/near/node.ts"],
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
