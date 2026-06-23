import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchSolana, SolanaNames } from "@effectstream/orchestrator/scripts/launch-solana";

const root = import.meta.dirname!;

export default {
  processes: [
    ...launchPglite(),
    ...launchSolana("@solana-starter/node", { resolveFrom: root }),

    {
      name: "sync",
      description: "Solana starter sync node",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [DbNames.PGLITE_WAIT, SolanaNames.SOLANA_VALIDATOR_WAIT],
    },

    {
      name: "batcher",
      description: "Solana fee-payer sponsor batcher",
      stopProcessAtPort: [3334],
      args: ["run", "packages/batcher/main.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [SolanaNames.SOLANA_VALIDATOR_WAIT],
    },

    {
      name: "frontend",
      description: "Vite dev server — wallet + gasless batcher UI",
      stopProcessAtPort: [5173],
      cwd: path.join(root, "packages/frontend"),
      args: ["run", "dev"],
      waitToExit: false,
      type: "system-dependency",
      dependsOn: [SolanaNames.SOLANA_VALIDATOR_WAIT],
    },
  ],
} satisfies OrchestratorConfig;
