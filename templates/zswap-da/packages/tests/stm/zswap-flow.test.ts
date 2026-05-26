// TODO: Rewrite against the browser/batcher flow.
//
// The original 200-line implementation drove the full swap lifecycle through
// the backend-wallet path (wallet1 builds an `initSwap` recipe, wallet2
// balances + signs + submits). The state machine no longer accepts the
// `<Sig, PreProof, PreBinding>` shape that path produced — it deserializes
// only Lace-shaped `<Sig, Proof, Binding>` offers — so the test needs to be
// rebuilt on top of the API + batcher flow (which is what production traffic
// uses). The original code is preserved in git: see
// `git show HEAD:templates/zswap-da/e2e/run-tests.ts` (Phase 2, runZswapTests
// at lines 205-448).

import type { Client } from "pg";
import { assert } from "../helpers.ts";

export async function zswapFlowTest(_db: Client): Promise<void> {
  await assert(
    "TODO: zswap-flow — rewrite against browser/batcher flow",
    async () => false,
  );
}
