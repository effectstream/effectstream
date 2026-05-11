import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";

const CELESTIA_HOME = "/tmp/celestia-e2e-home";

export default {
  processes: [
    ...launchPglite(),

    // ── Celestia Infrastructure ───────────────────────────────────────────────
    {
      name: "celestia-devnet",
      description: "Celestia consensus node + bridge (ports 26657, 26658)",
      cwd: "e2e/shared/contracts/celestia",
      stopProcessAtPort: [26657, 26658],
      args: ["run", "celestia-bridge:start"],
      env: { CELESTIA_HOME, CELESTIA_FORCE_NO_BBR: process.env.CELESTIA_FORCE_NO_BBR || "" },
      waitToExit: false,
      critical: true,
    },
    {
      name: "celestia-bridge-wait",
      description: "Wait for Celestia bridge RPC on port 26658",
      cwd: "e2e/shared/contracts/celestia",
      args: ["run", "celestia-bridge:wait"],
      waitToExit: true,
      dependsOn: ["celestia-devnet"],
    },
    {
      name: "celestia-fund-bridge",
      description: "Fund the bridge node wallet with tokens",
      cwd: "e2e/shared/contracts/celestia",
      args: ["run", "celestia-fund:bridge"],
      env: { CELESTIA_HOME },
      waitToExit: true,
      critical: true,
      dependsOn: ["celestia-bridge-wait"],
    },

    // ── Sync (the node) ──────────────────────────────────────────────────────
    {
      name: "sync",
      description: "E2E Celestia sync node",
      args: ["run", "e2e/celestia/node.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [
        DbNames.PGLITE_WAIT,
        "celestia-fund-bridge",
      ],
    },
  ],
} satisfies OrchestratorConfig;
