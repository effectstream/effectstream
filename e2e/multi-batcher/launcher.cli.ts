// Infrastructure for the multi-batcher e2e guard.
//
// Same shape as e2e/midnight/launcher.cli.ts: native binaries driven by the
// orchestrator's dependency graph, NOT docker — the CI test image has no
// docker CLI, and every other suite launches this way.
//
// The ordering that matters is fund → batcher. The batcher's adapters read
// their wallets at construction, so a batcher started before funding comes up
// with unfunded wallets and never recovers. `fund` is waitToExit + critical,
// so the graph cannot start the batcher until funding has actually finished.

import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchMidnight, MidnightNames } from "@effectstream/orchestrator/launch-midnight";

export default {
  processes: [
    // Compact compile — the counter contract product-a calls, and whose
    // address seeds the second token type product-c's swaps trade against.
    {
      name: "compile-midnight-counter",
      description: "Compile counter contract with Compact",
      cwd: "e2e/shared/contracts/midnight/contract-counter",
      args: ["run", "compact"],
      waitToExit: true,
      critical: true,
    },

    ...launchMidnight("@e2e/midnight-contracts", { resolveFrom: import.meta.dirname! }, {
      env: {
        MIDNIGHT_STORAGE_PASSWORD: process.env["MIDNIGHT_STORAGE_PASSWORD"] ?? "YourPasswordMy1!",
      },
      dependsOn: ["compile-midnight-counter"],
    }),

    // Per-product fee wallets + actor wallets. Depends on CONTRACT_DEPLOY so it
    // never races the genesis wallet against the deploy — two writers on one
    // wallet is the documented double-spend.
    {
      name: "fund",
      description: "Fund per-product fee wallets and actor wallets",
      args: ["run", "e2e/multi-batcher/fund.ts"],
      waitToExit: true,
      critical: true,
      dependsOn: [MidnightNames.CONTRACT_DEPLOY],
    },

    {
      name: "batcher",
      description: "Shared batcher hosting product-a/b/c",
      args: ["run", "e2e/multi-batcher/batcher/main.ts"],
      // The suite asserts on the target-scoped admin routes (/clear-inputs),
      // which are only registered when this is set. Carried over from the
      // compose stack this launcher replaced.
      env: { ENABLE_DEV_AND_DEBUG_ENDPOINTS: "true" },
      stopProcessAtPort: [3334],
      waitToExit: false,
      dependsOn: ["fund"],
    },
    {
      name: "batcher-wait",
      args: ["./node_modules/.bin/wait-on", "tcp:3334"],
      waitToExit: true,
      dependsOn: ["batcher"],
    },
  ],
} satisfies OrchestratorConfig;
