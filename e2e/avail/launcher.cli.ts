import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchAvail, AvailNames } from "@effectstream/orchestrator/launch-avail";

export default {
  processes: [
    ...launchPglite(),
    ...launchAvail("@e2e/avail-contracts", import.meta.dirname!),

    // ── Sync ──────────────────────────────────────────────────────────────────
    { name: "sync", args: ["run", "e2e/avail/node.ts"], waitToExit: false, type: "system-dependency" as const, env: { PGLITE: "true" }, dependsOn: [DbNames.PGLITE_WAIT, AvailNames.LIGHT_CLIENT_WAIT] },
  ],
} satisfies OrchestratorConfig;
