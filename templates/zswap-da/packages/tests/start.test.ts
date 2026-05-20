import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { DbNames, launchPglite } from "@effectstream/orchestrator/launch-pglite";
import {
  launchMidnight,
  MidnightNames,
} from "@effectstream/orchestrator/launch-midnight";
import {
  launchCelestia,
  CelestiaNames,
} from "@effectstream/orchestrator/launch-celestia";

const root = path.resolve(import.meta.dirname!, "../..");

const midnightDeps = [MidnightNames.CONTRACT_DEPLOY];

export default {
  processes: [
    ...launchPglite(),

    {
      name: "compact-build",
      description: "Compile Compact contract (offer-files)",
      cwd: path.join(root, "packages/contracts-midnight/contract-offer-files"),
      args: ["run", "compact"],
      waitToExit: true,
    },

    ...launchMidnight(
      "@zswap-da/contracts-midnight",
      { cwd: path.join(root, "packages/contracts-midnight") },
      {
        env: { MIDNIGHT_STORAGE_PASSWORD: "YourPasswordMy1!" },
        dependsOn: ["compact-build"],
      },
    ),

    ...launchCelestia(
      "@zswap-da/contracts-celestia",
      { cwd: path.join(root, "packages/contracts-celestia") },
      { home: "/tmp/celestia-test-zswap-home" },
    ),

    {
      name: "sync",
      description: "ZSwap-DA sync node (test)",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true", ENABLE_DEV_AND_DEBUG_ENDPOINTS: "true" },
      dependsOn: [
        DbNames.PGLITE_WAIT,
        CelestiaNames.FUND,
        ...midnightDeps,
      ],
    },

    {
      name: "batcher",
      description: "ZSwap-DA balancing batcher (port 3334)",
      args: ["run", "packages/batcher/batcher.dev.ts"],
      stopProcessAtPort: [3334],
      waitToExit: false,
      type: "system-dependency",
      dependsOn: [...midnightDeps],
    },
  ],
} satisfies OrchestratorConfig;
