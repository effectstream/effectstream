import { expect, test } from "bun:test";

async function runCase(name: string): Promise<void> {
  const child = Bun.spawn(
    [process.execPath, "packages/node-sdk/sync/test/ntp-tip-case.ts", name],
    { cwd: process.cwd(), stdout: "pipe", stderr: "pipe", env: process.env },
  );
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 30_000);
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  clearTimeout(timeout);
  expect(timedOut, `${name} timed out`).toBe(false);
  expect(exitCode, `${name}\n${stdout}\n${stderr}`).toBe(0);
  expect(stdout).toContain(`ok ${name}`);
}

test("inclusive arithmetic, validation, one sample, and zero preflight allocations", () =>
  runCase("fake-arithmetic"));
test("loopback NTP success sends one packet and includes the current page", () =>
  runCase("udp-success"));
test("sequential one-shot calls isolate server configuration", () =>
  runCase("isolation-sequential"));
test("concurrent one-shot calls isolate server configuration", () =>
  runCase("isolation-concurrent"));
test("a silent NTP server is bounded by the operation deadline", () =>
  runCase("timeout"));
test("an already-aborted call sends zero packets", () =>
  runCase("already-aborted"));
test("in-flight caller abort keeps its cause and cleans up", () =>
  runCase("caller-abort"));
test("caller abort wins when it arrives before timeout", () =>
  runCase("abort-first"));
test("timeout wins when it arrives before caller abort", () =>
  runCase("timeout-first"));
test("malformed packets are rejected without retry", () =>
  runCase("malformed"));
test("a bogus origin echo is rejected", () => runCase("bogus-origin"));
test("client-mode responses are rejected", () => runCase("client-mode"));
test("non-v4 responses are rejected", () => runCase("old-version"));
test("unsynchronized responses are rejected", () => runCase("unsynchronized"));
test("stratum zero responses are rejected", () => runCase("zero-stratum"));
test("stratum 16 responses are rejected", () => runCase("high-stratum"));
test("socket/send errors retain a network cause", () =>
  runCase("network-error"));
test("late responses cannot change a timeout or leak a socket", () =>
  runCase("late-response"));
test("the first fully validated response wins and siblings close", () =>
  runCase("first-valid-winner"));
