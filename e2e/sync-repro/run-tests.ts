/**
 * E2E suite: deterministic sync-service reproductions.
 *
 * Unlike the other suites, this one needs no orchestrator/chains — it runs the
 * in-process reproduction tests (real runtime + PGLite + the synthetic `test`
 * chain) that reproduce the unbounded-buffering and restart-resume issues.
 *
 * NOTE: these tests assert the FIXED behaviour, so they are expected to FAIL
 * until the backpressure (C) and block-accurate-resume (D) fixes are applied.
 * See packages/node-sdk/sync/CLAUDE.md and
 * packages/node-sdk/runtime/test/reproduction/RESULTS.md.
 */
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");

const proc = Bun.spawn(
  ["bun", "test", "packages/node-sdk/runtime/test/reproduction/"],
  {
    cwd: repoRoot,
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env },
  },
);

const code = await proc.exited;
process.exit(code);
