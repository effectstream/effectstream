// The full swap lifecycle is implemented in ../full-lifecycle-e2e.ts (and the
// gate-focused ../liveness-e2e.ts): headless offer (`initSwap` +
// `finalizeTransaction` → the <Sig, Proof, Binding> shape the indexer accepts)
// → /api/zswap/submit (crypto + liveness + root-known) → batcher → Celestia →
// celestia-zswap ingestion (re-validated) → indexed →
// `balanceFinalizedTransaction` settle on Midnight → nullifier consumed →
// offer ARCHIVED (CONSUMED). Run it with the dev orchestrator up:
//
//   bun packages/tests/full-lifecycle-e2e.ts
//
// TODO: fold full-lifecycle-e2e.ts into this phase-B runner (it currently
// assumes the dev orchestrator rather than the start.test.ts infra).

import type { Client } from "pg";
import { assert } from "../helpers.ts";

export async function zswapFlowTest(_db: Client): Promise<void> {
  await assert(
    "TODO: run full-lifecycle-e2e.ts under the test launcher (see packages/tests/full-lifecycle-e2e.ts)",
    async () => false,
  );
}
