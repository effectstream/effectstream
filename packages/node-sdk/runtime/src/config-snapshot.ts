import type { Client } from "pg";
import type { Operation } from "effection";
import { until } from "effection";
import {
  getSyncProtocolConfigSnapshot,
  upsertSyncProtocolConfigSnapshot,
} from "@effectstream/db";
import { ConfigNetworkType, ConfigSyncProtocolType } from "@effectstream/config";
import type { SyncProtocolWithNetwork } from "@effectstream/config";
import { log, ComponentNames, SeverityNumber } from "@effectstream/log";
import { getEnv } from "@effectstream/utils/runtime";

/**
 * Fields that must not change between restarts for each protocol type.
 * Changing these would cause the node to sync from a different point in time/block,
 * leading to inconsistent state.
 *
 * Field names by protocol:
 *   NTP                        → network.startTime, network.blockTimeMS
 *   Cardano CARP               → syncProtocol.startSlot
 *   Cardano UTXOrpc            → syncProtocol.startChainPoint
 *   EVM, Mina, Avail, Midnight,
 *   Bitcoin, Celestia          → syncProtocol.startBlockHeight
 */
function extractImmutableConfig(protocol: SyncProtocolWithNetwork): Record<string, unknown> {
  // NTP and the synthetic TEST chain both derive blocks arithmetically from
  // network.startTime + network.blockTimeMS, so those are the immutable fields.
  if (
    protocol.networkType === ConfigNetworkType.NTP ||
    protocol.networkType === ConfigNetworkType.TEST
  ) {
    const arithmeticNetwork = protocol.network as {
      startTime: number;
      blockTimeMS: number;
    };
    return {
      startTime: arithmeticNetwork.startTime,
      blockTimeMS: arithmeticNetwork.blockTimeMS,
    };
  }

  if (protocol.syncProtocolType === ConfigSyncProtocolType.CARDANO_CARP_PARALLEL) {
    const sp = protocol.syncProtocol as { startSlot: number };
    return { startSlot: sp.startSlot };
  }

  if (protocol.syncProtocolType === ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL) {
    const sp = protocol.syncProtocol as { startChainPoint: unknown };
    return { startChainPoint: sp.startChainPoint };
  }

  // EVM, Mina, Avail, Midnight, Bitcoin, Celestia
  const knownBlockHeightProtocols: string[] = [
    ConfigSyncProtocolType.EVM_RPC_PARALLEL,
    ConfigSyncProtocolType.MINA_PARALLEL,
    ConfigSyncProtocolType.AVAIL_PARALLEL,
    ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
    ConfigSyncProtocolType.BITCOIN_RPC_PARALLEL,
    ConfigSyncProtocolType.CELESTIA_PARALLEL,
    ConfigSyncProtocolType.NEAR_RPC_PARALLEL,
  ];
  if (!knownBlockHeightProtocols.includes(protocol.syncProtocolType)) {
    throw new Error(
      `[config-snapshot] Unhandled sync protocol type "${protocol.syncProtocolType}". ` +
      `extractImmutableConfig must be updated to support this protocol.`,
    );
  }

  const sp = protocol.syncProtocol as { startBlockHeight: number };
  return { startBlockHeight: sp.startBlockHeight };
}

/**
 * Checks the saved config snapshot for each sync protocol against the current config.
 *
 * On the first run (no snapshot in DB), the current config is persisted as the canonical snapshot.
 *
 * On subsequent runs, if an immutable field has changed:
 *  - If the `USE_DB_STARTHEIGHT` environment variable is set, the DB value is used and a warning is logged.
 *  - Otherwise, an error is thrown to prevent the node from starting with an inconsistent config.
 *
 * The function mutates `syncInfo` in place when `USE_DB_STARTHEIGHT` overrides values.
 */
export function* validateAndSnapshotConfig(
  syncInfo: SyncProtocolWithNetwork[],
  dbConn: Client,
): Operation<void> {
  console.log("validateAndSnapshotConfig");
  const useDbStartHeight = getEnv("USE_DB_STARTHEIGHT") !== undefined;

  for (const protocol of syncInfo) {
    const protocolName: string = (protocol.syncProtocol as { name: string }).name;
    const currentImmutable = extractImmutableConfig(protocol);

    const rows = yield* until(
      getSyncProtocolConfigSnapshot.run({ protocolName }, dbConn),
    );

    if (rows.length === 0) {
      // First run: persist the snapshot.
      yield* until(
        upsertSyncProtocolConfigSnapshot.run(
          {
            protocolName,
            networkType: protocol.networkType,
            immutableConfig: JSON.stringify(currentImmutable),
          },
          dbConn,
        ),
      );
      log.remote(
        ComponentNames.EFFECTSTREAM_RUNTIME,
        [],
        SeverityNumber.INFO,
        (l) => l(`[config-snapshot] Saved initial config snapshot for protocol "${protocolName}"`),
      );
      continue;
    }

    const saved = rows[0].immutable_config as Record<string, unknown>;
    const mismatches: string[] = [];
    console.log("saved", saved);
    for (const [key, savedValue] of Object.entries(saved)) {
      console.log("key", key, savedValue, currentImmutable[key]);
      // if (currentImmutable[key] !== savedValue) {
      //   mismatches.push(`  ${key}: saved=${JSON.stringify(savedValue)}, current=${JSON.stringify(currentImmutable[key])}`);
      // }
      if (typeof savedValue === "object" && savedValue !== null) {
        for (const [k, v] of Object.entries(savedValue)) {
          if ((currentImmutable[key] as any)[k] !== v) {
            mismatches.push(`  ${key}.${k}: saved=${JSON.stringify(v)},\n current=${JSON.stringify((currentImmutable[key] as any)[k])}`);
          }
        }
      } else if (currentImmutable[key] !== savedValue) {
        mismatches.push(`  ${key}: saved=${JSON.stringify(savedValue)},\n current=${JSON.stringify(currentImmutable[key])}`);
      }
    }

    if (mismatches.length === 0) {
      continue;
    }

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

    // USE_DB_STARTHEIGHT is set — apply the DB values and warn.
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

    applySnapshotOverrides(protocol, saved);
  }
}

/**
 * Applies the saved immutable values from `snapshot` onto the in-memory protocol config.
 * This mutates the protocol objects so the rest of the startup uses the corrected values.
 */
function applySnapshotOverrides(
  protocol: SyncProtocolWithNetwork,
  snapshot: Record<string, unknown>,
): void {
  if (protocol.networkType === ConfigNetworkType.NTP) {
    const ntpNetwork = protocol.network as Record<string, unknown>;
    if ("startTime" in snapshot) ntpNetwork["startTime"] = snapshot["startTime"];
    if ("blockTimeMS" in snapshot) ntpNetwork["blockTimeMS"] = snapshot["blockTimeMS"];
    return;
  }

  const sp = protocol.syncProtocol as Record<string, unknown>;

  if (protocol.syncProtocolType === ConfigSyncProtocolType.CARDANO_CARP_PARALLEL) {
    if ("startSlot" in snapshot) sp["startSlot"] = snapshot["startSlot"];
    return;
  }

  if (protocol.syncProtocolType === ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL) {
    if ("startChainPoint" in snapshot) sp["startChainPoint"] = snapshot["startChainPoint"];
    return;
  }

  if ("startBlockHeight" in snapshot) sp["startBlockHeight"] = snapshot["startBlockHeight"];
}
