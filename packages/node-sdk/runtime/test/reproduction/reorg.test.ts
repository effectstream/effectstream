/**
 * Reorg detection, warning and operator reporting (sync/CLAUDE.md Finding #7).
 *
 * A reorg is invisible to forward-only sync: once a block is merged and
 * committed the node never looks at it again. `confirmationDepth` makes that
 * rare, not impossible, and nothing reported it when it happened — the node
 * simply carried on building state from blocks that no longer existed.
 *
 * Three chains here, per the shape of a real deployment: a main clock, a stable
 * parallel chain, and a parallel chain that reorgs. The third is what proves
 * the report attributes the damage to the right chain and leaves the others
 * alone.
 *
 * Both report modes are covered, because they lead to opposite advice:
 *
 *   - **events in the affected range** → state was derived from blocks that no
 *     longer exist; the report enumerates it and gives the rollback runbook.
 *   - **no events in the affected range** → nothing was derived; the report
 *     says so and explicitly tells the operator not to restore anything.
 *
 * Nothing is repaired automatically, so both tests also assert the node keeps
 * running.
 */
import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { TestChainControl } from "@effectstream/sync";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  type Harness,
  type RunningNode,
  setupHarness,
  sleep,
  TEST_PRIMITIVE_TYPE,
} from "./harness.ts";

const START_TIME = 1_700_000_000_000;
const BLOCK_TIME_MS = 1000;
const STEP_SIZE = 50;

const MAIN = "reorgMain";
const PAR_STABLE = "reorgStable";
const PAR_FORKING = "reorgForking";

/** Where the forking chain's history is rewritten. */
const FORK_FROM = 20;
/** Tips: everything syncs well past the fork point before it happens. */
const TIP = 60;

let incidentDir: string;
let controlFile: string;

/**
 * @param eventAtBlock Block on the forking chain that emits a primitive. Placed
 *   at/above FORK_FROM to land inside the affected range, below it to land
 *   outside.
 */
function buildConfig(eventAtBlock: number | null) {
  return new ConfigBuilder()
    .setNamespace((b) => b.setSecurityNamespace("sync-reorg"))
    .buildNetworks((b) =>
      b
        .addNetwork({
          name: "clock",
          type: ConfigNetworkType.TEST,
          startTime: START_TIME,
          blockTimeMS: BLOCK_TIME_MS,
        })
        .addNetwork({
          name: "chainStable",
          type: ConfigNetworkType.TEST,
          startTime: START_TIME,
          blockTimeMS: BLOCK_TIME_MS,
        })
        .addNetwork({
          name: "chainForking",
          type: ConfigNetworkType.TEST,
          startTime: START_TIME,
          blockTimeMS: BLOCK_TIME_MS,
        })
    )
    .buildDeployments((b) => b)
    .buildSyncProtocols((b) =>
      b
        .addMain(
          (n) => n.clock,
          () => ({
            name: MAIN,
            type: ConfigSyncProtocolType.TEST_MAIN,
            startBlockHeight: 1,
            pollingInterval: 30,
            stepSize: STEP_SIZE,
          }),
        )
        .addParallel(
          (n) => (n as any).chainStable,
          () => ({
            name: PAR_STABLE,
            type: ConfigSyncProtocolType.TEST_PARALLEL,
            startBlockHeight: 1,
            pollingInterval: 30,
            stepSize: STEP_SIZE,
            delayMs: 0,
            events: [],
          }),
        )
        .addParallel(
          (n) => (n as any).chainForking,
          () => ({
            name: PAR_FORKING,
            type: ConfigSyncProtocolType.TEST_PARALLEL,
            startBlockHeight: 1,
            pollingInterval: 30,
            stepSize: STEP_SIZE,
            delayMs: 0,
            events: eventAtBlock == null
              ? []
              : [{ atBlock: eventAtBlock, payload: { v: "reorg-test" } }],
          }),
        )
    )
    .buildPrimitives((b) =>
      b.addPrimitive(
        (sp) => (sp as any)[PAR_FORKING],
        () => ({ name: "reorgEvt", type: TEST_PRIMITIVE_TYPE, startBlockHeight: 1 }),
      )
    )
    .build();
}

type HealthBody = {
  status: string;
  protocols: {
    name: string;
    reorgDetectionSupported: boolean;
    reorgDetected: { forkBlock: number; depth: number } | null;
  }[];
};

async function getHealth(port: number): Promise<HealthBody> {
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  return (await res.json()) as HealthBody;
}

/** Wait until the forking protocol reports a detected reorg on /health. */
async function waitForReorg(
  port: number,
  timeoutMs = 60_000,
): Promise<HealthBody["protocols"][number] | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const body = await getHealth(port);
      const p = body.protocols.find((x) => x.name === PAR_FORKING);
      if (p?.reorgDetected != null) return p;
    } catch {
      // node not up yet
    }
    await sleep(200);
  }
  return undefined;
}

function readReport(): { md: string; json: any } | undefined {
  if (!fs.existsSync(incidentDir)) return undefined;
  const files = fs.readdirSync(incidentDir).filter((f) => f.endsWith(".md"));
  if (files.length === 0) return undefined;
  const md = fs.readFileSync(path.join(incidentDir, files[0]), "utf8");
  const json = JSON.parse(
    fs.readFileSync(path.join(incidentDir, files[0].replace(/\.md$/, ".json")), "utf8"),
  );
  return { md, json };
}

let h: Harness;
let node: RunningNode | undefined;

beforeEach(async () => {
  incidentDir = fs.mkdtempSync(path.join(os.tmpdir(), "reorg-incidents-"));
  process.env.EFFECTSTREAM_INCIDENT_PATH = incidentDir;
  // Check often so the test doesn't wait out the 30s production cadence.
  process.env.EFFECTSTREAM_REORG_CHECK_INTERVAL_MS = "200";
  // File-backed chain control: the node runs in a subprocess, so mutating an
  // in-memory registry here would never reach it. This is what lets the test
  // fork the chain while the node is running rather than only at spawn time.
  controlFile = path.join(incidentDir, "chain-control.json");
  process.env.TEST_CHAIN_CONTROL_FILE = controlFile;
  TestChainControl.clear();
  h = await setupHarness();
});
afterEach(async () => {
  await node?.stop();
  node = undefined;
  delete process.env.EFFECTSTREAM_INCIDENT_PATH;
  delete process.env.EFFECTSTREAM_REORG_CHECK_INTERVAL_MS;
  delete process.env.TEST_CHAIN_CONTROL_FILE;
  fs.rmSync(incidentDir, { recursive: true, force: true });
  await h?.teardown();
});

test("reorg over blocks that produced state: detected, reported, with a runbook", async () => {
  // The event lands inside the range the fork invalidates.
  const config = buildConfig(FORK_FROM + 5);
  TestChainControl.setTip(MAIN, TIP);
  TestChainControl.setTip(PAR_STABLE, TIP);
  TestChainControl.setTip(PAR_FORKING, TIP);

  node = await h.runNode({ config, apiPort: 19181 });

  // Let the node commit blocks (and their source hashes) past the fork point.
  await sleep(4_000);

  // Now rewrite the forking chain's history from FORK_FROM upward.
  TestChainControl.setFork(PAR_FORKING, { fromBlock: FORK_FROM, nonce: "b" });

  const detected = await waitForReorg(node.apiPort);
  expect(detected).toBeDefined();
  expect(detected!.reorgDetected!.forkBlock).toBe(FORK_FROM);

  // Only the chain that actually reorged is flagged.
  const body = await getHealth(node.apiPort);
  for (const name of [MAIN, PAR_STABLE]) {
    const other = body.protocols.find((p) => p.name === name);
    expect(other?.reorgDetected ?? null).toBeNull();
  }

  const report = readReport();
  expect(report).toBeDefined();

  // The report names the chain and the fork point...
  expect(report!.md).toContain(PAR_FORKING);
  expect(report!.md).toContain(`Diverges from source block**: ${FORK_FROM}`);
  // ...reports that state WAS derived...
  expect(report!.md).toContain("state was derived from the reorganised blocks");
  expect(report!.json.impact.isEmpty).toBe(false);
  // ...and gives the operator the actual commands, not just a warning.
  expect(report!.md).toContain("If you decide to roll back");
  expect(report!.md).toContain("DELETE FROM effectstream.sync_protocol_pagination");
  expect(report!.md).toContain("pg_restore");
  // Nothing was repaired automatically.
  expect(report!.md).toContain("Why this was not fixed automatically");

  // And the node is still alive after all of it.
  expect((await getHealth(node.apiPort)).protocols.length).toBe(3);
}, 180_000);

test("reorg over empty blocks: detected, reported as no action required", async () => {
  // No events at all on the forking chain, so the affected range is empty.
  const config = buildConfig(null);
  TestChainControl.setTip(MAIN, TIP);
  TestChainControl.setTip(PAR_STABLE, TIP);
  TestChainControl.setTip(PAR_FORKING, TIP);

  node = await h.runNode({ config, apiPort: 19182 });
  await sleep(4_000);

  TestChainControl.setFork(PAR_FORKING, { fromBlock: FORK_FROM, nonce: "c" });

  const detected = await waitForReorg(node.apiPort);
  expect(detected).toBeDefined();

  const report = readReport();
  expect(report).toBeDefined();

  // The whole point of the impact assessment: same event, opposite advice.
  expect(report!.json.impact.isEmpty).toBe(true);
  expect(report!.md).toContain("Impact: none — no action required");
  expect(report!.md).toContain("You do not need to restore from a snapshot");
  // No runbook is offered, because there is nothing to undo.
  expect(report!.md).not.toContain("If you decide to roll back");
}, 180_000);
