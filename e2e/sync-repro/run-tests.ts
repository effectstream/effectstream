/**
 * E2E suite: deterministic sync-service reproductions.
 *
 * Unlike the other suites, this one needs no orchestrator/chains. Two groups:
 *
 * 1. **Runtime reproductions** (`runtime/test/reproduction/`) — each node runs in
 *    its own subprocess over the synthetic `test` chain (so a restart is a
 *    genuine new OS process whose in-memory Deque is gone while the committed
 *    database survives — the production restart condition).
 *
 * 2. **Sync-service reproductions** (`sync/test/`) — external-failure repros that
 *    need no database: RPC clients pointed at a blackholed socket, and the
 *    `startSync` orchestration loop driven with fake states. Several are marked
 *    KNOWN-BROKEN: they assert today's (wrong) behaviour so the fix has a
 *    failing-to-passing signal to flip.
 *
 * Runs in the default PGLite mode; the Postgres-only consistency tests skip
 * unless invoked with `PGLITE=false` (which needs `postgresql` installed).
 */
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");

const groups = [
  { name: "runtime reproductions", path: "packages/node-sdk/runtime/test/reproduction/" },
  { name: "sync-service reproductions", path: "packages/node-sdk/sync/test/" },
];

let failed = 0;

for (const group of groups) {
  console.log(`\n--- ${group.name} (${group.path}) ---\n`);
  const proc = Bun.spawn(["bun", "test", group.path], {
    cwd: repoRoot,
    stdout: "inherit",
    stderr: "inherit",
    env: { PGLITE: "true", ...process.env },
  });
  const code = await proc.exited;
  if (code !== 0) {
    console.error(`\n[sync-repro] ${group.name} FAILED (exit ${code})`);
    failed = code;
  }
}

process.exit(failed);
