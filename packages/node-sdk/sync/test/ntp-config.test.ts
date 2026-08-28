import { expect, test } from "bun:test";

async function runCase(name: string): Promise<void> {
  const child = Bun.spawn(
    [process.execPath, "packages/node-sdk/sync/test/ntp-case.ts", name],
    { cwd: process.cwd(), stdout: "pipe", stderr: "pipe", env: process.env },
  );
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 5_000);
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  clearTimeout(timeout);
  expect(timedOut, `${name} timed out`).toBe(false);
  expect(exitCode, `${name}\n${stdout}\n${stderr}`).toBe(0);
  expect(stdout).toContain("ok");
}

test("absent and empty server lists preserve the default singleton", () =>
  runCase("defaults"));
test("configured traffic ignores a preloaded default singleton", () =>
  runCase("configured-after-singleton"));
test("configured fetchers have isolated caches", () => runCase("isolated-caches"));
test("one sample followed by silence returns bounded partial success", () =>
  runCase("partial"));
test("zero responses reject after bounded no-progress rounds", () => runCase("zero"));
test("malformed packets reject without leaking sockets", () => runCase("malformed"));
test("a later sampling round can recover", () => runCase("retry-recovery"));
test("a synchronous packet/send failure closes its UDP socket", () =>
  runCase("synchronous-send-error"));
test("halted non-cancellable sampling still releases sockets within its bound", () =>
  runCase("halt-in-flight"));
test("RFC5905 offset keeps both signs", () => runCase("offset-signs"));
test("offset magnitude warnings cover both clock directions", () =>
  runCase("offset-warnings"));

test("dependency and lock integrity are exact", async () => {
  const manifest = await Bun.file("packages/node-sdk/sync/package.json").json();
  const lock = await Bun.file("bun.lock").text();
  expect(manifest.dependencies["ntp-time-sync"]).toBe("0.6.0");
  expect(lock).toContain('"ntp-time-sync": ["ntp-time-sync@0.6.0"');
  expect(lock).toContain(
    "sha512-7hKnLUZN04goatNThks+raCAI4xRkF0UTdvoj7zpGsp1LDtyAJp4yguIIFYsLng6BKlheYfIOOyqY+eqvPsaCA==",
  );
  expect(lock).toContain('"ntp-packet-parser": ["ntp-packet-parser@0.6.1"');
});
