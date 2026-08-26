import { expect, test } from "bun:test";

async function runCase(name: string): Promise<void> {
  const child = Bun.spawn(
    [process.execPath, "packages/node-sdk/runtime/test/runtime-broker-case.ts", name],
    { cwd: process.cwd(), stdout: "pipe", stderr: "pipe", env: process.env },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(exitCode, `${name}\n${stdout}\n${stderr}`).toBe(0);
  expect(stdout).toContain("ok");
}

test("disabled broker path constructs no broker and closes the pool", () =>
  runCase("disabled"));
test("broker start failure performs no duplicate runtime shutdown", () =>
  runCase("start-failure"));
test("later startup failure shuts the ready broker then pool exactly once", () =>
  runCase("startup-failure"));
test("broker shutdown failure remains structural during runtime unwind", () =>
  runCase("shutdown-failure"));
