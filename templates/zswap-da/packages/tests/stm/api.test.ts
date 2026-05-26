// TODO: Restore Phase 3 (API flow) once the underlying browser/batcher swap
// lifecycle is implemented — this test exercises /api/zswap/{create,submit,
// :id/complete}, which currently call into the removed backend-wallet
// completion path. The original 110-line implementation is preserved in git:
// `git show HEAD:templates/zswap-da/e2e/run-tests.ts` (Phase 3, runApiTests
// at lines 454-561).

import type { Client } from "pg";
import { assert } from "../helpers.ts";

export async function apiTest(_db: Client): Promise<void> {
  await assert(
    "TODO: api flow — rewrite against browser/batcher flow",
    async () => false,
  );
}
