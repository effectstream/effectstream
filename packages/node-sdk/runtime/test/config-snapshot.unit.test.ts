import { expect, test, mock, beforeEach, afterEach } from "bun:test";
import { run } from "effection";
import type { Client } from "pg";
import { ConfigNetworkType, ConfigSyncProtocolType } from "@effectstream/config";
import type { SyncProtocolWithNetwork } from "@effectstream/config";

/**
 * In-memory backing store for the mocked `@effectstream/db` query objects.
 * `validateAndSnapshotConfig` only touches two queries — `get…Snapshot`
 * (returns rows) and `upsert…Snapshot` (writes) — so stubbing those two is
 * sufficient to exercise the comparison loop end-to-end without a real DB.
 */
type StoredRow = { networkType: ConfigNetworkType; immutable_config: unknown };
let store: Record<string, StoredRow | undefined> = {};

mock.module("@effectstream/db", () => ({
  getSyncProtocolConfigSnapshot: {
    run: ({ protocolName }: { protocolName: string }) =>
      Promise.resolve(store[protocolName] ? [store[protocolName]] : []),
  },
  upsertSyncProtocolConfigSnapshot: {
    run: ({
      protocolName,
      networkType,
      immutableConfig,
    }: {
      protocolName: string;
      networkType: ConfigNetworkType;
      immutableConfig: string;
    }) => {
      store[protocolName] = { networkType, immutable_config: JSON.parse(immutableConfig) };
      return Promise.resolve([]);
    },
  },
}));

const { validateAndSnapshotConfig } = await import("../src/config-snapshot.ts");

const STUB_DB = {} as Client;

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

async function runValidate(
  protocols: SyncProtocolWithNetwork[],
): Promise<void> {
  await run(function* () {
    yield* validateAndSnapshotConfig(protocols, STUB_DB);
  });
}

beforeEach(() => {
  store = {};
  delete process.env.USE_DB_STARTHEIGHT;
});

afterEach(() => {
  delete process.env.USE_DB_STARTHEIGHT;
});

test("first run persists the snapshot and succeeds", async () => {
  const protocol = cardanoUtxoRpcProtocol({ slot: 1, hash: "0xabc" });
  await expect(runValidate([protocol])).resolves.toBeUndefined();
  expect(store["cardano-utxorpc"]?.immutable_config).toEqual({
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
