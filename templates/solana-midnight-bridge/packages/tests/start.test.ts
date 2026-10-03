// Orchestrator config for the end-to-end suite (e2e.test.ts, started by
// run-tests.ts): the local stack of `bun run dev` (start.dev.ts), so the suite
// tests what a developer runs, with two changes to the `sync` process (the
// bridge node + its in-process relayer):
//
//   - It is NOT critical. The US4 test kills it with SIGKILL between
//     `submitted` and `completed` and restarts it through the orchestrator API;
//     with the default `critical: true` the orchestrator would treat that exit
//     as a failure and stop the stack.
//   - Its Solana sync trails the tip by 4 confirmed slots instead of 32
//     (BRIDGE_SOLANA_CONFIRMATION_DEPTH). The local validator keeps only
//     10,000 shreds: about 20-25 minutes after it starts it purges every older
//     block, keeping a few dozen slots, and a sync that is further behind than
//     that stalls for good (questions file Q22). The whole suite needs ~25
//     minutes of Solana sync under emulation, so it has to stay close to the
//     tip. Remove this once the template passes a larger --limit-ledger-size
//     to the validator (Q22 A).
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import dev, { BridgeProcessNames } from "../../start.dev.ts";

export default {
  ...dev,
  processes: dev.processes.map((p) =>
    p.name === BridgeProcessNames.SYNC
      ? { ...p, critical: false, env: { ...p.env, BRIDGE_SOLANA_CONFIRMATION_DEPTH: "4" } }
      : p
  ),
} satisfies OrchestratorConfig;
