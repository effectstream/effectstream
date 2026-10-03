// Orchestrator config for the end-to-end suite (e2e.test.ts, started by
// run-tests.ts): exactly the local stack of `bun run dev` (start.dev.ts), so the
// suite tests what a developer runs, with one change:
//
//   `sync` (the bridge node + its in-process relayer) is NOT critical here.
//   The US4 test kills it with SIGKILL between `submitted` and `completed` and
//   restarts it through the orchestrator API; with the default `critical: true`
//   the orchestrator would treat that exit as a failure and stop the stack.
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import dev, { BridgeProcessNames } from "../../start.dev.ts";

export default {
  ...dev,
  processes: dev.processes.map((p) =>
    p.name === BridgeProcessNames.SYNC ? { ...p, critical: false } : p
  ),
} satisfies OrchestratorConfig;
