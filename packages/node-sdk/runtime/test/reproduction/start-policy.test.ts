/**
 * Durable end-to-end oracle for the protocol-owned start policy (project
 * 00034, spec SC-002 and the crash/restart edge cases).
 *
 * Everything below happens across GENUINE subprocess boots of the real runtime
 * against one surviving database, which is the production restart condition:
 * the in-memory config is rebuilt from scratch every time, only what was
 * committed survives.
 *
 *  1. First boot with `startBlockHeight: "latest"` queries the indexer's tip
 *     EXACTLY ONCE and commits the numeric boundary plus provenance `"latest"`.
 *  2. A restart — with the fixture now reporting a completely different tip —
 *     performs ZERO tip queries and reuses the committed boundary.
 *  3. A legacy row seeded WITHOUT provenance (what a pre-00034 database holds)
 *     is backfilled to `"explicit"` on the next boot, with its value untouched.
 *
 * The counted fixture is a real HTTP indexer: the start policy's tip request is
 * the exact one-line `query { block { height } }` that `getMidnightTip` sends,
 * which is byte-distinct from every query `MidnightClient` issues, so tip
 * resolutions can be counted without counting ordinary sync traffic.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { type Harness, setupHarness } from "./harness.ts";
import { BLOCK_TIME_MS, START_TIME } from "./scenario.ts";

/** The exact request `getMidnightTip` sends — nothing else in the tree does. */
const START_POLICY_TIP_QUERY = "query { block { height } }";

const MIDNIGHT_PROTOCOL = "midnightP";
const CLOCK_PROTOCOL = "mainClock";

type Fixture = {
  url: string;
  /** Tip queries issued by the START POLICY (the thing under test). */
  tipHits: number;
  /** Everything else the node asked the indexer (ordinary sync traffic). */
  otherHits: number;
  /** Height the fixture currently reports as the chain tip. */
  height: number;
  stop: () => Promise<void>;
};

/**
 * A counted stand-in for a Midnight indexer.
 *
 * The start policy's tip query gets `height`. Every OTHER query — notably
 * `MidnightClient.fetchLatestBlock`, which the sync state calls once it starts
 * — deliberately gets `height - 1`. That is exactly the boundary at which
 * `MidnightSyncState.stateToInput` decides it has nothing to fetch, so the sync
 * loop idles instead of pulling blocks this test does not care about. The
 * asymmetry is a fixture convenience only; it cannot influence reconciliation,
 * which runs to completion before any sync state exists.
 */
async function startIndexerFixture(height: number): Promise<Fixture> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      let fixture!: Fixture;
      const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request) {
          const body = await request.json().catch(() => ({})) as {
            query?: unknown;
          };
          if (body.query === START_POLICY_TIP_QUERY) {
            fixture.tipHits++;
            return Response.json({ data: { block: { height: fixture.height } } });
          }
          fixture.otherHits++;
          return Response.json({
            data: { block: { height: Math.max(fixture.height - 1, 0) } },
          });
        },
      });
      // Workspace rule: fixtures bind ports above 10000 only.
      if (server.port <= 10_000) {
        await server.stop(true);
        continue;
      }

      fixture = {
        url: `http://127.0.0.1:${server.port}/api/v4/graphql`,
        tipHits: 0,
        otherHits: 0,
        height,
        stop: () => server.stop(true).then(() => undefined),
      };
      return fixture;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ??
    new Error("Unable to allocate a loopback fixture port above 10000");
}

/**
 * One TEST main clock with an EXPLICIT numeric start (the legacy-backfill
 * subject) plus one Midnight parallel protocol asking for `"latest"` (the
 * resolve-once subject). No primitives: this scenario is about startup
 * reconciliation, not block production.
 */
function buildLatestStartConfig(indexer: string) {
  return new ConfigBuilder()
    .setNamespace((b) => b.setSecurityNamespace("sync-repro-start-policy"))
    .buildNetworks((b) =>
      b
        .addNetwork({
          name: "clock",
          type: ConfigNetworkType.TEST,
          startTime: START_TIME,
          blockTimeMS: BLOCK_TIME_MS,
        })
        .addNetwork({
          type: ConfigNetworkType.MIDNIGHT,
          networkId: "stagenet",
        })
    )
    .buildDeployments((b) => b)
    .buildSyncProtocols((b) =>
      b
        .addMain(
          (n) => n.clock,
          () => ({
            name: CLOCK_PROTOCOL,
            type: ConfigSyncProtocolType.TEST_MAIN,
            startBlockHeight: 1,
            pollingInterval: 30,
            stepSize: 1000,
          }),
        )
        .addParallel(
          (n) => (n as any).midnight,
          () => ({
            name: MIDNIGHT_PROTOCOL,
            type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
            indexer,
            startBlockHeight: "latest",
            pollingInterval: 30,
            delayMs: 0,
          }),
        )
    )
    .buildPrimitives((b) => b)
    .build();
}

async function snapshotOf(
  harness: Harness,
  protocolName: string,
): Promise<Record<string, unknown> | undefined> {
  const result = await harness.pool.query<{ immutable_config: unknown }>(
    `SELECT immutable_config
       FROM effectstream.sync_protocol_config_snapshot
      WHERE protocol_name = $1`,
    [protocolName],
  );
  const value = result.rows[0]?.immutable_config;
  if (typeof value === "string") return JSON.parse(value);
  return value as Record<string, unknown> | undefined;
}

let h: Harness;
let fixture: Fixture;

beforeAll(async () => {
  h = await setupHarness();
  fixture = await startIndexerFixture(9_001);
});

afterAll(async () => {
  await fixture?.stop();
  await h?.teardown();
});

test(
  'a "latest" start resolves once, survives a real restart, and backfills legacy rows',
  async () => {
    const config = buildLatestStartConfig(fixture.url);

    // ── Boot 1: first run ────────────────────────────────────────────────
    await h.runToHeight({
      config,
      tips: { [CLOCK_PROTOCOL]: 50 },
      target: 0,
      apiPort: 19171,
      bootOnly: true,
    });

    // Resolved exactly once, and the numeric boundary + provenance are durable
    // by the time startup() returned (spec Acceptance 1).
    expect(fixture.tipHits).toBe(1);
    expect(await snapshotOf(h, MIDNIGHT_PROTOCOL)).toMatchObject({
      startBlockHeight: 9_001,
      startBlockHeightProvenance: "latest",
    });

    // The explicit-start main clock committed its own boundary with `explicit`
    // provenance, through the same generic path and with no tip query at all.
    expect(await snapshotOf(h, CLOCK_PROTOCOL)).toMatchObject({
      startBlockHeight: 1,
      startBlockHeightProvenance: "explicit",
      startTime: START_TIME,
      blockTimeMS: BLOCK_TIME_MS,
    });

    // ── Boot 2: genuine restart, moving tip ──────────────────────────────
    // The chain has moved on. A node that re-queried would start from 12345
    // and silently skip everything in between — the bug this project removes.
    fixture.height = 12_345;
    const hitsBeforeRestart = fixture.tipHits;

    await h.runToHeight({
      config: buildLatestStartConfig(fixture.url),
      tips: { [CLOCK_PROTOCOL]: 50 },
      target: 0,
      apiPort: 19172,
      bootOnly: true,
    });

    // Zero tip queries on the restart path, and the committed boundary wins
    // (spec Acceptance 2).
    expect(fixture.tipHits).toBe(hitsBeforeRestart);
    expect(await snapshotOf(h, MIDNIGHT_PROTOCOL)).toMatchObject({
      startBlockHeight: 9_001,
      startBlockHeightProvenance: "latest",
    });

    // ── Boot 3: legacy row without provenance ────────────────────────────
    // Exactly what a pre-00034 database holds: a numeric start, no provenance.
    await h.pool.query(
      `UPDATE effectstream.sync_protocol_config_snapshot
          SET immutable_config = immutable_config - 'startBlockHeightProvenance'
        WHERE protocol_name = $1`,
      [CLOCK_PROTOCOL],
    );
    const legacy = await snapshotOf(h, CLOCK_PROTOCOL);
    expect(legacy).toBeDefined();
    expect("startBlockHeightProvenance" in legacy!).toBe(false);
    expect(legacy!["startBlockHeight"]).toBe(1);

    await h.runToHeight({
      config: buildLatestStartConfig(fixture.url),
      tips: { [CLOCK_PROTOCOL]: 50 },
      target: 0,
      apiPort: 19173,
      bootOnly: true,
    });

    // Backfilled to `explicit`, value untouched, and still no tip query.
    expect(await snapshotOf(h, CLOCK_PROTOCOL)).toMatchObject({
      startBlockHeight: 1,
      startBlockHeightProvenance: "explicit",
      startTime: START_TIME,
      blockTimeMS: BLOCK_TIME_MS,
    });
    expect(fixture.tipHits).toBe(hitsBeforeRestart);
  },
  180_000,
);
