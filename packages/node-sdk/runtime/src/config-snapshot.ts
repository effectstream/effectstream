import type { Client } from "pg";
import type { Operation } from "effection";
import { until } from "effection";
import {
  getSyncProtocolConfigSnapshot,
  upsertSyncProtocolConfigSnapshot,
} from "@effectstream/db";
import {
  ConfigNetworkType,
  ConfigSyncProtocolType,
  type StartBlockHeightProvenance,
  type StartBlockHeightPolicy,
  type SyncProtocolWithNetwork,
} from "@effectstream/config";
import { getMidnightTip, getNtpTip } from "@effectstream/sync";
import { log, ComponentNames, SeverityNumber } from "@effectstream/log";
import { getEnv } from "@effectstream/utils/runtime";

type Snapshot = Record<string, unknown>;

const START_BLOCK_HEIGHT_PROVENANCE = Symbol.for(
  "@effectstream/config/start-block-height-provenance",
);

export type StartPolicyResolutionHooks = {
  resolveNtp?: (protocol: SyncProtocolWithNetwork) => Promise<number>;
  resolveMidnight?: (protocol: SyncProtocolWithNetwork) => Promise<number>;
  /** Test-only crash seam immediately before the durable commit. */
  beforeCommit?: () => void | Promise<void>;
  /** Test-only crash seam after commit and before startup can build primitives. */
  afterCommit?: () => void | Promise<void>;
  /** Deterministic storage seams used by unit tests; production uses DB queries. */
  getSnapshot?: (protocolName: string) => Promise<{ immutable_config: Snapshot }[]>;
  upsertSnapshot?: (
    protocolName: string,
    networkType: ConfigNetworkType,
    snapshot: Snapshot,
  ) => Promise<void>;
  updateSnapshot?: (
    protocolName: string,
    networkType: ConfigNetworkType,
    snapshot: Snapshot,
  ) => Promise<void>;
};

function protocolName(protocol: SyncProtocolWithNetwork): string {
  return (protocol.syncProtocol as { name: string }).name;
}

function isLocalStartProtocol(protocol: SyncProtocolWithNetwork): boolean {
  return protocol.networkType === ConfigNetworkType.NTP ||
    protocol.networkType === ConfigNetworkType.MIDNIGHT;
}

function provenanceFor(
  protocol: SyncProtocolWithNetwork,
): StartBlockHeightProvenance {
  const retained = (protocol as SyncProtocolWithNetwork & {
    [START_BLOCK_HEIGHT_PROVENANCE]?: StartBlockHeightProvenance;
  })[START_BLOCK_HEIGHT_PROVENANCE];
  if (retained !== undefined) return retained;
  const requested = (protocol.syncProtocol as {
    startBlockHeight: StartBlockHeightPolicy;
  }).startBlockHeight;
  return requested === "latest" ? "latest" : "explicit";
}

function setResolvedStart(
  protocol: SyncProtocolWithNetwork,
  height: number,
): void {
  if (!Number.isSafeInteger(height) || height < 0) {
    throw new RangeError(
      `[config-snapshot] Resolved invalid start height ${String(height)} for protocol "${protocolName(protocol)}"`,
    );
  }
  (protocol.syncProtocol as { startBlockHeight: number }).startBlockHeight =
    height;
}

async function resolveRequestedStart(
  protocol: SyncProtocolWithNetwork,
  hooks: StartPolicyResolutionHooks,
): Promise<number> {
  const requested = (protocol.syncProtocol as {
    startBlockHeight: StartBlockHeightPolicy;
  }).startBlockHeight;
  if (requested !== "latest") {
    if (!Number.isSafeInteger(requested) || requested < 0) {
      throw new RangeError(
        `[config-snapshot] Invalid explicit start height for protocol "${protocolName(protocol)}"`,
      );
    }
    return requested;
  }

  if (protocol.networkType === ConfigNetworkType.NTP) {
    if (hooks.resolveNtp) return await hooks.resolveNtp(protocol);
    const network = protocol.network as {
      startTime: number;
      blockTimeMS: number;
      servers?: string[];
    };
    return (await getNtpTip({
      startTime: network.startTime,
      blockTimeMS: network.blockTimeMS,
      servers: network.servers,
    })).height;
  }

  if (protocol.networkType === ConfigNetworkType.MIDNIGHT) {
    if (hooks.resolveMidnight) return await hooks.resolveMidnight(protocol);
    const syncProtocol = protocol.syncProtocol as { indexer: string };
    return (await getMidnightTip({ indexer: syncProtocol.indexer })).height;
  }

  throw new Error(
    `[config-snapshot] Protocol "${protocolName(protocol)}" does not support latest`,
  );
}

/** Fields that cannot change after a protocol snapshot is committed. */
function extractImmutableConfig(protocol: SyncProtocolWithNetwork): Snapshot {
  if (protocol.networkType === ConfigNetworkType.NTP) {
    const network = protocol.network as {
      startTime: number;
      blockTimeMS: number;
    };
    const syncProtocol = protocol.syncProtocol as { startBlockHeight: number };
    return {
      startTime: network.startTime,
      blockTimeMS: network.blockTimeMS,
      startBlockHeight: syncProtocol.startBlockHeight,
      startBlockHeightProvenance: provenanceFor(protocol),
    };
  }

  if (protocol.networkType === ConfigNetworkType.TEST) {
    const network = protocol.network as {
      startTime: number;
      blockTimeMS: number;
    };
    return {
      startTime: network.startTime,
      blockTimeMS: network.blockTimeMS,
    };
  }

  if (protocol.syncProtocolType === ConfigSyncProtocolType.CARDANO_CARP_PARALLEL) {
    return {
      startSlot: (protocol.syncProtocol as { startSlot: number }).startSlot,
    };
  }

  if (protocol.syncProtocolType === ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL) {
    return {
      startChainPoint: (protocol.syncProtocol as { startChainPoint: unknown })
        .startChainPoint,
    };
  }

  const knownBlockHeightProtocols: string[] = [
    ConfigSyncProtocolType.EVM_RPC_PARALLEL,
    ConfigSyncProtocolType.MINA_PARALLEL,
    ConfigSyncProtocolType.AVAIL_PARALLEL,
    ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
    ConfigSyncProtocolType.BITCOIN_RPC_PARALLEL,
    ConfigSyncProtocolType.CELESTIA_PARALLEL,
    ConfigSyncProtocolType.NEAR_RPC_PARALLEL,
    ConfigSyncProtocolType.SOLANA_RPC_PARALLEL,
  ];
  if (!knownBlockHeightProtocols.includes(protocol.syncProtocolType)) {
    throw new Error(
      `[config-snapshot] Unhandled sync protocol type "${protocol.syncProtocolType}". ` +
        `extractImmutableConfig must be updated to support this protocol.`,
    );
  }

  const snapshot: Snapshot = {
    startBlockHeight: (protocol.syncProtocol as { startBlockHeight: number })
      .startBlockHeight,
  };
  if (protocol.networkType === ConfigNetworkType.MIDNIGHT) {
    snapshot.startBlockHeightProvenance = provenanceFor(protocol);
  }
  return snapshot;
}

function valuesDiffer(saved: unknown, current: unknown): boolean {
  if (
    typeof saved === "object" && saved !== null &&
    typeof current === "object" && current !== null
  ) {
    return JSON.stringify(saved) !== JSON.stringify(current);
  }
  return saved !== current;
}

function mismatchLine(key: string, saved: unknown, current: unknown): string {
  return `  ${key}: saved=${JSON.stringify(saved)}, current=${JSON.stringify(current)}`;
}

function mismatchError(name: string, mismatches: string[]): Error {
  return new Error(
    `[config-snapshot] CRITICAL: Immutable config fields have changed for protocol "${name}".\n` +
      `${mismatches.join("\n")}\n\n` +
      `If this is intentional (e.g. you want to resume from the original start height/time stored in the DB), ` +
      `set the USE_DB_STARTHEIGHT environment variable and restart the service.\n` +
      `WARNING: Only set USE_DB_STARTHEIGHT if you understand the implications — mismatched start values ` +
      `can cause the node to skip blocks or produce inconsistent state.`,
  );
}

function logDbOverride(name: string, mismatches: string[]): void {
  log.remote(
    ComponentNames.EFFECTSTREAM_RUNTIME,
    [],
    SeverityNumber.WARN,
    (l) =>
      l(
        `[config-snapshot] WARNING: Immutable config mismatch for protocol "${name}". ` +
          `USE_DB_STARTHEIGHT is set; overriding in-memory config with DB snapshot values.\n${mismatches.join("\n")}`,
      ),
  );
}

function logLegacyBackfill(name: string): void {
  log.remote(
    ComponentNames.EFFECTSTREAM_RUNTIME,
    [],
    SeverityNumber.WARN,
    (l) =>
      l(
        `[config-snapshot] WARNING: Atomically backfilled legacy start-policy snapshot for protocol "${name}".`,
      ),
  );
}

function applySnapshotOverrides(
  protocol: SyncProtocolWithNetwork,
  snapshot: Snapshot,
): void {
  if (protocol.networkType === ConfigNetworkType.NTP) {
    const network = protocol.network as Record<string, unknown>;
    if ("startTime" in snapshot) network.startTime = snapshot.startTime;
    if ("blockTimeMS" in snapshot) network.blockTimeMS = snapshot.blockTimeMS;
  }

  const syncProtocol = protocol.syncProtocol as Record<string, unknown>;
  if (protocol.syncProtocolType === ConfigSyncProtocolType.CARDANO_CARP_PARALLEL) {
    if ("startSlot" in snapshot) syncProtocol.startSlot = snapshot.startSlot;
    return;
  }
  if (protocol.syncProtocolType === ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL) {
    if ("startChainPoint" in snapshot) {
      syncProtocol.startChainPoint = snapshot.startChainPoint;
    }
    return;
  }
  if ("startBlockHeight" in snapshot) {
    syncProtocol.startBlockHeight = snapshot.startBlockHeight;
  }
}

async function updateSnapshot(
  dbConn: Client,
  protocol: SyncProtocolWithNetwork,
  snapshot: Snapshot,
  hooks: StartPolicyResolutionHooks,
): Promise<void> {
  if (hooks.updateSnapshot) {
    await hooks.updateSnapshot(
      protocolName(protocol),
      protocol.networkType,
      snapshot,
    );
    return;
  }
  await dbConn.query(
    `UPDATE effectstream.sync_protocol_config_snapshot
       SET network_type = $2, immutable_config = $3::jsonb
     WHERE protocol_name = $1`,
    [protocolName(protocol), protocol.networkType, JSON.stringify(snapshot)],
  );
}

async function getSnapshotRows(
  dbConn: Client,
  name: string,
  hooks: StartPolicyResolutionHooks,
): Promise<{ immutable_config: Snapshot }[]> {
  if (hooks.getSnapshot) return await hooks.getSnapshot(name);
  const rows = await getSyncProtocolConfigSnapshot.run(
    { protocolName: name },
    dbConn,
  );
  return rows.map((row) => ({
    immutable_config: row.immutable_config as Snapshot,
  }));
}

function baseTargetMismatches(
  protocol: SyncProtocolWithNetwork,
  saved: Snapshot,
): string[] {
  if (protocol.networkType !== ConfigNetworkType.NTP) return [];
  const current = extractImmutableConfig(protocol);
  return ["startTime", "blockTimeMS"].flatMap((key) =>
    key in saved && valuesDiffer(saved[key], current[key])
      ? [mismatchLine(key, saved[key], current[key])]
      : []
  );
}

function* reconcileLocalStartSnapshot(
  protocol: SyncProtocolWithNetwork,
  saved: Snapshot,
  dbConn: Client,
  useDbStartHeight: boolean,
  hooks: StartPolicyResolutionHooks,
): Operation<void> {
  const name = protocolName(protocol);
  const provenance = provenanceFor(protocol);
  let mismatches = baseTargetMismatches(protocol, saved);

  if (mismatches.length > 0 && !useDbStartHeight) {
    throw mismatchError(name, mismatches);
  }
  if (mismatches.length > 0) {
    logDbOverride(name, mismatches);
    applySnapshotOverrides(protocol, saved);
  }

  const savedStart = saved.startBlockHeight;
  const hasSavedStart = typeof savedStart === "number" &&
    Number.isSafeInteger(savedStart) && savedStart >= 0;
  if (!hasSavedStart) {
    const resolved = yield* until(resolveRequestedStart(protocol, hooks));
    setResolvedStart(protocol, resolved);
    const backfilled = { ...saved, ...extractImmutableConfig(protocol) };
    yield* until(updateSnapshot(dbConn, protocol, backfilled, hooks));
    logLegacyBackfill(name);
    return;
  }

  const requested = (protocol.syncProtocol as {
    startBlockHeight: StartBlockHeightPolicy;
  }).startBlockHeight;
  if (provenance === "explicit" && requested !== savedStart) {
    mismatches = [mismatchLine("startBlockHeight", savedStart, requested)];
    if (!useDbStartHeight) throw mismatchError(name, mismatches);
    logDbOverride(name, mismatches);
  }

  // A committed numeric boundary always wins for a latest request. For an
  // explicit mismatch it wins only under USE_DB_STARTHEIGHT, as before.
  if (provenance === "latest" || requested !== savedStart) {
    setResolvedStart(protocol, savedStart);
  }

  if (
    saved.startBlockHeightProvenance !== "latest" &&
    saved.startBlockHeightProvenance !== "explicit"
  ) {
    const backfilled = {
      ...saved,
      startBlockHeight: savedStart,
      startBlockHeightProvenance: provenance,
    };
    yield* until(updateSnapshot(dbConn, protocol, backfilled, hooks));
    if (protocol.networkType === ConfigNetworkType.NTP) {
      logLegacyBackfill(name);
    }
  }
}

function* reconcileOrdinarySnapshot(
  protocol: SyncProtocolWithNetwork,
  saved: Snapshot,
  useDbStartHeight: boolean,
): Operation<void> {
  const current = extractImmutableConfig(protocol);
  const mismatches = Object.entries(saved).flatMap(([key, savedValue]) =>
    valuesDiffer(savedValue, current[key])
      ? [mismatchLine(key, savedValue, current[key])]
      : []
  );
  if (mismatches.length === 0) return;

  const name = protocolName(protocol);
  if (!useDbStartHeight) throw mismatchError(name, mismatches);
  logDbOverride(name, mismatches);
  applySnapshotOverrides(protocol, saved);
}

/**
 * Normalize local latest policies and commit immutable numeric snapshots in one
 * transaction. The caller may construct primitives/sync states only after this
 * operation returns, which is strictly after COMMIT.
 */
export function* validateAndSnapshotConfig(
  syncInfo: SyncProtocolWithNetwork[],
  dbConn: Client,
  hooks: StartPolicyResolutionHooks = {},
): Operation<void> {
  const useDbStartHeight = getEnv("USE_DB_STARTHEIGHT") !== undefined;
  let committed = false;
  yield* until(dbConn.query("BEGIN"));
  try {
    for (const protocol of syncInfo) {
      const name = protocolName(protocol);
      let rows = yield* until(getSnapshotRows(dbConn, name, hooks));

      if (rows.length === 0) {
        if (isLocalStartProtocol(protocol)) {
          const resolved = yield* until(resolveRequestedStart(protocol, hooks));
          setResolvedStart(protocol, resolved);
        }
        const current = extractImmutableConfig(protocol);
        if (hooks.upsertSnapshot) {
          yield* until(
            hooks.upsertSnapshot(name, protocol.networkType, current),
          );
        } else {
          yield* until(
            upsertSyncProtocolConfigSnapshot.run(
              {
                protocolName: name,
                networkType: protocol.networkType,
                immutableConfig: JSON.stringify(current),
              },
              dbConn,
            ),
          );
        }
        log.remote(
          ComponentNames.EFFECTSTREAM_RUNTIME,
          [],
          SeverityNumber.INFO,
          (l) =>
            l(
              `[config-snapshot] Saved initial config snapshot for protocol "${name}"`,
            ),
        );
        // Close the ON CONFLICT race: the committed row, not this process's
        // moving observation, owns the boundary.
        rows = yield* until(getSnapshotRows(dbConn, name, hooks));
      }

      const saved = rows[0]?.immutable_config as Snapshot | undefined;
      if (!saved) {
        throw new Error(
          `[config-snapshot] Snapshot row for protocol "${name}" was not readable after insert`,
        );
      }
      if (isLocalStartProtocol(protocol)) {
        yield* reconcileLocalStartSnapshot(
          protocol,
          saved,
          dbConn,
          useDbStartHeight,
          hooks,
        );
      } else {
        yield* reconcileOrdinarySnapshot(protocol, saved, useDbStartHeight);
      }
    }

    if (hooks.beforeCommit) yield* until(Promise.resolve(hooks.beforeCommit()));
    yield* until(dbConn.query("COMMIT"));
    committed = true;
  } catch (error) {
    if (!committed) yield* until(dbConn.query("ROLLBACK"));
    throw error;
  }

  if (hooks.afterCommit) yield* until(Promise.resolve(hooks.afterCommit()));
}
