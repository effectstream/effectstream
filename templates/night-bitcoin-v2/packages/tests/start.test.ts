import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchBitcoin, BitcoinNames } from "@effectstream/orchestrator/launch-bitcoin";
import { launchMidnight, MidnightNames } from "@effectstream/orchestrator/launch-midnight";

const root = import.meta.dirname!;
const MIDNIGHT_GENESIS_VERIFY = "midnight-genesis-verify";
const midnightProcesses = launchMidnight(
  "@night-bitcoin/contracts-midnight",
  { cwd: path.join(root, "../contracts-midnight") },
  { env: { MIDNIGHT_STORAGE_PASSWORD: "YourPasswordMy1!" } },
).map((process) => {
  if (process.name === MidnightNames.NODE) {
    return {
      ...process,
      dependsOn: [MIDNIGHT_GENESIS_VERIFY, ...(process.dependsOn ?? [])],
    };
  }
  if (
    process.name === MidnightNames.INDEXER ||
    process.name === MidnightNames.PROOF_SERVER
  ) {
    return { ...process, dependsOn: [MidnightNames.NODE_WAIT] };
  }
  return process;
});

export default {
  processes: [
    ...launchPglite(),
    ...launchBitcoin("@night-bitcoin/contracts-bitcoin", { cwd: path.join(root, "../contracts-bitcoin") }),
    {
      name: MIDNIGHT_GENESIS_VERIFY,
      description: "Verify the bundled Night-Bitcoin custom genesis",
      args: ["run", "--filter", "@night-bitcoin/contracts-midnight", "midnight-genesis:verify"],
      waitToExit: true,
      type: "system-dependency",
      critical: true,
    },
    ...midnightProcesses,

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
      name: "mint-wallets-midnight",
      description: "Verify genesis-prefunded NIGHT/DUST and mint filler M20 inventory",
      args: ["run", "--filter", "@night-bitcoin/contracts-midnight", "mint-wallets"],
      waitToExit: true,
      type: "system-dependency",
      dependsOn: ["create-wallets-midnight"],
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
        "create-wallets-bitcoin",
        "mint-wallets-midnight",
      ],
    },
  ],
} satisfies OrchestratorConfig;
