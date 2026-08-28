import { afterEach, beforeEach, expect, test } from "bun:test";
import { run } from "effection";
import type { Client } from "pg";
import {
  ConfigNetworkType,
  ConfigSyncProtocolType,
  type SyncProtocolWithNetwork,
} from "@effectstream/config";

type StoredRow = {
  network_type: ConfigNetworkType;
  immutable_config: Record<string, unknown>;
};
let store: Record<string, StoredRow | undefined> = {};
let transactionBackup: Record<string, StoredRow | undefined> | undefined;

function cloneStore() {
  return structuredClone(store);
}

const transactionClient = {
  async query(sql: string, params?: unknown[]) {
    if (sql === "BEGIN") {
      transactionBackup = cloneStore();
    } else if (sql === "COMMIT") {
      transactionBackup = undefined;
    } else if (sql === "ROLLBACK") {
      store = transactionBackup ?? {};
      transactionBackup = undefined;
    } else {
      throw new Error(`Unexpected SQL in snapshot unit test: ${sql}`);
    }
    return { rows: [] };
  },
} as unknown as Client;

const { validateAndSnapshotConfig } = await import("../src/config-snapshot.ts");
const { cloneRuntimeSyncInfo, inheritPrimitiveConfig } = await import(
  "../src/canonical-config.ts"
);

function cardanoUtxoRpcProtocol(
  startChainPoint: unknown,
): SyncProtocolWithNetwork {
  return {
    networkType: ConfigNetworkType.CARDANO,
    syncProtocolType: ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL,
    syncProtocol: { name: "cardano-utxorpc", startChainPoint },
    network: {},
    primitives: [],
  } as unknown as SyncProtocolWithNetwork;
}

function ntpProtocol(
  startBlockHeight: number | "latest",
  primitiveStart?: number,
): SyncProtocolWithNetwork {
  return {
    networkType: ConfigNetworkType.NTP,
    syncProtocolType: ConfigSyncProtocolType.NTP_MAIN,
    network: {
      type: ConfigNetworkType.NTP,
      name: "ntp",
      startTime: 1_000,
      blockTimeMS: 1_000,
    },
    syncProtocol: {
      type: ConfigSyncProtocolType.NTP_MAIN,
      name: "ntp",
      startBlockHeight,
    },
    primitives: [{
      id: "clock",
      syncProtocol: ConfigSyncProtocolType.NTP_MAIN,
      primitive: {
        name: "clock",
        type: "NTP:Clock",
        ...(primitiveStart === undefined
          ? {}
          : { startBlockHeight: primitiveStart }),
      },
    }],
  } as unknown as SyncProtocolWithNetwork;
}

function midnightProtocol(
  startBlockHeight: number | "latest",
): SyncProtocolWithNetwork {
  return {
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
      startBlockHeight,
      indexer: "http://127.0.0.1:12345/graphql",
    },
    primitives: [],
  } as unknown as SyncProtocolWithNetwork;
}

async function runValidate(
  protocols: SyncProtocolWithNetwork[],
  hooks: Record<string, unknown> = {},
): Promise<void> {
  await run(function* () {
    yield* validateAndSnapshotConfig(protocols, transactionClient, {
      ...hooks,
      getSnapshot: async (name) => store[name] ? [store[name]!] : [],
      upsertSnapshot: async (name, networkType, snapshot) => {
        store[name] ??= {
          network_type: networkType,
          immutable_config: structuredClone(snapshot),
        };
      },
      updateSnapshot: async (name, networkType, snapshot) => {
        store[name] = {
          network_type: networkType,
          immutable_config: structuredClone(snapshot),
        };
      },
    });
  });
}

beforeEach(() => {
  store = {};
  transactionBackup = undefined;
  delete process.env.USE_DB_STARTHEIGHT;
});

afterEach(() => {
  delete process.env.USE_DB_STARTHEIGHT;
});

test("unchanged unrelated protocol snapshots retain their existing behavior", async () => {
  const first = cardanoUtxoRpcProtocol({ slot: 1, hash: "0xabc" });
  await runValidate([first]);
  expect(store["cardano-utxorpc"]?.immutable_config).toEqual({
    startChainPoint: { slot: 1, hash: "0xabc" },
  });
  await expect(
    runValidate([cardanoUtxoRpcProtocol({ slot: 1, hash: "0xabc" })]),
  ).resolves.toBeUndefined();
  await expect(
    runValidate([cardanoUtxoRpcProtocol(undefined)]),
  ).rejects.toThrow(/\[config-snapshot\] CRITICAL/);
});

test("resolves NTP and Midnight independently and commits numeric provenance", async () => {
  const protocols = cloneRuntimeSyncInfo([
    ntpProtocol("latest"),
    midnightProtocol("latest"),
  ]);
  let ntpCalls = 0;
  let midnightCalls = 0;
  await runValidate(protocols, {
    resolveNtp: async () => (++ntpCalls, 42),
    resolveMidnight: async () => (++midnightCalls, 750),
  });

  expect(ntpCalls).toBe(1);
  expect(midnightCalls).toBe(1);
  expect((protocols[0].syncProtocol as any).startBlockHeight).toBe(42);
  expect((protocols[1].syncProtocol as any).startBlockHeight).toBe(750);
  expect(store.ntp?.immutable_config).toEqual({
    startTime: 1_000,
    blockTimeMS: 1_000,
    startBlockHeight: 42,
    startBlockHeightProvenance: "latest",
  });
  expect(store.midnight?.immutable_config).toEqual({
    startBlockHeight: 750,
    startBlockHeightProvenance: "latest",
  });
});

test("a committed latest snapshot wins on restart without live resolution", async () => {
  await runValidate(cloneRuntimeSyncInfo([ntpProtocol("latest")]), {
    resolveNtp: async () => 55,
  });
  const restarted = cloneRuntimeSyncInfo([ntpProtocol("latest")]);
  await runValidate(restarted, {
    resolveNtp: async () => {
      throw new Error("must not query the clock");
    },
  });
  expect((restarted[0].syncProtocol as any).startBlockHeight).toBe(55);
});

for (const useDb of [false, true]) {
  test(`atomically backfills a legacy explicit NTP row${useDb ? " with" : " without"} USE_DB_STARTHEIGHT`, async () => {
    store.ntp = {
      network_type: ConfigNetworkType.NTP,
      immutable_config: { startTime: 1_000, blockTimeMS: 1_000 },
    };
    if (useDb) process.env.USE_DB_STARTHEIGHT = "1";
    const protocols = cloneRuntimeSyncInfo([ntpProtocol(17)]);
    await runValidate(protocols);
    expect(store.ntp?.immutable_config).toEqual({
      startTime: 1_000,
      blockTimeMS: 1_000,
      startBlockHeight: 17,
      startBlockHeightProvenance: "explicit",
    });
  });
}

test("legacy latest NTP resolves exactly once even with USE_DB_STARTHEIGHT", async () => {
  store.ntp = {
    network_type: ConfigNetworkType.NTP,
    immutable_config: { startTime: 1_000, blockTimeMS: 1_000 },
  };
  process.env.USE_DB_STARTHEIGHT = "1";
  let calls = 0;
  await runValidate(cloneRuntimeSyncInfo([ntpProtocol("latest")]), {
    resolveNtp: async () => (++calls, 88),
  });
  expect(calls).toBe(1);
  expect(store.ntp?.immutable_config.startBlockHeight).toBe(88);
});

test("explicit NTP mismatch fails unless USE_DB_STARTHEIGHT makes stored win", async () => {
  await runValidate(cloneRuntimeSyncInfo([ntpProtocol(20)]));
  await expect(
    runValidate(cloneRuntimeSyncInfo([ntpProtocol(21)])),
  ).rejects.toThrow(/startBlockHeight/);

  process.env.USE_DB_STARTHEIGHT = "1";
  const overridden = cloneRuntimeSyncInfo([ntpProtocol(21)]);
  await runValidate(overridden);
  expect((overridden[0].syncProtocol as any).startBlockHeight).toBe(20);
});

test("crash before commit rolls back and may resolve again", async () => {
  let calls = 0;
  await expect(runValidate(cloneRuntimeSyncInfo([ntpProtocol("latest")]), {
    resolveNtp: async () => (++calls, 90),
    beforeCommit: () => {
      throw new Error("pre-commit crash");
    },
  })).rejects.toThrow(/pre-commit crash/);
  expect(store.ntp).toBeUndefined();

  await runValidate(cloneRuntimeSyncInfo([ntpProtocol("latest")]), {
    resolveNtp: async () => (++calls, 91),
  });
  expect(calls).toBe(2);
  expect(store.ntp?.immutable_config.startBlockHeight).toBe(91);
});

test("crash after commit leaves the stored boundary for a no-network restart", async () => {
  await expect(runValidate(cloneRuntimeSyncInfo([ntpProtocol("latest")]), {
    resolveNtp: async () => 101,
    afterCommit: () => {
      throw new Error("post-commit crash");
    },
  })).rejects.toThrow(/post-commit crash/);
  expect(store.ntp?.immutable_config.startBlockHeight).toBe(101);

  const restarted = cloneRuntimeSyncInfo([ntpProtocol("latest")]);
  await runValidate(restarted, {
    resolveNtp: async () => {
      throw new Error("must not resolve after commit");
    },
  });
  expect((restarted[0].syncProtocol as any).startBlockHeight).toBe(101);
});

test("runtime clone is immutable and primitive inheritance honors explicit values", () => {
  const built = ntpProtocol("latest");
  const cloned = cloneRuntimeSyncInfo([built]);
  (cloned[0].network as any).startTime = 999;
  (cloned[0].syncProtocol as any).startBlockHeight = 42;
  (cloned[0].primitives[0].primitive as any).name = "changed";
  expect((built.network as any).startTime).toBe(1_000);
  expect((built.syncProtocol as any).startBlockHeight).toBe("latest");
  expect((built.primitives[0].primitive as any).name).toBe("clock");

  expect(inheritPrimitiveConfig(cloned[0], { type: "NTP:Clock" }))
    .toMatchObject({ startBlockHeight: 42 });
  expect(inheritPrimitiveConfig(cloned[0], {
    type: "NTP:Clock",
    startBlockHeight: 7,
  })).toMatchObject({ startBlockHeight: 7 });
});

test("Midnight primitive inherits networkId and preserves its routing prefix", () => {
  const owner = cloneRuntimeSyncInfo([midnightProtocol(500)])[0];
  expect(inheritPrimitiveConfig(owner, {
    type: "Midnight:Generic",
    stateMachinePrefix: "batata",
  })).toEqual({
    type: "Midnight:Generic",
    startBlockHeight: 500,
    networkId: "stagenet",
    stateMachinePrefix: "batata",
  });
  expect(inheritPrimitiveConfig(owner, {
    type: "Midnight:Generic",
    startBlockHeight: 12,
    networkId: "custom",
  })).toMatchObject({ startBlockHeight: 12, networkId: "custom" });
});

test("a protocol without a numeric block start still requires a primitive start", () => {
  const cardano = cardanoUtxoRpcProtocol({ slot: 1, hash: "0xabc" });
  expect(() => inheritPrimitiveConfig(cardano, {
    name: "utxo",
    type: "Cardano:Utxo",
  })).toThrow(/requires an explicit startBlockHeight/);
  expect(inheritPrimitiveConfig(cardano, {
    name: "utxo",
    type: "Cardano:Utxo",
    startBlockHeight: 4,
  })).toMatchObject({ startBlockHeight: 4 });
});
