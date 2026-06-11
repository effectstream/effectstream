// FULL LIFECYCLE manual runner against a RUNNING dev stack (`bun run dev`).
// Executes the same lifecycle as the automated Phase-B suite
// (stm/zswap-flow.test.ts) plus the STRETCH unshielded-give leg, which stays
// manual-only (tolerated-skip semantics under the current wallet SDK).
//
//   bun packages/tests/full-lifecycle-e2e.ts

import { anyError, getDBConnection, printSummary } from "./helpers.ts";
import { zswapFlowTest } from "./stm/zswap-flow.test.ts";

const db = getDBConnection();
try {
  await zswapFlowTest(db, { stretch: true });
} finally {
  await db.end().catch(() => {});
}
printSummary();
process.exit(anyError() ? 1 : 0);
