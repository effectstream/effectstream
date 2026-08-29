// Midnight start-policy oracle (project 00034, spec SC-002 / FR-003).
//
// A counted `Bun.serve` fixture stands in for the indexer: the definition must
// use the already-materialized explicit indexer URL verbatim, hit it exactly
// once per protocol entry on the first run, and never on the restart path
// (which only ever calls `applySnapshot`).

import { afterEach, describe, expect, test } from "bun:test";
import { ConfigNetworkType, ConfigSyncProtocolType } from "@effectstream/config";
import type { SyncProtocolWithNetwork } from "@effectstream/config";
import { midnightStartPolicy } from "../src/sync-protocols/midnight/start-policy.ts";
import { startPolicyRegistry } from "../src/sync-protocols/start-policy.ts";

type TestServer = ReturnType<typeof Bun.serve>;

type Fixture = {
  server: TestServer;
  url: string;
  hits: number;
  paths: string[];
};

const fixtures = new Set<Fixture>();

afterEach(async () => {
  await Promise.all([...fixtures].map((fixture) => stopFixture(fixture)));
});

async function startFixture(height: number): Promise<Fixture> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      let fixture!: Fixture;
      const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch(request) {
          fixture.hits++;
          fixture.paths.push(new URL(request.url).pathname);
          return Response.json({ data: { block: { height } } });
        },
      });
      const port = server.port;
      // Workspace rule: fixtures bind ports above 10000 only.
      if (port <= 10_000) {
        await server.stop(true);
        continue;
      }

      fixture = {
        server,
        url: `http://127.0.0.1:${port}/api/v4/graphql`,
        hits: 0,
        paths: [],
      };
      fixtures.add(fixture);
      return fixture;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Unable to allocate a loopback fixture port above 10000");
}

async function stopFixture(fixture: Fixture): Promise<void> {
  fixtures.delete(fixture);
  await fixture.server.stop(true);
}

function midnightEntry(options: {
  startBlockHeight: number | "latest";
  indexer: string;
  name?: string;
}): SyncProtocolWithNetwork {
  return {
    networkType: ConfigNetworkType.MIDNIGHT,
    syncProtocolType: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
    syncProtocol: {
      name: options.name ?? "midnight",
      type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
      indexer: options.indexer,
      startBlockHeight: options.startBlockHeight,
      requestTimeoutMs: 5_000,
    },
    network: {
      name: options.name ?? "midnight",
      type: ConfigNetworkType.MIDNIGHT,
      networkId: "stagenet",
    },
    primitives: [],
  } as unknown as SyncProtocolWithNetwork;
}

describe("midnightStartPolicy.resolveLatest", () => {
  test("queries the materialized indexer URL verbatim, exactly once", async () => {
    const fixture = await startFixture(9_001);

    const height = await midnightStartPolicy.resolveLatest(
      midnightEntry({ startBlockHeight: "latest", indexer: fixture.url }),
    );

    expect(height).toBe(9_001);
    expect(fixture.hits).toBe(1);
    expect(fixture.paths).toEqual(["/api/v4/graphql"]);
  });

  test("issues one hit per protocol entry on a first run (dedupe is not carried over)", async () => {
    const fixture = await startFixture(4_100);

    const heights = await Promise.all([
      midnightStartPolicy.resolveLatest(
        midnightEntry({
          startBlockHeight: "latest",
          indexer: fixture.url,
          name: "midnight-a",
        }),
      ),
      midnightStartPolicy.resolveLatest(
        midnightEntry({
          startBlockHeight: "latest",
          indexer: fixture.url,
          name: "midnight-b",
        }),
      ),
    ]);

    expect(heights).toEqual([4_100, 4_100]);
    expect(fixture.hits).toBe(2);
  });

  test("is registered for MIDNIGHT_PARALLEL", () => {
    expect(startPolicyRegistry[ConfigSyncProtocolType.MIDNIGHT_PARALLEL]).toBe(
      midnightStartPolicy,
    );
  });
});

describe("midnightStartPolicy snapshot projection", () => {
  test('projects a configured "latest" start into the restored group', () => {
    const entry = midnightEntry({
      startBlockHeight: "latest",
      indexer: "http://127.0.0.1:65535/graphql",
    });

    expect(
      midnightStartPolicy.projectImmutable(entry, {
        startBlockHeight: 9_001,
        provenance: "latest",
      }),
    ).toEqual({
      validated: {},
      restored: { startBlockHeight: 9_001, startBlockHeightProvenance: "latest" },
    });
  });

  test("keeps an explicit start validated", () => {
    const entry = midnightEntry({
      startBlockHeight: 12,
      indexer: "http://127.0.0.1:65535/graphql",
    });

    expect(
      midnightStartPolicy.projectImmutable(entry, {
        startBlockHeight: 12,
        provenance: "explicit",
      }),
    ).toEqual({
      validated: { startBlockHeight: 12 },
      restored: { startBlockHeightProvenance: "explicit" },
    });
  });

  test("the restart path reuses the saved boundary without a single tip query", async () => {
    const fixture = await startFixture(9_001);

    // First run: one query, boundary committed.
    const first = midnightEntry({
      startBlockHeight: "latest",
      indexer: fixture.url,
    });
    const resolved = await midnightStartPolicy.resolveLatest(first);
    const projected = midnightStartPolicy.projectImmutable(first, {
      startBlockHeight: resolved,
      provenance: "latest",
    });
    const persisted = { ...projected.validated, ...projected.restored };
    expect(fixture.hits).toBe(1);

    // Restart: the runtime only applies the saved snapshot.
    const restarted = midnightEntry({
      startBlockHeight: "latest",
      indexer: fixture.url,
    });
    midnightStartPolicy.applySnapshot(restarted, persisted);

    expect(
      (restarted.syncProtocol as unknown as { startBlockHeight: number })
        .startBlockHeight,
    ).toBe(9_001);
    expect(fixture.hits).toBe(1);
  });
});
