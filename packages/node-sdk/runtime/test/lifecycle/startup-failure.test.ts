/**
 * A node whose startup fails, or whose runtime fails after startup, must print
 * the failure and exit non-zero, even when the application suspends after
 * `start()` as every real application does.
 *
 * Each case boots `fixtures/startup-failure-app.ts` in its own process and
 * asserts only on what an operator or a supervisor sees: the exit code, the
 * time it took, and the output.
 */
import { expect, test } from "bun:test";
import type { Server } from "node:net";
import type { Spec } from "./fixtures/startup-failure-app.ts";
import {
  closeTcp,
  freeDistinctPorts,
  listenTcp,
  tcpConnects,
  waitUntil,
  withDeadline,
} from "./support.ts";

const FIXTURE = new URL("./fixtures/startup-failure-app.ts", import.meta.url)
  .pathname;
const CWD = new URL("../../../../..", import.meta.url).pathname;

/** How long a failing node may take to exit, boot included. */
const EXIT_DEADLINE_MS = 20_000;
/** How long the control node may take to answer on its API port. */
const READY_DEADLINE_MS = 20_000;
/** Bounded wait for the control node to stop after SIGTERM. */
const STOP_DEADLINE_MS = 10_000;
/** Deadline plus boot plus kill, with room for a slow CI runner. */
const TEST_TIMEOUT_MS = 60_000;

type Launched = {
  child: ReturnType<typeof Bun.spawn>;
  startedAt: number;
  /** stdout and stderr, available once the process has exited. */
  output: Promise<string>;
};

function launch(spec: Spec): Launched {
  const child = Bun.spawn([process.execPath, FIXTURE, JSON.stringify(spec)], {
    cwd: CWD,
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = Promise.all([
    new Response(child.stdout as ReadableStream).text(),
    new Response(child.stderr as ReadableStream).text(),
  ]).then(([stdout, stderr]) => `${stdout}\n${stderr}`);
  return { child, startedAt: Date.now(), output };
}

/** Kill the child if it is still running and wait until it is gone. */
async function reap(launched: Launched): Promise<void> {
  if (launched.child.exitCode === null && launched.child.signalCode === null) {
    launched.child.kill("SIGKILL");
  }
  await launched.child.exited;
}

/**
 * Wait for a node that must fail to exit on its own. A node that is still
 * running at the deadline swallowed its failure: it is killed and the case
 * fails with the output it produced.
 */
async function expectFailedExit(
  launched: Launched,
  mode: Spec["mode"],
): Promise<string> {
  const exited = await withDeadline(launched.child.exited, EXIT_DEADLINE_MS)
    .then(() => true, () => false);
  const elapsed = Date.now() - launched.startedAt;
  if (!exited) {
    await reap(launched);
    const output = await launched.output;
    throw new Error(
      `${mode}: the node was still running after ${
        EXIT_DEADLINE_MS / 1000
      } s, so the failure was swallowed.\nOutput:\n${output}`,
    );
  }
  const output = await launched.output;
  console.log(
    `[startup-failure] ${mode}: exited with code ${launched.child.exitCode} after ${elapsed} ms`,
  );
  expect(launched.child.exitCode, `${mode} output:\n${output}`).toBe(1);
  return output;
}

test("a node on a database without pg_ivm prints the abort and exits 1", async () => {
  const [dbPort, apiPort] = await freeDistinctPorts(2);
  const launched = launch({ mode: "missing-pg-ivm", dbPort, apiPort });
  try {
    const output = await expectFailedExit(launched, "missing-pg-ivm");
    expect(output).toContain("Effectstream startup aborted");
    expect(output).toContain("ALLOW_NO_PG_IVM=true");
  } finally {
    await reap(launched);
  }
}, TEST_TIMEOUT_MS);

test("a node whose API port is taken prints EADDRINUSE and exits 1", async () => {
  const [dbPort, apiPort] = await freeDistinctPorts(2);
  // Wildcard bind, like the runtime's HTTP server, so the two really conflict.
  const blocker: Server = await listenTcp(apiPort, "0.0.0.0");
  const launched = launch({ mode: "api-port-in-use", dbPort, apiPort });
  try {
    const output = await expectFailedExit(launched, "api-port-in-use");
    expect(output).toContain("EADDRINUSE");
  } finally {
    await reap(launched);
    await closeTcp(blocker);
  }
}, TEST_TIMEOUT_MS);

test("control: with ALLOW_NO_PG_IVM=true the same node starts and keeps running", async () => {
  const [dbPort, apiPort] = await freeDistinctPorts(2);
  const launched = launch({ mode: "allow-no-pg-ivm", dbPort, apiPort });
  try {
    const exitedEarly = launched.child.exited.then(() => true);
    try {
      await waitUntil(
        async () => {
          if (launched.child.exitCode !== null) {
            throw new Error(
              `allow-no-pg-ivm: the node exited with code ${launched.child.exitCode} instead of starting`,
            );
          }
          return await tcpConnects(apiPort);
        },
        READY_DEADLINE_MS,
        "allow-no-pg-ivm: API port accepting connections",
      );
    } catch (error) {
      await reap(launched);
      throw new Error(`${String(error)}\nOutput:\n${await launched.output}`);
    }
    console.log(
      `[startup-failure] allow-no-pg-ivm: API answered after ${
        Date.now() - launched.startedAt
      } ms`,
    );
    expect(launched.child.exitCode).toBeNull();

    launched.child.kill("SIGTERM");
    await withDeadline(exitedEarly, STOP_DEADLINE_MS).catch(() => {
      launched.child.kill("SIGKILL");
    });
  } finally {
    await reap(launched);
  }
}, TEST_TIMEOUT_MS);
