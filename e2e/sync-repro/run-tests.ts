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
 *
 * Usage:
 *   bun run e2e/sync-repro/run-tests.ts             # on the host
 *   bun run e2e/sync-repro/run-tests.ts --docker    # inside a container
 *
 * `--docker` builds .github/Dockerfile.sync-repro and runs the suite there, so
 * the harness's PGLite gateway and API ports live in the container's own
 * network namespace and cannot collide with suites running on the host.
 */
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");
const args = process.argv.slice(2);

const IMAGE = "effectstream-sync-repro";

/** Build the image and re-run this script inside it. */
async function runInDocker(): Promise<number> {
  console.log(`[sync-repro] building ${IMAGE}...`);
  const build = Bun.spawn(
    ["docker", "build", "-t", IMAGE, "-f", ".github/Dockerfile.sync-repro", "."],
    { cwd: repoRoot, stdout: "inherit", stderr: "inherit" },
  );
  const buildCode = await build.exited;
  if (buildCode !== 0) {
    console.error(`[sync-repro] image build FAILED (exit ${buildCode})`);
    return buildCode;
  }

  console.log(`[sync-repro] running suite in container...`);
  const run = Bun.spawn(["docker", "run", "--rm", IMAGE], {
    cwd: repoRoot,
    stdout: "inherit",
    stderr: "inherit",
  });
  return await run.exited;
}

async function runGroups(): Promise<number> {
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
      // Spread order is deliberate: an ambient PGLITE=false must win, so the
      // Postgres-backed consistency tests can be selected from the environment.
      // PGLITE=true is only the default when nothing is set.
      env: { PGLITE: "true", ...process.env },
    });
    const code = await proc.exited;
    if (code !== 0) {
      console.error(`\n[sync-repro] ${group.name} FAILED (exit ${code})`);
      failed = code;
    }
  }
  return failed;
}

const code = args.includes("--docker") ? await runInDocker() : await runGroups();
process.exit(code);
