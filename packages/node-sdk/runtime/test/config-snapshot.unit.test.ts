import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { run } from "effection";
import type { Operation } from "effection";
import type { Client } from "pg";
import { ConfigNetworkType, ConfigSyncProtocolType } from "@effectstream/config";
import type { SyncProtocolWithNetwork } from "@effectstream/config";

/**
 * In-memory backing store for the mocked `@effectstream/db` query objects.
 *
 * `validateAndSnapshotConfig` touches three queries — `get…Snapshot`,
 * `upsert…Snapshot` (INSERT … ON CONFLICT DO NOTHING) and `update…Snapshot`
 * (the provenance backfill) — and drives BEGIN/COMMIT/ROLLBACK through the
 * connection object itself. The stub therefore models a real transaction:
 * writes land in a per-connection pending set and only reach `committed` on
 * COMMIT, so "a crash before COMMIT persisted nothing" is observable.
 */
type StoredRow = { networkType: ConfigNetworkType; immutable_config: unknown };

let committed: Record<string, StoredRow | undefined> = {};
let pending: Map<unknown, Record<string, StoredRow>> = new Map();

/**
 * Every statement of a reconciliation, in issue order, together with the
 * connection it was issued on. This recording IS the "one dedicated connection
 * per reconciliation" assertion.
 */
type Statement = { connection: unknown; sql: string };
let statements: Statement[] = [];
/** Statements interleaved with start-policy callbacks, for ordering proofs. */
let callOrder: string[] = [];

/** Injectable race/fault hooks for the transaction tests. */
let onBeforeInsert: (() => void) | undefined;
let failReReadWith: Error | undefined;

function record(connection: unknown, sql: string): void {
  statements.push({ connection, sql });
  callOrder.push(sql);
}

function readRow(
  connection: unknown,
  protocolName: string,
): StoredRow | undefined {
  return pending.get(connection)?.[protocolName] ?? committed[protocolName];
}

function writeRow(
  connection: unknown,
  protocolName: string,
  row: StoredRow,
): void {
  const buffered = pending.get(connection);
  if (buffered) buffered[protocolName] = row;
  else committed[protocolName] = row;
}

mock.module("@effectstream/db", () => ({
  /**
   * Not used by any assertion here. `config-snapshot.ts` imports the default
   * `startPolicyRegistry` from `@effectstream/sync`, whose barrel pulls in the
   * per-chain `state.ts` modules, and every one of those imports `getPage` from
   * `@effectstream/db`. A wholesale module mock must therefore also carry the
   * transitive surface or the import graph fails to resolve.
   */
  getPage: { run: () => Promise.resolve([]) },
  getSyncProtocolConfigSnapshot: {
    run: ({ protocolName }: { protocolName: string }, connection: unknown) => {
      record(connection, "SELECT");
      const isReRead = statements.filter((s) => s.sql === "SELECT").length > 1;
      if (failReReadWith && isReRead) return Promise.reject(failReReadWith);
      const row = readRow(connection, protocolName);
      return Promise.resolve(row ? [row] : []);
    },
  },
  upsertSyncProtocolConfigSnapshot: {
    run: (
      { protocolName, networkType, immutableConfig }: {
        protocolName: string;
        networkType: ConfigNetworkType;
        immutableConfig: string;
      },
      connection: unknown,
    ) => {
      record(connection, "INSERT");
      onBeforeInsert?.();
      // ON CONFLICT (protocol_name) DO NOTHING
      if (readRow(connection, protocolName) === undefined) {
        writeRow(connection, protocolName, {
          networkType,
          immutable_config: JSON.parse(immutableConfig),
        });
      }
      return Promise.resolve([]);
    },
  },
  updateSyncProtocolConfigSnapshot: {
    run: (
      { protocolName, immutableConfig }: {
        protocolName: string;
        immutableConfig: string;
      },
      connection: unknown,
    ) => {
      record(connection, "UPDATE");
      const existing = readRow(connection, protocolName);
      if (existing !== undefined) {
        writeRow(connection, protocolName, {
          ...existing,
          immutable_config: JSON.parse(immutableConfig),
        });
      }
      return Promise.resolve([]);
    },
  },
}));

const { validateAndSnapshotConfig } = await import("../src/config-snapshot.ts");

/** A checked-out connection: the only object a reconciliation may talk to. */
class StubClient {
  released = false;
  releaseError: unknown;
  constructor(readonly pool: StubPool) {}
  query(config: string | { text: string }): Promise<{ rows: unknown[] }> {
    const sql = typeof config === "string" ? config : config.text;
    record(this, sql);
    if (sql === "BEGIN") pending.set(this, {});
    if (sql === "COMMIT") {
      for (const [name, row] of Object.entries(pending.get(this) ?? {})) {
        committed[name] = row;
      }
      pending.delete(this);
    }
    if (sql === "ROLLBACK") pending.delete(this);
    return Promise.resolve({ rows: [] });
  }
  release(error?: unknown): void {
    this.released = true;
    this.releaseError = error;
    pending.delete(this);
  }
}

/** `totalCount` is what marks a real `pg.Pool` apart from a dedicated client. */
class StubPool {
  totalCount = 0;
  readonly clients: StubClient[] = [];
  connect(): Promise<StubClient> {
    const client = new StubClient(this);
    this.clients.push(client);
    return Promise.resolve(client);
  }
  query(config: string | { text: string }): Promise<{ rows: unknown[] }> {
    // Any statement landing here is a pooled statement — i.e. NOT part of the
    // dedicated-connection transaction. Recorded so tests can forbid it.
    const sql = typeof config === "string" ? config : config.text;
    record(this, `POOL:${sql}`);
    return Promise.resolve({ rows: [] });
  }
}

let pool: StubPool;

type StartPolicySeams = { startPolicies?: Record<string, unknown> };

const validate = validateAndSnapshotConfig as unknown as (
  syncInfo: SyncProtocolWithNetwork[],
  dbConn: Client,
  seams?: StartPolicySeams,
) => Operation<void>;

async function runValidate(
  protocols: SyncProtocolWithNetwork[],
  seams?: StartPolicySeams,
): Promise<void> {
  await run(function* () {
    yield* validate(protocols, pool as unknown as Client, seams);
  });
}

function sqlOrder(): string[] {
  return statements.map((statement) => statement.sql);
}

beforeEach(() => {
  committed = {};
  pending = new Map();
  statements = [];
  callOrder = [];
  onBeforeInsert = undefined;
  failReReadWith = undefined;
  pool = new StubPool();
  delete process.env.USE_DB_STARTHEIGHT;
});

afterEach(() => {
  delete process.env.USE_DB_STARTHEIGHT;
});

// ---------------------------------------------------------------------------
// Legacy coverage: the DEFAULT registry must keep today's Cardano semantics.
// ---------------------------------------------------------------------------

function cardanoUtxoRpcProtocol(
  startChainPoint: unknown,
): SyncProtocolWithNetwork {
  return {
    networkType: ConfigNetworkType.CARDANO,
    syncProtocolType: ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL,
    syncProtocol: { name: "cardano-utxorpc", startChainPoint },
    network: {},
  } as unknown as SyncProtocolWithNetwork;
}

test("first run persists the snapshot and succeeds", async () => {
  const protocol = cardanoUtxoRpcProtocol({ slot: 1, hash: "0xabc" });
  await expect(runValidate([protocol])).resolves.toBeUndefined();
  expect(committed["cardano-utxorpc"]?.immutable_config).toEqual({
    startChainPoint: { slot: 1, hash: "0xabc" },
  });
});

test("matching nested-object snapshot succeeds on subsequent runs", async () => {
  // Seed the snapshot from a first run.
  await runValidate([cardanoUtxoRpcProtocol({ slot: 5, hash: "0xdead" })]);

  // Same shape on restart — must not throw.
  await expect(
    runValidate([cardanoUtxoRpcProtocol({ slot: 5, hash: "0xdead" })]),
  ).resolves.toBeUndefined();
});

test("reports a clean mismatch (no TypeError) when a saved nested object has no current counterpart", async () => {
  // Snapshot persisted with a nested startChainPoint object.
  await runValidate([cardanoUtxoRpcProtocol({ slot: 42, hash: "0xbeef" })]);

  // On restart the current config has lost that field (shape drift / undefined).
  const drifted = cardanoUtxoRpcProtocol(undefined);

  // The robust comparator must surface this as a clean CRITICAL mismatch
  // rather than throwing a `TypeError: Cannot read properties of undefined`.
  await expect(runValidate([drifted])).rejects.toThrow(
    /\[config-snapshot\] CRITICAL/,
  );
});

// ---------------------------------------------------------------------------
// SC-001: the generic runtime drives an opaque, injected definition. Nothing
// below names a real chain — that is the point of the oracle.
// ---------------------------------------------------------------------------

const FAKE_TYPE = "fake-protocol" as ConfigSyncProtocolType;
const FAKE_NETWORK = "fake-network" as ConfigNetworkType;

type SnapshotFields = Record<string, unknown>;
type ResolvedStart = {
  startBlockHeight: number;
  provenance: "latest" | "explicit";
};

type FakePolicy = {
  resolveLatest(entry: SyncProtocolWithNetwork): Promise<number>;
  projectImmutable(
    entry: SyncProtocolWithNetwork,
    resolved: ResolvedStart,
  ): { validated: SnapshotFields; restored: SnapshotFields };
  applySnapshot(entry: SyncProtocolWithNetwork, snapshot: SnapshotFields): void;
};

function startOf(entry: SyncProtocolWithNetwork): number | "latest" {
  return (entry.syncProtocol as unknown as {
    startBlockHeight: number | "latest";
  }).startBlockHeight;
}

function clockOf(entry: SyncProtocolWithNetwork): number {
  return (entry.network as unknown as { clock: number }).clock;
}

/**
 * A protocol definition with no chain behind it. `clock` stands in for any
 * restored network field (NTP's startTime/blockTimeMS in production).
 */
function makeFakePolicy(tip: number): {
  policy: FakePolicy;
  state: { resolveCalls: number; applied: SnapshotFields[] };
} {
  const state = { resolveCalls: 0, applied: [] as SnapshotFields[] };
  const policy: FakePolicy = {
    resolveLatest(_entry) {
      state.resolveCalls += 1;
      callOrder.push("resolveLatest");
      return Promise.resolve(tip);
    },
    projectImmutable(entry, resolved) {
      const validated: SnapshotFields = {};
      const restored: SnapshotFields = {
        clock: clockOf(entry),
        startBlockHeightProvenance: resolved.provenance,
      };
      if (startOf(entry) === "latest") {
        restored["startBlockHeight"] = resolved.startBlockHeight;
      } else {
        validated["startBlockHeight"] = resolved.startBlockHeight;
      }
      return { validated, restored };
    },
    applySnapshot(entry, snapshot) {
      callOrder.push("applySnapshot");
      state.applied.push(snapshot);
      if ("startBlockHeight" in snapshot) {
        (entry.syncProtocol as unknown as { startBlockHeight: unknown })
          .startBlockHeight = snapshot["startBlockHeight"];
      }
      if ("clock" in snapshot) {
        (entry.network as unknown as { clock: unknown }).clock =
          snapshot["clock"];
      }
    },
  };
  return { policy, state };
}

function fakeProtocol(
  startBlockHeight: number | "latest",
  clock = 100,
  name = "fake",
): SyncProtocolWithNetwork {
  return {
    networkType: FAKE_NETWORK,
    syncProtocolType: FAKE_TYPE,
    syncProtocol: { name, startBlockHeight },
    network: { clock },
    primitives: [],
  } as unknown as SyncProtocolWithNetwork;
}

function seams(policy: FakePolicy): StartPolicySeams {
  return { startPolicies: { [FAKE_TYPE]: policy } };
}

function seedRow(immutableConfig: SnapshotFields, name = "fake"): void {
  committed[name] = {
    networkType: FAKE_NETWORK,
    immutable_config: immutableConfig,
  };
}

describe("generic reconciliation over an injected start-policy definition", () => {
  test('first run with "latest" resolves once and commits value + provenance', async () => {
    const { policy, state } = makeFakePolicy(1_234);
    const protocol = fakeProtocol("latest");

    await runValidate([protocol], seams(policy));

    expect(state.resolveCalls).toBe(1);
    expect(committed["fake"]?.immutable_config).toEqual({
      clock: 100,
      startBlockHeightProvenance: "latest",
      startBlockHeight: 1_234,
    });
    expect(startOf(protocol)).toBe(1_234);
  });

  test("the tip resolves before the transaction, and the commit precedes adoption", async () => {
    const { policy } = makeFakePolicy(1_234);

    await runValidate([fakeProtocol("latest")], seams(policy));

    expect(sqlOrder()).toEqual([
      "SELECT",
      "BEGIN",
      "INSERT",
      "SELECT",
      "COMMIT",
    ]);
    expect(callOrder.indexOf("resolveLatest")).toBeLessThan(
      callOrder.indexOf("BEGIN"),
    );
    expect(callOrder.indexOf("COMMIT")).toBeLessThan(
      callOrder.lastIndexOf("applySnapshot"),
    );
  });

  test("an explicit numeric start is committed with explicit provenance and no tip query", async () => {
    const { policy, state } = makeFakePolicy(1_234);
    const protocol = fakeProtocol(7);

    await runValidate([protocol], seams(policy));

    expect(state.resolveCalls).toBe(0);
    expect(committed["fake"]?.immutable_config).toEqual({
      clock: 100,
      startBlockHeightProvenance: "explicit",
      startBlockHeight: 7,
    });
    expect(startOf(protocol)).toBe(7);
  });

  test("a restart reuses the committed boundary and never queries a tip", async () => {
    seedRow({
      clock: 100,
      startBlockHeight: 1_234,
      startBlockHeightProvenance: "latest",
    });
    const { policy, state } = makeFakePolicy(9_999);
    // A rebuilt config re-samples its network field and still asks for "latest".
    const protocol = fakeProtocol("latest", 999);

    await runValidate([protocol], seams(policy));

    expect(state.resolveCalls).toBe(0);
    expect(startOf(protocol)).toBe(1_234);
    expect(clockOf(protocol)).toBe(100);
    // No writes: nothing to backfill, nothing to insert.
    expect(sqlOrder()).toEqual(["SELECT"]);
  });

  test("a legacy row without provenance is backfilled to explicit inside one transaction", async () => {
    seedRow({ clock: 100, startBlockHeight: 55 });
    const { policy } = makeFakePolicy(1_234);
    const protocol = fakeProtocol(55);

    await runValidate([protocol], seams(policy));

    expect(committed["fake"]?.immutable_config).toEqual({
      clock: 100,
      startBlockHeight: 55,
      startBlockHeightProvenance: "explicit",
    });
    expect(sqlOrder()).toEqual(["SELECT", "BEGIN", "UPDATE", "COMMIT"]);
    expect(startOf(protocol)).toBe(55);
  });

  test("a row that already carries provenance is not rewritten", async () => {
    seedRow({
      clock: 100,
      startBlockHeight: 55,
      startBlockHeightProvenance: "latest",
    });
    const { policy } = makeFakePolicy(1_234);

    await runValidate([fakeProtocol("latest")], seams(policy));

    expect(sqlOrder()).toEqual(["SELECT"]);
  });

  test("a lost first-insert race adopts the committed row, not the local observation", async () => {
    const { policy, state } = makeFakePolicy(1_234);
    const protocol = fakeProtocol("latest");
    onBeforeInsert = () => {
      // Another process committed first, between our read and our insert.
      seedRow({
        clock: 100,
        startBlockHeight: 900,
        startBlockHeightProvenance: "latest",
      });
    };

    await runValidate([protocol], seams(policy));

    expect(committed["fake"]?.immutable_config).toEqual({
      clock: 100,
      startBlockHeight: 900,
      startBlockHeightProvenance: "latest",
    });
    expect(startOf(protocol)).toBe(900);
    expect(state.applied.at(-1)).toEqual({
      clock: 100,
      startBlockHeight: 900,
      startBlockHeightProvenance: "latest",
    });
  });

  test("a failure before COMMIT rolls back and persists nothing", async () => {
    const { policy } = makeFakePolicy(1_234);
    failReReadWith = new Error("re-read exploded");

    await expect(
      runValidate([fakeProtocol("latest")], seams(policy)),
    ).rejects.toThrow(/re-read exploded/);

    expect(sqlOrder()).toEqual([
      "SELECT",
      "BEGIN",
      "INSERT",
      "SELECT",
      "ROLLBACK",
    ]);
    expect(committed["fake"]).toBeUndefined();
    expect(pool.clients[0].released).toBe(true);
  });

  test("every statement of one reconciliation runs on one checked-out client", async () => {
    const { policy } = makeFakePolicy(1_234);

    await runValidate([fakeProtocol("latest")], seams(policy));

    expect(pool.clients).toHaveLength(1);
    const client = pool.clients[0];
    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) {
      expect(statement.connection).toBe(client);
    }
    expect(sqlOrder().some((sql) => sql.startsWith("POOL:"))).toBe(false);
    expect(client.released).toBe(true);
  });

  test("each protocol gets its own dedicated connection", async () => {
    const { policy } = makeFakePolicy(1_234);

    await runValidate(
      [fakeProtocol("latest", 100, "first"), fakeProtocol(3, 100, "second")],
      seams(policy),
    );

    expect(pool.clients).toHaveLength(2);
    expect(pool.clients.every((client) => client.released)).toBe(true);
    expect(committed["first"]).toBeDefined();
    expect(committed["second"]).toBeDefined();
  });

  test("a sync protocol type with no definition is rejected", async () => {
    const orphan = {
      networkType: FAKE_NETWORK,
      syncProtocolType: "unregistered-protocol",
      syncProtocol: { name: "orphan", startBlockHeight: 1 },
      network: {},
      primitives: [],
    } as unknown as SyncProtocolWithNetwork;

    await expect(runValidate([orphan], { startPolicies: {} })).rejects.toThrow(
      /Unknown start policy[\s\S]*unregistered-protocol/,
    );
  });
});

describe("validated versus restored fields on the restart path", () => {
  test("a validated mismatch still aborts startup with the CRITICAL error", async () => {
    seedRow({
      clock: 100,
      startBlockHeight: 5,
      startBlockHeightProvenance: "explicit",
    });
    const { policy } = makeFakePolicy(1_234);

    await expect(runValidate([fakeProtocol(9)], seams(policy))).rejects
      .toThrow(/\[config-snapshot\] CRITICAL/);
  });

  test("USE_DB_STARTHEIGHT downgrades a validated mismatch to saved-wins", async () => {
    seedRow({
      clock: 100,
      startBlockHeight: 5,
      startBlockHeightProvenance: "explicit",
    });
    process.env.USE_DB_STARTHEIGHT = "1";
    const { policy } = makeFakePolicy(1_234);
    const protocol = fakeProtocol(9);

    await expect(runValidate([protocol], seams(policy))).resolves
      .toBeUndefined();
    expect(startOf(protocol)).toBe(5);
  });

  test("a restored difference is adopted without throwing", async () => {
    seedRow({
      clock: 100,
      startBlockHeight: 5,
      startBlockHeightProvenance: "explicit",
    });
    const { policy } = makeFakePolicy(1_234);
    // Same explicit start, but the restored network field was re-sampled.
    const protocol = fakeProtocol(5, 777);

    await expect(runValidate([protocol], seams(policy))).resolves
      .toBeUndefined();
    expect(clockOf(protocol)).toBe(100);
    expect(startOf(protocol)).toBe(5);
  });

  test('a configured "latest" is never a mismatch against a saved numeric start', async () => {
    seedRow({
      clock: 100,
      startBlockHeight: 42,
      startBlockHeightProvenance: "latest",
    });
    const { policy, state } = makeFakePolicy(1_234);
    const protocol = fakeProtocol("latest");

    await expect(runValidate([protocol], seams(policy))).resolves
      .toBeUndefined();
    expect(startOf(protocol)).toBe(42);
    expect(state.resolveCalls).toBe(0);
  });

  test("a saved key the definition never projects is ignored (legacy tolerance)", async () => {
    seedRow({
      clock: 100,
      startBlockHeight: 5,
      startBlockHeightProvenance: "explicit",
      retiredField: "who-knows",
    });
    const { policy } = makeFakePolicy(1_234);

    await expect(runValidate([fakeProtocol(5)], seams(policy))).resolves
      .toBeUndefined();
  });

  test("reconciliation always leaves a numeric start in memory", async () => {
    const { policy } = makeFakePolicy(2_468);
    const protocol = fakeProtocol("latest");

    await runValidate([protocol], seams(policy));

    expect(typeof startOf(protocol)).toBe("number");
  });

  // Delivery-audit finding F1 (MAJOR). A snapshot written before this feature
  // can lack `startBlockHeight` entirely — every pre-00034 NTP row held only
  // {startTime, blockTimeMS}. On the restart path nothing can supply it: the
  // provenance backfill is skipped (it requires a numeric saved start),
  // `resolveLatest` is unreachable by design, the NaN projection is excluded
  // from difference reporting, and `applySnapshot` has no key to write. The
  // sentinel would otherwise survive into `genSyncProtocols` as a string.
  test('a legacy row with no saved boundary plus a configured "latest" fails loud', async () => {
    seedRow({ clock: 100 });
    const { policy, state } = makeFakePolicy(1_234);
    const protocol = fakeProtocol("latest");

    await expect(runValidate([protocol], seams(policy))).rejects.toThrow(
      /\[config-snapshot\] CRITICAL[\s\S]*non-numeric startBlockHeight/,
    );
    // It fails loud rather than quietly reaching for a live tip.
    expect(state.resolveCalls).toBe(0);
    expect(sqlOrder()).toEqual(["SELECT"]);
    // …and the dedicated connection is still handed back.
    expect(pool.clients[0].released).toBe(true);
  });

  test("the same legacy row is fine when the configured start is explicit", async () => {
    // The guard must not over-trigger: an explicit numeric start needs nothing
    // from the snapshot, so a row that predates the key is still usable. (This
    // is the single-file facade's NTP clock, pinned to an explicit start.)
    seedRow({ clock: 100 });
    const { policy } = makeFakePolicy(1_234);
    const protocol = fakeProtocol(6);

    await expect(runValidate([protocol], seams(policy))).resolves
      .toBeUndefined();
    expect(startOf(protocol)).toBe(6);
  });
});
