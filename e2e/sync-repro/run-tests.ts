/**
 * E2E suite: deterministic sync-service reproductions.
 *
 * Unlike the other suites, this one needs no orchestrator/chains. Each node runs
 * in its own subprocess over the synthetic `test` chain (so a restart is a
 * genuine new OS process whose in-memory Deque is gone while the committed
 * database survives — the production restart condition).
 *
 * Runs in the default PGLite mode; the Postgres-only consistency tests skip
 * unless invoked with `PGLITE=false` (which needs `postgresql` installed).
 *
 */
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");

const proc = Bun.spawn(
  ["bun", "test", "packages/node-sdk/runtime/test/reproduction/"],
  {
    cwd: repoRoot,
    stdout: "inherit",
    stderr: "inherit",
    env: { PGLITE: "true", ...process.env },
  },
);

const code = await proc.exited;
process.exit(code);
