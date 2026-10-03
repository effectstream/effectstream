// Orchestrator config for the end-to-end suite (e2e.test.ts, started by
// run-tests.ts): the local stack of `bun run dev` (start.dev.ts), so the suite
// tests what a developer runs, with one change to the `sync` process (the
// bridge node + its in-process relayer):
//
//   It is NOT critical. The US4 test kills it with SIGKILL between
//     `submitted` and `completed` and restarts it through the orchestrator API;
//     with the default `critical: true` the orchestrator would treat that exit
//     as a failure and stop the stack.
//
//   The node's Solana sync keeps the product default (32 confirmed slots):
//   the local validator now keeps 5,000,000 ledger shreds (chain-start.ts,
//   questions file Q22/Q23), so it no longer purges the blocks the sync still
//   needs during the suite (the earlier BRIDGE_SOLANA_CONFIRMATION_DEPTH=4
//   mitigation is gone).
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import dev, { BridgeProcessNames } from "../../start.dev.ts";

export default {
  ...dev,
  processes: dev.processes.map((p) =>
    p.name === BridgeProcessNames.SYNC
      ? { ...p, critical: false }
      : p
  ),
} satisfies OrchestratorConfig;
