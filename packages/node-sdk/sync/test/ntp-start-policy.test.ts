// NTP start-policy oracle (project 00034, spec SC-002 / FR-003).
//
// Uses the same real-UDP fixture shape as `ntp-tip.test.ts`: `resolveLatest`
// must reach a live NTP server exactly once and derive the inclusive boundary
// with the protocol's own arithmetic. `projectImmutable`/`applySnapshot` must
// round-trip the clock fields that make a restart reuse the saved mapping.

import { afterEach, describe, expect, test } from "bun:test";
import { createSocket, type RemoteInfo, type Socket } from "node:dgram";
import { ConfigNetworkType, ConfigSyncProtocolType } from "@effectstream/config";
import type { SyncProtocolWithNetwork } from "@effectstream/config";
import { ntpStartPolicy } from "../src/sync-protocols/ntp/start-policy.ts";
import { startPolicyRegistry } from "../src/sync-protocols/start-policy.ts";

const NTP_EPOCH_OFFSET_MS = 2_208_988_800_000;

type Fixture = {
  server: string;
  hits: () => number;
  close: () => Promise<void>;
};

const fixtures: Fixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.close()));
});

function writeTimestamp(buffer: Buffer, offset: number, unixMs: number): void {
  const ntpMs = unixMs + NTP_EPOCH_OFFSET_MS;
  buffer.writeUInt32BE(Math.floor(ntpMs / 1000) >>> 0, offset);
  buffer.writeUInt32BE(Math.floor(((ntpMs % 1000) / 1000) * 2 ** 32) >>> 0, offset + 4);
}

function responseFor(request: Buffer, serverTimeMs: number): Buffer {
  const response = Buffer.alloc(48);
  response[0] = (4 << 3) | 4; // leap 0, version 4, mode server
  response[1] = 1; // stratum
  response[3] = 0xec; // precision, 2^-20s
  response.write("LOCL", 12, 4, "ascii");
  writeTimestamp(response, 16, serverTimeMs - 1_000);
  request.copy(response, 24, 40, 48); // echo the client transmit as origin
  writeTimestamp(response, 32, serverTimeMs);
  writeTimestamp(response, 40, serverTimeMs);
  return response;
}

async function startFixture(serverTimeMs: number): Promise<Fixture> {
  const socket = createSocket("udp4");
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(0, "127.0.0.1", () => {
      socket.removeListener("error", reject);
      resolve();
    });
  });
  let hits = 0;
  socket.on("message", (request: Buffer, remote: RemoteInfo) => {
    hits += 1;
    (socket as Socket).send(
      responseFor(request, serverTimeMs),
      remote.port,
      remote.address,
    );
  });
  const fixture: Fixture = {
    server: `127.0.0.1:${socket.address().port}`,
    hits: () => hits,
    close: () =>
      new Promise<void>((resolve) => {
        try {
          socket.close(() => resolve());
        } catch {
          resolve();
        }
      }),
  };
  fixtures.push(fixture);
  return fixture;
}

function ntpEntry(options: {
  startBlockHeight: number | "latest";
  startTime: number;
  blockTimeMS: number;
  servers?: string[];
}): SyncProtocolWithNetwork {
  return {
    networkType: ConfigNetworkType.NTP,
    syncProtocolType: ConfigSyncProtocolType.NTP_MAIN,
    syncProtocol: {
      name: "clock",
      type: ConfigSyncProtocolType.NTP_MAIN,
      startBlockHeight: options.startBlockHeight,
      requestTimeoutMs: 5_000,
    },
    network: {
      name: "clock",
      type: ConfigNetworkType.NTP,
      startTime: options.startTime,
      blockTimeMS: options.blockTimeMS,
      ...(options.servers ? { servers: options.servers } : {}),
    },
    primitives: [],
  } as unknown as SyncProtocolWithNetwork;
}

describe("ntpStartPolicy.resolveLatest", () => {
  test("derives the inclusive boundary from the network clock and hits the server once", async () => {
    const startTime = 1_000_000;
    const blockTimeMS = 600_000;
    const serverTimeMs = startTime + blockTimeMS * 7 + 123;
    const fixture = await startFixture(serverTimeMs);

    const height = await ntpStartPolicy.resolveLatest(
      ntpEntry({
        startBlockHeight: "latest",
        startTime,
        blockTimeMS,
        servers: [fixture.server],
      }),
    );

    expect(height).toBe(Math.floor((serverTimeMs - startTime) / blockTimeMS));
    expect(height).toBe(7);
    expect(fixture.hits()).toBe(1);
  });

  test("is registered for NTP_MAIN", () => {
    expect(startPolicyRegistry[ConfigSyncProtocolType.NTP_MAIN]).toBe(
      ntpStartPolicy,
    );
  });
});

describe("ntpStartPolicy snapshot projection", () => {
  test("keeps the clock fields restored and an explicit start validated", () => {
    const entry = ntpEntry({
      startBlockHeight: 5,
      startTime: 1_700_000_000_000,
      blockTimeMS: 1_000,
    });

    expect(
      ntpStartPolicy.projectImmutable(entry, {
        startBlockHeight: 5,
        provenance: "explicit",
      }),
    ).toEqual({
      validated: { startBlockHeight: 5 },
      restored: {
        startTime: 1_700_000_000_000,
        blockTimeMS: 1_000,
        startBlockHeightProvenance: "explicit",
      },
    });
  });

  test('moves the start into the restored group when the config says "latest"', () => {
    const entry = ntpEntry({
      startBlockHeight: "latest",
      startTime: 1_700_000_000_000,
      blockTimeMS: 1_000,
    });

    expect(
      ntpStartPolicy.projectImmutable(entry, {
        startBlockHeight: 4_242,
        provenance: "latest",
      }),
    ).toEqual({
      validated: {},
      restored: {
        startTime: 1_700_000_000_000,
        blockTimeMS: 1_000,
        startBlockHeight: 4_242,
        startBlockHeightProvenance: "latest",
      },
    });
  });

  test("applySnapshot restores the saved clock and start onto the live config", () => {
    // A restarted single-file node re-samples `Date.now()` for `startTime`;
    // the saved mapping must win or the NTP time→block mapping shifts.
    const entry = ntpEntry({
      startBlockHeight: "latest",
      startTime: 9_999_999_999,
      blockTimeMS: 2_000,
    });

    ntpStartPolicy.applySnapshot(entry, {
      startTime: 1_700_000_000_000,
      blockTimeMS: 1_000,
      startBlockHeight: 4_242,
      startBlockHeightProvenance: "latest",
    });

    expect(entry.network).toMatchObject({
      startTime: 1_700_000_000_000,
      blockTimeMS: 1_000,
    });
    expect(
      (entry.syncProtocol as unknown as { startBlockHeight: number })
        .startBlockHeight,
    ).toBe(4_242);
  });

  test("round-trips a first-run projection back onto a freshly built config", () => {
    const first = ntpEntry({
      startBlockHeight: "latest",
      startTime: 1_700_000_000_000,
      blockTimeMS: 1_000,
    });
    const projected = ntpStartPolicy.projectImmutable(first, {
      startBlockHeight: 4_242,
      provenance: "latest",
    });
    const persisted = { ...projected.validated, ...projected.restored };

    const restarted = ntpEntry({
      startBlockHeight: "latest",
      startTime: 1_800_000_000_000,
      blockTimeMS: 1_000,
    });
    ntpStartPolicy.applySnapshot(restarted, persisted);

    expect(restarted.network).toMatchObject({
      startTime: 1_700_000_000_000,
      blockTimeMS: 1_000,
    });
    expect(
      (restarted.syncProtocol as unknown as { startBlockHeight: number })
        .startBlockHeight,
    ).toBe(4_242);
  });
});
