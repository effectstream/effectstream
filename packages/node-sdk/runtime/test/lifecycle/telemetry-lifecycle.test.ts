/**
 * Reproductions for the telemetry half of the runtime resource lifecycle
 * (spec 00031: G4, plus the spec's "a telemetry failure does not skip broker,
 * HTTP, database, or child-task cleanup" edge case).
 *
 * Each scenario runs in its own subprocess — see `fixtures/telemetry-lifecycle.ts`
 * for why — and is asserted from the marker order on its stdout.
 */
import { expect, test } from "bun:test";

const FIXTURE = new URL("./fixtures/telemetry-lifecycle.ts", import.meta.url)
  .pathname;

async function runFixture(mode: string): Promise<string> {
  const child = Bun.spawn([process.execPath, FIXTURE, mode], {
    cwd: new URL("../../../../..", import.meta.url).pathname,
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
  return output;
}

test("G4: halting the scope that ran init() shuts the OpenTelemetry SDK down", async () => {
  const output = await runFixture("observe");

  expect(output).toContain("SIBLING_CLEANUP");
  expect(output).toContain("HALT_SETTLED:ok");
  // `init()` starts a NodeSDK (periodic metric reader, batch span/log
  // processors, auto-instrumentation) and never tears it down.
  expect(output).toContain("TELEMETRY_SHUTDOWN");
  // Telemetry is acquired first, so it must be released last: everything it
  // instruments has to be able to emit while it is still shutting down.
  expect(output.indexOf("SIBLING_CLEANUP")).toBeLessThan(
    output.indexOf("TELEMETRY_SHUTDOWN"),
  );
}, 60_000);

test("G4: a failing telemetry shutdown neither skips other cleanup nor disappears", async () => {
  const output = await runFixture("failing-shutdown");

  // Spec edge case: the sibling resource is torn down regardless, and it is
  // torn down first — telemetry is released last.
  expect(output).toContain("SIBLING_CLEANUP");
  expect(output).toContain("TELEMETRY_SHUTDOWN");
  expect(output.indexOf("SIBLING_CLEANUP")).toBeLessThan(
    output.indexOf("TELEMETRY_SHUTDOWN"),
  );
  // The failure is reported rather than swallowed silently...
  expect(output).toContain("TELEMETRY_SHUTDOWN_REPORTED");
  // ...but a lost telemetry flush does not turn an otherwise clean shutdown
  // into a failed one: `shutdown()` also rejects when the collector is simply
  // unreachable, and every resource that matters is already released.
  expect(output).toContain("HALT_SETTLED:ok");
}, 60_000);
