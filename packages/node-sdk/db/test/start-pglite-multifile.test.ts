import { expect, test } from "bun:test";

test("default close with a retained raw client does not poison the next test file", async () => {
  const fixtures = new URL("./fixtures/pglite-close/", import.meta.url);
  const child = Bun.spawn([
    process.execPath,
    "test",
    "--max-concurrency=1",
    new URL("01-sentinel.test.ts", fixtures).pathname,
    new URL("02-live-client.test.ts", fixtures).pathname,
  ], {
    cwd: new URL("../../../..", import.meta.url).pathname,
    env: {
      ...process.env,
      EFFECTSTREAM_PGLITE_MULTIFILE_FIXTURE: "1",
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const output = `${stdout}\n${stderr}`;

  expect(exitCode, output).toBe(0);
  expect(output).toContain("PGLITE_LIVE_CLIENT_CLOSED_DEFAULT");
  expect(output).toContain("PGLITE_SENTINEL_REGISTERED");
  expect(output).not.toContain("Unhandled error between tests");
  expect(output).not.toContain("Connection terminated unexpectedly");
}, 30_000);
