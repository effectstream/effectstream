import { expect, test } from "bun:test";

async function runCase(scenario: "canonical" | "legacy"): Promise<void> {
  const child = Bun.spawn(
    [
      process.execPath,
      "packages/node-sdk/runtime/test/run-quiescence-case.ts",
      scenario,
    ],
    { cwd: process.cwd(), stdout: "pipe", stderr: "pipe", env: process.env },
  );
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 10_000);
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  clearTimeout(timeout);
  expect(timedOut, `${scenario} quiescence case timed out\n${stdout}\n${stderr}`).toBe(false);
  expect(exitCode, `${scenario} quiescence case failed\n${stdout}\n${stderr}`).toBe(0);
  expect(stdout).toContain("ok");
}

test("runEffectstream settles only after every owned runtime resource is quiescent", () =>
  runCase("canonical"));

test("legacy init/start keeps its namespace, messaging, and resource behavior", () =>
  runCase("legacy"));
