/**
 * Reproductions for the runtime-level resource boundaries in `src/main.ts`
 * (spec 00031: G2, G3, G5, G8, G10b).
 *
 * Every scenario boots the real `start()` in its own subprocess — see
 * `fixtures/runtime-lifecycle.ts` — so these tests only allocate ports, launch
 * the scenarios once, and assert on the markers each one printed.
 */
import { beforeAll, expect, test } from "bun:test";
import { freeDistinctPorts } from "./support.ts";

const FIXTURE = new URL("./fixtures/runtime-lifecycle.ts", import.meta.url)
  .pathname;
const CWD = new URL("../../../../..", import.meta.url).pathname;

type Mode =
  | "broker-cancel-during-start"
  | "broker-shutdown-error"
  | "child-failure-with-pool-end-error";

const MODES: Mode[] = [
  "broker-cancel-during-start",
  "broker-shutdown-error",
  "child-failure-with-pool-end-error",
];

const outputs = new Map<Mode, string>();

async function runScenario(mode: Mode, ports: number[]): Promise<string> {
  const [apiPort, pglitePort, brokerTcpPort, brokerWsPort] = ports;
  const spec = JSON.stringify({
    mode,
    apiPort,
    pglitePort,
    brokerTcpPort,
    brokerWsPort,
  });
  const child = Bun.spawn([process.execPath, FIXTURE, spec], {
    cwd: CWD,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const output = `${stdout}\n${stderr}`;
  expect(exitCode, `${mode} fixture failed:\n${output}`).toBe(0);
  expect(output, `${mode} fixture did not finish:\n${output}`).toContain(
    `FIXTURE_DONE:${mode}`,
  );
  return output;
}

/** Read a `MARKER:value` line the fixture printed. */
function marker(mode: Mode, name: string): string {
  const output = outputs.get(mode) ?? "";
  const match = output.match(new RegExp(`^${name}:(.*)$`, "m"));
  if (!match) {
    throw new Error(`marker ${name} missing from ${mode} output:\n${output}`);
  }
  return match[1].trim();
}

beforeAll(async () => {
  // Allocate every port in one sequential pass BEFORE launching anything:
  // concurrent allocation can hand the same OS-selected port to two scenarios,
  // and a leaked listener in one would then be misread as the other's.
  const ports = await freeDistinctPorts(4 * MODES.length);
  // The scenarios are independent processes on disjoint ports, so run them
  // concurrently: each one boots a database and the whole engine.
  const results = await Promise.all(
    MODES.map((mode, index) =>
      runScenario(mode, ports.slice(index * 4, index * 4 + 4))
    ),
  );
  MODES.forEach((mode, index) => outputs.set(mode, results[index]));
}, 300_000);

test("G2: cancelling start() while the broker is still starting still shuts the broker down", () => {
  // The broker really bound both listeners before start() was cancelled.
  expect(marker("broker-cancel-during-start", "BROKER_TCP_BOUND")).toBe("yes");
  expect(marker("broker-cancel-during-start", "AFTER_HALT_BROKER_TCP")).toBe(
    "free",
  );
  expect(marker("broker-cancel-during-start", "AFTER_HALT_BROKER_WS")).toBe(
    "free",
  );
});

test("G10b: the broker's ports are immediately rebindable after a cancelled start", () => {
  // Spec Acceptance 1 for the broker half: a leaked listener is exactly what
  // makes a second run of the same node fail on a fixed port.
  const tcp = marker("broker-cancel-during-start", "AFTER_HALT_BROKER_TCP");
  const ws = marker("broker-cancel-during-start", "AFTER_HALT_BROKER_WS");
  expect({ tcp, ws }).toEqual({ tcp: "free", ws: "free" });
});

test("G3: a broker shutdown failure is reported, not swallowed", () => {
  expect(marker("broker-shutdown-error", "BROKER_TCP_BOUND")).toBe("yes");
  // The broker released its ports and then failed; the runtime must not
  // report that teardown as clean.
  expect(marker("broker-shutdown-error", "AFTER_HALT_BROKER_TCP")).toBe("free");
  expect(marker("broker-shutdown-error", "HALT_SETTLED")).toContain(
    "broker-shutdown-boom",
  );
});

test("G8: a dbConn.end() failure does not replace the primary error", () => {
  // Scenario: the API port is occupied, so the spawned HTTP child fails at
  // listen (the primary, causal failure), and the pool's end() then rejects.
  const settled = marker("child-failure-with-pool-end-error", "TASK_SETTLED");
  expect(settled).toContain("pool-end-boom");
  expect(settled).toContain("EADDRINUSE");
});

test("G5: a failing child task's error survives the runtime's own cleanup", () => {
  // Same scenario, read from the child-supervision side: the runtime has no
  // boundary that retains a child's failure once a later frame cleanup throws,
  // so the only error the host ever sees is the cleanup's.
  const settled = marker("child-failure-with-pool-end-error", "TASK_SETTLED");
  expect(settled).toContain("EADDRINUSE");
  // ...and it must come first: the child failed before anything was cleaned up.
  expect(settled.indexOf("EADDRINUSE")).toBeLessThan(
    settled.indexOf("pool-end-boom"),
  );
});
