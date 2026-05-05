import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchBitcoin, BitcoinNames } from "@effectstream/orchestrator/launch-bitcoin";
import { launchMidnight, MidnightNames } from "@effectstream/orchestrator/launch-midnight";

export default {
  processes: [
    ...launchPglite(),
    ...launchBitcoin("@night-bitcoin/contracts-bitcoin", { resolveFrom: import.meta.dirname! }),
    ...launchMidnight("@night-bitcoin/contracts-midnight", { resolveFrom: import.meta.dirname! }, {
      env: { MIDNIGHT_STORAGE_PASSWORD: "YourPasswordMy1!" },
    }),

    {
      name: "create-wallets-bitcoin",
      description: "Create Bitcoin filler wallets and fund them",
      args: ["run", "--filter", "@night-bitcoin/contracts-bitcoin", "create-wallets", "1.5", "3", "100"],
      waitToExit: true,
      type: "system-dependency",
      dependsOn: [BitcoinNames.BITCOIN_WAIT_FOR_BLOCK],
    },
    {
      name: "create-wallets-midnight",
      description: "Create Midnight filler wallets",
      args: ["run", "--filter", "@night-bitcoin/contracts-midnight", "create-wallets"],
      waitToExit: true,
      type: "system-dependency",
      dependsOn: [MidnightNames.CONTRACT_DEPLOY],
    },

    {
      name: "sync",
      description: "Night-Bitcoin sync node (test)",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true", ENABLE_DEV_AND_DEBUG_ENDPOINTS: "true" },
      dependsOn: [
        DbNames.PGLITE_WAIT,
        BitcoinNames.BITCOIN_WAIT_FOR_BLOCK,
        MidnightNames.CONTRACT_DEPLOY,
      ],
    },
  ],
} satisfies OrchestratorConfig;
