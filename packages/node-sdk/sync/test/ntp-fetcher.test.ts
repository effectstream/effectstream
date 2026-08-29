import { expect, test } from "bun:test";

async function runCase(name: string): Promise<void> {
  const child = Bun.spawn(
    [process.execPath, "packages/node-sdk/sync/test/ntp-fetcher-case.ts", name],
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

test(
  "absent and empty fetchers each own a clock instance",
  () => runCase("default-owned"),
  35_000,
);
test(
  "configured server arrays are defensively copied",
  () => runCase("configured-copy"),
  35_000,
);
test(
  "sequential configured fetchers isolate traffic and cache",
  () => runCase("sequential-isolation"),
  35_000,
);
test(
  "concurrent configured fetchers isolate traffic and signed offsets",
  () => runCase("concurrent-isolation"),
  35_000,
);
test(
  "explicit numeric NTP state preserves historical page-1 presync",
  () => runCase("numeric-page-one"),
  35_000,
);
test(
  "offset warnings use magnitude in both clock directions",
  () => runCase("offset-warnings"),
  35_000,
);

test("NTP dependencies and lock integrity are exact", async () => {
  const manifest = await Bun.file("packages/node-sdk/sync/package.json").json();
  const lock = await Bun.file("bun.lock").text();
  expect(manifest.dependencies["ntp-time-sync"]).toBe("0.6.0");
  // ntp-packet-parser is ntp-time-sync's own dependency, not a direct one.
  expect(manifest.dependencies["ntp-packet-parser"]).toBeUndefined();
  expect(lock).toContain('"ntp-time-sync": ["ntp-time-sync@0.6.0"');
  expect(lock).toContain(
    "sha512-7hKnLUZN04goatNThks+raCAI4xRkF0UTdvoj7zpGsp1LDtyAJp4yguIIFYsLng6BKlheYfIOOyqY+eqvPsaCA==",
  );
  expect(lock).toContain('"ntp-packet-parser": ["ntp-packet-parser@0.6.1"');
  expect(lock).toContain(
    "sha512-nIDaxXcaxDsSj0Fh+Daa1nsmBwc2ENxeWOHmyEnbj7Cl3Jgzl03gCqV+jWOAvB46ooibbAaTAjMhy0lzlHUPSg==",
  );
});
