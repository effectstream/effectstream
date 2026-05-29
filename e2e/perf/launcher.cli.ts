import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchEvm, EvmNames } from "@effectstream/orchestrator/launch-evm";

// PGLITE defaults to "true" (smoke runs). Set PGLITE=false (+ DB_* env) to point
// the node at an external Postgres for the full 1M-entry run.
const usePglite = process.env["PGLITE"] !== "false";

const syncDependsOn = usePglite
  ? [DbNames.PGLITE_WAIT, EvmNames.GENERATE_MOD]
  : [EvmNames.GENERATE_MOD];

export default {
  processes: [
    ...(usePglite ? launchPglite() : []),
    ...launchEvm("@e2e/evm-contracts", { resolveFrom: import.meta.dirname! }),

    // ── Sync (the perf node) ──────────────────────────────────────────────────
    {
      name: "sync",
      description: "E2E Perf sync node (Counter primitive only)",
      args: ["run", "e2e/perf/node.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: {
        PGLITE: usePglite ? "true" : "false",
        ENABLE_DEV_AND_DEBUG_ENDPOINTS: "true",
      },
      dependsOn: syncDependsOn,
    },
  ],
} satisfies OrchestratorConfig;
