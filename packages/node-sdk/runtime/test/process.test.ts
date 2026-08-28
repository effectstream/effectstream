import { expect, test } from "bun:test";

async function runCase(...args: string[]): Promise<void> {
  const child = Bun.spawn(
    [process.execPath, "packages/node-sdk/runtime/test/process-case.ts", ...args],
    {
      cwd: process.cwd(),
      env: { ...process.env, MQTT_BROKER: "false" },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(exitCode, `${args.join(" ")}\n${stdout}\n${stderr}`).toBe(0);
  expect(stdout).toContain("ok");
}

test("normal completion is one-shot", () => runCase("normal"));
test("invalid signals do not claim the process", () => runCase("invalid"));
test("already-aborted input does not claim the process", () => runCase("already-aborted"));
test("abort during listener acquisition is caught by the recheck", () => runCase("abort-race"));
test("partial listener acquisition rolls back", () => runCase("listener-failure"));
test("startup failures retain their exact cause", () => runCase("startup-failure"));
test("a child Error('halted') is not the terminal sentinel", () => runCase("child-halted"));
test("a spawned child Error('halted') survives a successful racing halt", () =>
  runCase("child-halted-race"));
test.each(["undefined", "null", "false", "zero", "empty", "error"])(
  "runtime rejection reason %s remains structural",
  (reason) => runCase("runtime-reason", reason),
);
test("external abort preserves its reason", () => runCase("external-abort"));
test("cleanup failure overrides cancellation and is deduplicated", () => runCase("cleanup-failure"));
test.each(["undefined", "null", "false", "zero", "empty", "error"])(
  "cleanup rejection reason %s remains structural",
  (reason) => runCase("cleanup-reason", reason),
);
test("SIGINT requests controlled shutdown", () => runCase("signal", "SIGINT"));
test("SIGTERM requests controlled shutdown", () => runCase("signal", "SIGTERM"));
test("duplicate and repeated signals halt once and restore listeners", () =>
  runCase("repeat-signal"));
test("false installs no process listeners", () => runCase("no-listeners"));
test("default/default calls reject concurrent reuse", () =>
  runCase("concurrency", "default", "default"));
test("default/false calls reject concurrent reuse", () =>
  runCase("concurrency", "default", "false"));
test("false/false calls reject concurrent reuse", () =>
  runCase("concurrency", "false", "false"));
