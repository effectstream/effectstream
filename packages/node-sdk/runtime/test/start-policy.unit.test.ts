import { expect, test } from "bun:test";
import {
  ConfigNetworkType,
  ConfigSyncProtocolType,
  type SyncProtocolWithNetwork,
} from "@effectstream/config";
import { MidnightGenericPrimitive } from "@effectstream/sm";
import pg from "pg";
import { run } from "effection";
import {
  cloneRuntimeSyncInfo,
  inheritPrimitiveConfig,
} from "../src/canonical-config.ts";
import { validateAndSnapshotConfig } from "../src/config-snapshot.ts";

test("inherited Midnight facts survive the real primitive getConfig round trip", () => {
  const owner = {
    networkType: ConfigNetworkType.MIDNIGHT,
    syncProtocolType: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
    network: {
      type: ConfigNetworkType.MIDNIGHT,
      name: "midnight",
      networkId: "stagenet",
    },
    syncProtocol: {
      type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
      name: "midnight",
      startBlockHeight: 750,
    },
    primitives: [],
  } as unknown as SyncProtocolWithNetwork;
  const inherited = inheritPrimitiveConfig(owner, {
    type: "Midnight:Generic",
    contractAddress: "0".repeat(64),
    ledgerSchema: { round: "uint128" },
    stateMachinePrefix: "batata",
  });
  const primitive = new MidnightGenericPrimitive({
    ...inherited,
    instanceName: "game",
  } as any);

  expect(primitive.getConfig()).toMatchObject({
    startBlockHeight: 750,
    networkId: "stagenet",
    stateMachinePrefix: "batata",
    scheduledPrefix: "batata",
  });
});

const postgresTest = process.env.E3_PG_HOST ? test : test.skip;

postgresTest("commits and reuses numeric latest boundaries in PostgreSQL", async () => {
  const pool = new pg.Pool({
    host: process.env.E3_PG_HOST,
    port: Number(process.env.E3_PG_PORT),
    user: "postgres",
    password: "postgres",
    database: "postgres",
  });
  try {
    await pool.query("CREATE SCHEMA IF NOT EXISTS effectstream");
    await pool.query(`CREATE TABLE effectstream.sync_protocol_config_snapshot (
      protocol_name TEXT PRIMARY KEY,
      network_type TEXT NOT NULL,
      immutable_config JSONB NOT NULL
    )`);
    const source = {
      networkType: ConfigNetworkType.NTP,
      syncProtocolType: ConfigSyncProtocolType.NTP_MAIN,
      network: {
        type: ConfigNetworkType.NTP,
        name: "clock",
        startTime: 1_000,
        blockTimeMS: 1_000,
      },
      syncProtocol: {
        type: ConfigSyncProtocolType.NTP_MAIN,
        name: "clock",
        startBlockHeight: "latest",
      },
      primitives: [],
    } as unknown as SyncProtocolWithNetwork;

    const first = cloneRuntimeSyncInfo([source]);
    const firstClient = await pool.connect();
    try {
      await run(function* () {
        yield* validateAndSnapshotConfig(first, firstClient, {
          resolveNtp: async () => 63,
        });
      });
    } finally {
      firstClient.release();
    }
    const saved = await pool.query(
      "SELECT immutable_config FROM effectstream.sync_protocol_config_snapshot WHERE protocol_name = 'clock'",
    );
    expect(saved.rows[0].immutable_config).toMatchObject({
      startBlockHeight: 63,
      startBlockHeightProvenance: "latest",
    });

    const restarted = cloneRuntimeSyncInfo([source]);
    const restartClient = await pool.connect();
    try {
      await run(function* () {
        yield* validateAndSnapshotConfig(restarted, restartClient, {
          resolveNtp: async () => {
            throw new Error("committed restart must not resolve");
          },
        });
      });
    } finally {
      restartClient.release();
    }
    expect((restarted[0].syncProtocol as any).startBlockHeight).toBe(63);
  } finally {
    await pool.end();
  }
});
