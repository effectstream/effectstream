import { expect, test } from "bun:test";

test("runEffectstream settles only after every owned runtime resource is quiescent", async () => {
  const child = Bun.spawn(
    [process.execPath, "packages/node-sdk/runtime/test/run-quiescence-case.ts"],
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
  expect(timedOut, `quiescence case timed out\n${stdout}\n${stderr}`).toBe(false);
  expect(exitCode, `quiescence case failed\n${stdout}\n${stderr}`).toBe(0);
  expect(stdout).toContain("ok");
});
