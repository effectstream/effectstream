import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchSolana, SolanaNames } from "@effectstream/orchestrator/scripts/launch-solana";

const root = import.meta.dirname!;

export default {
  processes: [
    ...launchPglite(),
    ...launchSolana({ rpcPort: 8899, faucetPort: 9900 }),

    {
      name: "sync",
      description: "Solana starter sync node",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [DbNames.PGLITE_WAIT, SolanaNames.SOLANA_VALIDATOR_WAIT],
    },
  ],
} satisfies OrchestratorConfig;
