import type { OrchestratorConfig } from "@effectstream/orchestrator-v2/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator-v2/launch-pglite";
import { launchAvail, AvailNames } from "@effectstream/orchestrator-v2/launch-avail";

export default {
  processes: [
    ...launchPglite(),
    ...launchAvail("@e2e-v2/avail-contracts", import.meta.dirname!),

    // ── Sync ──────────────────────────────────────────────────────────────────
    { name: "sync", args: ["run", "e2e-v2/avail/node.ts"], waitToExit: false, type: "system-dependency" as const, env: { PGLITE: "true" }, dependsOn: [DbNames.PGLITE_WAIT, AvailNames.LIGHT_CLIENT_WAIT] },
  ],
} satisfies OrchestratorConfig;
