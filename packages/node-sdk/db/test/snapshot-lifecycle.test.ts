/**
 * Reproduction for the snapshot child-process boundary (spec 00031: G6).
 *
 * `createSnapshot` shells out to `pg_dump` through `spawnOutput`, which is
 * awaited with effection's `until`. `until` abandons the promise on
 * cancellation but nothing kills the process behind it, so halting the runtime
 * leaves a full database dump running unsupervised.
 *
 * A stub `pg_dump` (first on PATH) stands in for the real one so the test needs
 * no PostgreSQL installation and can observe the child's PID directly.
 */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run, type Task } from "effection";
import { runSnapshotLoop } from "../src/snapshot-handler.ts";

const ENV_KEYS = ["PATH", "PGLITE", "SNAPSHOT_TEST_PIDFILE"] as const;

let saved: Record<string, string | undefined>;
let workDir: string;
let pidFile: string;
let task: Task<unknown> | undefined;

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(
  check: () => boolean,
  ms: number,
  label: string,
): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() >= end) throw new Error(`${label} not met within ${ms}ms`);
    await sleep(10);
  }
}

function childPid(): number | undefined {
  if (!existsSync(pidFile)) return undefined;
  const raw = readFileSync(pidFile, "utf8").trim();
  const pid = Number(raw);
  return Number.isFinite(pid) && pid > 0 ? pid : undefined;
}

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  workDir = mkdtempSync(join(tmpdir(), "es-00031-snapshot-"));
  pidFile = join(workDir, "pg_dump.pid");

  // A stand-in `pg_dump` that announces its PID and then runs long enough for
  // the test to halt the loop while it is still working.
  const stub = join(workDir, "pg_dump");
  writeFileSync(
    stub,
    `#!/bin/sh\necho $$ > "${pidFile}"\nexec sleep 30\n`,
    "utf8",
  );
  chmodSync(stub, 0o755);

  process.env.PATH = `${workDir}:${process.env.PATH ?? ""}`;
  // `createSnapshot` short-circuits under PGLite (pg_dump cannot read its
  // catalog), so the scenario under test is the server-backed one.
  process.env.PGLITE = "false";
});

afterEach(async () => {
  if (task) {
    await Promise.race([task.halt().catch(() => {}), sleep(2_000)]);
    task = undefined;
  }
  const pid = childPid();
  if (pid !== undefined && alive(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch { /* already gone */ }
  }
  rmSync(workDir, { recursive: true, force: true });
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("G6: halting the snapshot loop kills the in-flight pg_dump child", async () => {
  task = run(() =>
    runSnapshotLoop({
      intervalSeconds: 0.05,
      path: join(workDir, "snapshots"),
    })
  );
  void Promise.resolve(task).catch(() => {});

  await waitUntil(() => childPid() !== undefined, 10_000, "pg_dump started");
  const pid = childPid()!;
  expect(alive(pid)).toBe(true);

  await task.halt();
  task = undefined;
  await sleep(500);

  // The runtime claimed it had shut down while a database dump was still
  // running with an open connection.
  expect(alive(pid)).toBe(false);
}, 30_000);
