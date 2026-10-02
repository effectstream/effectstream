// Live orchestrator: `bun run live` — Solana devnet + Midnight stagenet.
//
// No local chains run in live mode. The contracts are deployed once by
//   packages/contracts-solana/scripts/deploy-devnet.ts   (Solana section)
//   TODO(PR-2 T2.2/T7.3) the stagenet Midnight deploy    (Midnight section)
// into deployments/devnet-stagenet.json, and this file starts only local
// services against those deployments.
//
// Still to wire (sub-plan plans/00050-solana-midnight-bridge-pr2-template.md):
//   TODO(PR-2 T7.4) the rc.8 contract prover and the dust/9 DUST prover;
//   TODO(PR-2 T3/T7.4) the "sync" node with config.live.ts (devnet RPC from
//                      SOLANA_DEVNET_RPC_URL, stagenet indexer), relayer in-process,
//                      operator keys read from ~/.config/effectstream-00050/ only.
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite } from "@effectstream/orchestrator/launch-pglite";

export default {
  processes: [
    ...launchPglite(),
    // TODO(PR-2 T7.4): proof servers (rc.8 contract + dust/9 DUST).
    // TODO(PR-2 T3/T7.4): { name: "sync", args: ["run", "packages/node/main.live.ts"], … }.
  ],
} satisfies OrchestratorConfig;
