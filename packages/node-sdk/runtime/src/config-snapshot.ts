import type { Client, PoolClient } from "pg";
import type { Operation } from "effection";
import { call, until } from "effection";
import {
  getSyncProtocolConfigSnapshot,
  updateSyncProtocolConfigSnapshot,
  upsertSyncProtocolConfigSnapshot,
} from "@effectstream/db";
import {
  START_BLOCK_HEIGHT_PROVENANCE,
  startPolicyRegistry,
} from "@effectstream/sync";
import type {
  StartPolicySnapshotFields,
  SyncProtocolStartPolicy,
} from "@effectstream/sync";
import type { SyncProtocolWithNetwork } from "@effectstream/config";
import { ComponentNames, log, SeverityNumber } from "@effectstream/log";
import { getEnv } from "@effectstream/utils/runtime";

/**
 * Generic, protocol-agnostic reconciliation of every sync protocol's immutable
 * start configuration.
 *
 * This module knows NOTHING about NTP, Midnight, Cardano or any other chain
 * (FR-001). It selects one opaque `SyncProtocolStartPolicy` per entry by
 * `syncProtocolType` and drives three protocol-owned operations:
 *
 *  - `resolveLatest`   — only on a first run whose configured start is
 *                        `"latest"`; it is the ONLY place a live tip is read.
 *  - `projectImmutable`— what this protocol persists, split into the
 *                        mismatch-checked (`validated`) and always-adopted
 *                        (`restored`) groups.
 *  - `applySnapshot`   — write a committed snapshot back onto the live config.
 *
 * The durable boundary plus its `latest | explicit` provenance is committed
 * before this function returns, and therefore before primitives and sync states
 * are constructed (FR-006 — see the startup ordering in `main.ts`).
 */

/** How a protocol's committed numeric boundary was obtained. */
type Provenance = "latest" | "explicit";

/** Test seam (FR-004): a generic registry override, never per-chain hooks. */
export type ConfigSnapshotSeams = {
  startPolicies?: Record<string, SyncProtocolStartPolicy>;
};

/**
 * A connection this reconciliation owns exclusively for one protocol.
 *
 * `main.ts` hands us a `pg.Pool` (typed as `Client`), and statements issued on
 * a pool may each land on a different pooled connection — so `BEGIN`/`COMMIT`
 * on the pool would NOT be one transaction. Every statement of one protocol's
 * reconciliation therefore runs on a single checked-out `PoolClient`, released
 * in a `finally` exactly like `processFinalizedBlockWithRetry`
 * (`process-blocks.ts`). When the caller already handed us a dedicated client
 * there is nothing to check out and `release` is a no-op.
 *
 * Every statement goes through `<query>.run(params, client)` / `client.query()`
 * directly and never through `runPreparedQuery`, which would try to re-acquire
 * the PGlite startup mutex already held by `startup()` and deadlock.
 */
type DedicatedConnection = {
  client: Client;
  release: (error?: unknown) => void;
};

type PoolLike = {
  connect: () => Promise<PoolClient>;
  totalCount: number;
};

/**
 * `totalCount` is what distinguishes a `pg.Pool` from a `pg.Client`: both
 * expose `connect`, only the pool reports how many connections it owns.
 */
function isPool(dbConn: unknown): dbConn is PoolLike {
  if (dbConn === null || typeof dbConn !== "object") return false;
  const candidate = dbConn as Partial<PoolLike>;
  return typeof candidate.connect === "function" &&
    typeof candidate.totalCount === "number";
}

function* checkoutConnection(dbConn: Client): Operation<DedicatedConnection> {
  if (!isPool(dbConn)) {
    return { client: dbConn, release: () => {} };
  }
  const client = yield* until(dbConn.connect());
  let released = false;
  return {
    client: client as unknown as Client,
    release: (error?: unknown) => {
      if (released) return;
      released = true;
      try {
        // Passing an error destroys the client instead of recycling it, so a
        // connection left in an unknown transaction state is never handed out.
        client.release(error as Error | undefined);
      } catch {
        /* already released/destroyed */
      }
    },
  };
}

function* execute(client: Client, sql: string): Operation<void> {
  yield* until(client.query(sql));
}

/**
 * Compares a saved snapshot value against the current in-memory value.
 * Falls back to structural JSON comparison for nested objects (which are
 * always freshly constructed plain objects with stable key-insertion order
 * from `projectImmutable`), and to reference/identity comparison for
 * everything else.
 */
function valuesDiffer(saved: unknown, current: unknown): boolean {
  if (
    typeof saved === "object" && saved !== null &&
    typeof current === "object" && current !== null
  ) {
    return JSON.stringify(saved) !== JSON.stringify(current);
  }
  return saved !== current;
}

/**
 * A projected value this boot deliberately cannot know.
 *
 * On the restart path the projection exists only to learn the CURRENT values of
 * each field; a protocol configured with `"latest"` has no current numeric
 * start (that is the whole point of the sentinel), so `NaN` is passed in and
 * the resulting key is excluded from difference reporting instead of being
 * reported as an eternal difference.
 *
 * Only `NaN` qualifies. A field that is genuinely `undefined` in the current
 * config while the snapshot holds a value is real drift and must still be
 * reported (e.g. a saved Cardano `startChainPoint` with no counterpart today).
 */
function isUnresolvedProjection(value: unknown): boolean {
  return typeof value === "number" && Number.isNaN(value);
}

/**
 * Differences between a saved snapshot and a freshly projected group.
 *
 * Only keys present in BOTH are compared: a key the definition projects but an
 * older snapshot never stored is not a mismatch (that is how a protocol may
 * start persisting a new field without breaking existing databases), and a key
 * a snapshot stores but the definition no longer projects is ignored.
 */
function describeDifferences(
  saved: Record<string, unknown>,
  projected: StartPolicySnapshotFields,
): string[] {
  const differences: string[] = [];
  for (const [key, currentValue] of Object.entries(projected)) {
    if (!(key in saved)) continue;
    if (isUnresolvedProjection(currentValue)) continue;
    if (!valuesDiffer(saved[key], currentValue)) continue;
    differences.push(
      `  ${key}: saved=${JSON.stringify(saved[key])}, current=${
        JSON.stringify(currentValue)
      }`,
    );
  }
  return differences;
}

type BlockHeightCarrier = { startBlockHeight?: number | "latest" };

function configuredStart(
  protocol: SyncProtocolWithNetwork,
): number | "latest" | undefined {
  return (protocol.syncProtocol as unknown as BlockHeightCarrier)
    .startBlockHeight;
}

/**
 * Checks the saved config snapshot for each sync protocol against the current
 * config, resolving a `"latest"` start exactly once and committing the numeric
 * boundary plus its provenance before returning.
 *
 * On the first run (no snapshot row) the boundary is resolved — from the
 * protocol's own `resolveLatest` for `"latest"`, otherwise straight from the
 * explicit numeric value — inserted with `ON CONFLICT DO NOTHING`, re-read
 * inside the same transaction and adopted. If a concurrent process won the
 * insert, the committed row wins and this process discards its own
 * observation. (The re-read relies on the PostgreSQL default READ COMMITTED
 * isolation, under which each statement sees a fresh snapshot and therefore
 * observes a concurrently committed winner.)
 *
 * On later runs NO live tip query happens. A legacy row without provenance is
 * backfilled to `"explicit"` in the same transaction, `validated` fields keep
 * the historical contract (a difference throws unless `USE_DB_STARTHEIGHT` is
 * set, which downgrades to a warning and lets the saved value win) and
 * `restored` fields are always adopted from the snapshot, warning when they
 * differ from the freshly configured ones.
 *
 * The function mutates `syncInfo` in place — after it returns, every protocol
 * that declares a `startBlockHeight` carries the committed numeric boundary.
 * That postcondition is enforced, not merely intended: a restart that cannot
 * produce a number (a legacy snapshot with no saved boundary under a configured
 * `"latest"`) throws rather than letting the sentinel escape.
 */
export function* validateAndSnapshotConfig(
  syncInfo: SyncProtocolWithNetwork[],
  dbConn: Client,
  seams?: ConfigSnapshotSeams,
): Operation<void> {
  const useDbStartHeight = getEnv("USE_DB_STARTHEIGHT") !== undefined;
  const policies: Record<string, SyncProtocolStartPolicy> =
    seams?.startPolicies ?? startPolicyRegistry;

  for (const protocol of syncInfo) {
    const protocolName: string =
      (protocol.syncProtocol as { name: string }).name;
    const definition = policies[protocol.syncProtocolType as string];
    if (definition === undefined) {
      throw new Error(
        `[config-snapshot] Unknown start policy for sync protocol type ` +
          `"${String(protocol.syncProtocolType)}" (protocol "${protocolName}"). ` +
          `Register a start policy beside that protocol's sync implementation.`,
      );
    }

    const connection = yield* checkoutConnection(dbConn);
    // `finally` (not `catch`) so a halted startup releases the connection too;
    // the recorded failure is passed on so a client left mid-transaction is
    // destroyed rather than recycled, exactly like `process-blocks.ts`.
    let failure: unknown;
    try {
      yield* reconcileProtocol(
        protocol,
        protocolName,
        definition,
        connection.client,
        useDbStartHeight,
      );
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      connection.release(failure);
    }
  }
}

function* reconcileProtocol(
  protocol: SyncProtocolWithNetwork,
  protocolName: string,
  definition: SyncProtocolStartPolicy,
  client: Client,
  useDbStartHeight: boolean,
): Operation<void> {
  const rows = yield* until(
    getSyncProtocolConfigSnapshot.run({ protocolName }, client),
  );

  if (rows.length > 0) {
    yield* reconcileExistingSnapshot(
      protocol,
      protocolName,
      definition,
      client,
      useDbStartHeight,
      rows[0].immutable_config as Record<string, unknown>,
    );
    return;
  }

  yield* resolveAndCommitFirstBoundary(
    protocol,
    protocolName,
    definition,
    client,
  );
}

/** Restart path. No live tip query ever happens here. */
function* reconcileExistingSnapshot(
  protocol: SyncProtocolWithNetwork,
  protocolName: string,
  definition: SyncProtocolStartPolicy,
  client: Client,
  useDbStartHeight: boolean,
  savedRow: Record<string, unknown>,
): Operation<void> {
  let saved = savedRow;

  // A snapshot written before provenance existed can only have come from an
  // explicit numeric start — `"latest"` did not exist then. Backfill it
  // atomically so later boots take the ordinary path.
  if (
    !(START_BLOCK_HEIGHT_PROVENANCE in saved) &&
    typeof saved["startBlockHeight"] === "number"
  ) {
    const backfilled = {
      ...saved,
      [START_BLOCK_HEIGHT_PROVENANCE]: "explicit" satisfies Provenance,
    };
    yield* inTransaction(client, function* () {
      yield* until(
        updateSyncProtocolConfigSnapshot.run(
          { protocolName, immutableConfig: JSON.stringify(backfilled) },
          client,
        ),
      );
    });
    saved = backfilled;
    log.remote(
      ComponentNames.EFFECTSTREAM_RUNTIME,
      [],
      SeverityNumber.INFO,
      (l) =>
        l(
          `[config-snapshot] Backfilled start-height provenance "explicit" for ` +
            `protocol "${protocolName}".`,
        ),
    );
  }

  // The projection is built purely to learn what THIS boot configured. A
  // configured `"latest"` has no current numeric start, so the definition is
  // handed NaN and puts it in the restored group, where it is not compared.
  const configured = configuredStart(protocol);
  const projected = definition.projectImmutable(protocol, {
    startBlockHeight: typeof configured === "number"
      ? configured
      : Number.NaN,
    provenance: configured === "latest" ? "latest" : "explicit",
  });

  const mismatches = describeDifferences(saved, projected.validated);
  if (mismatches.length > 0) {
    const mismatchDetails = mismatches.join("\n");
    if (!useDbStartHeight) {
      throw new Error(
        `[config-snapshot] CRITICAL: Immutable config fields have changed for protocol "${protocolName}".\n` +
          `${mismatchDetails}\n\n` +
          `If this is intentional (e.g. you want to resume from the original start height/time stored in the DB), ` +
          `set the USE_DB_STARTHEIGHT environment variable and restart the service.\n` +
          `WARNING: Only set USE_DB_STARTHEIGHT if you understand the implications — mismatched start values ` +
          `can cause the node to skip blocks or produce inconsistent state.`,
      );
    }
    log.remote(
      ComponentNames.EFFECTSTREAM_RUNTIME,
      [],
      SeverityNumber.WARN,
      (l) =>
        l(
          `[config-snapshot] WARNING: Immutable config mismatch for protocol "${protocolName}". ` +
            `USE_DB_STARTHEIGHT is set; overriding in-memory config with DB snapshot values.\n${mismatchDetails}`,
        ),
    );
  }

  const restoredDifferences = describeDifferences(saved, projected.restored);
  if (restoredDifferences.length > 0) {
    log.remote(
      ComponentNames.EFFECTSTREAM_RUNTIME,
      [],
      SeverityNumber.WARN,
      (l) =>
        l(
          `[config-snapshot] Restored saved start configuration for protocol "${protocolName}"; ` +
            `the freshly configured values differ and are ignored.\n${
              restoredDifferences.join("\n")
            }`,
        ),
    );
  }

  definition.applySnapshot(protocol, saved);

  // A snapshot written before this feature can lack `startBlockHeight` entirely
  // (a pre-00034 NTP row held only {startTime, blockTimeMS}). Nothing on this
  // path can supply it — the provenance backfill needs a numeric saved start,
  // `resolveLatest` is deliberately unreachable here, and `applySnapshot` has
  // no key to write — so a configured `"latest"` would otherwise survive as a
  // string and break this module's numeric postcondition silently. Fail loud.
  if (configured !== undefined && typeof configuredStart(protocol) !== "number") {
    throw new Error(
      `[config-snapshot] CRITICAL: protocol "${protocolName}" would start with a ` +
        `non-numeric startBlockHeight (${JSON.stringify(configuredStart(protocol))}).\n` +
        `Its saved config snapshot has no "startBlockHeight" key, so there is nothing to ` +
        `restore, and the restart path never queries a live tip — a boundary resolved now ` +
        `would silently differ from the one this database was synced with.\n\n` +
        `Fix it once, either way:\n` +
        `  - configure an explicit numeric startBlockHeight for this protocol, or\n` +
        `  - delete its row from effectstream.sync_protocol_config_snapshot to resolve ` +
        `"latest" again from scratch (this re-syncs from the new boundary).`,
    );
  }
}

/** First-run path: resolve at most once, commit, then adopt what committed. */
function* resolveAndCommitFirstBoundary(
  protocol: SyncProtocolWithNetwork,
  protocolName: string,
  definition: SyncProtocolStartPolicy,
  client: Client,
): Operation<void> {
  const configured = configuredStart(protocol);
  const provenance: Provenance = configured === "latest"
    ? "latest"
    : "explicit";
  // Resolved OUTSIDE the transaction: a network round trip must never hold a
  // database transaction open, and a crash here has persisted nothing.
  const startBlockHeight = configured === "latest"
    ? yield* call(() => definition.resolveLatest(protocol))
    : (configured as number);

  const projected = definition.projectImmutable(protocol, {
    startBlockHeight,
    provenance,
  });
  const immutableConfig: StartPolicySnapshotFields = {
    ...projected.validated,
    ...projected.restored,
  };

  let committed = immutableConfig;
  yield* inTransaction(client, function* () {
    yield* until(
      upsertSyncProtocolConfigSnapshot.run(
        {
          protocolName,
          networkType: protocol.networkType as unknown as string,
          immutableConfig: JSON.stringify(immutableConfig),
        },
        client,
      ),
    );
    // Re-read inside the transaction: if a concurrent process won the insert
    // (ON CONFLICT DO NOTHING silently kept its row), the committed row is
    // authoritative and this process discards its own observation.
    const committedRows = yield* until(
      getSyncProtocolConfigSnapshot.run({ protocolName }, client),
    );
    if (committedRows.length > 0) {
      committed = committedRows[0].immutable_config as StartPolicySnapshotFields;
    }
  });

  definition.applySnapshot(protocol, committed);

  log.remote(
    ComponentNames.EFFECTSTREAM_RUNTIME,
    [],
    SeverityNumber.INFO,
    (l) =>
      l(
        `[config-snapshot] Saved initial config snapshot for protocol "${protocolName}"`,
      ),
  );
}

/**
 * BEGIN/COMMIT (ROLLBACK on failure) on ONE dedicated connection, imitating
 * `process-blocks.ts`. A crash before COMMIT persists nothing, so the next boot
 * simply resolves again; a crash after COMMIT takes the restart path.
 */
function* inTransaction(
  client: Client,
  body: () => Operation<void>,
): Operation<void> {
  yield* execute(client, "BEGIN");
  try {
    yield* body();
  } catch (error) {
    // A failing ROLLBACK must not mask what actually went wrong; the caller
    // destroys the connection on the way out either way.
    try {
      yield* execute(client, "ROLLBACK");
    } catch {
      /* connection is unusable; the original error is the useful one */
    }
    throw error;
  }
  yield* execute(client, "COMMIT");
}
