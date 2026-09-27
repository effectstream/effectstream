import { ConfigSyncProtocolType } from "@effectstream/config";
import type { SyncProtocolWithNetwork } from "@effectstream/config";
import { midnightStartPolicy } from "./midnight/start-policy.ts";
import { ntpStartPolicy } from "./ntp/start-policy.ts";

/**
 * Protocol-owned start policies.
 *
 * The generic runtime (`@effectstream/runtime` `config-snapshot.ts`) knows only
 * this interface: it picks one definition by `syncProtocolType`, asks it to
 * resolve `"latest"` at most once, persists what the definition projects, and
 * hands a saved snapshot back to the definition on every later boot. Start
 * behaviour therefore lives beside each sync implementation instead of inside
 * the runtime's persistence code.
 */

/** One protocol's contribution to the durable snapshot, flattened into JSONB. */
export type StartPolicySnapshotFields = Record<string, unknown>;

/** Key the block-height protocols persist next to their numeric boundary. */
export const START_BLOCK_HEIGHT_PROVENANCE = "startBlockHeightProvenance";

/** The numeric first boundary a protocol starts from, and how it was obtained. */
export type ResolvedStart = {
  startBlockHeight: number;
  provenance: "latest" | "explicit";
};

/**
 * The two groups the runtime treats differently when a snapshot already exists:
 *
 * - `validated` keeps the historical contract: a saved-vs-current difference
 *   aborts startup with the CRITICAL error unless `USE_DB_STARTHEIGHT` is set,
 *   which downgrades it to a warning and lets the saved value win.
 * - `restored` is always adopted from the snapshot (with a warning when the
 *   adopted value differs from the freshly configured one). This is what makes
 *   a re-sampled clock or a `"latest"` start survive a restart unchanged.
 *
 * Both groups are persisted flattened into the same JSONB document; the group
 * membership is owned by the definition and is never stored.
 */
export type StartPolicyProjection = {
  validated: StartPolicySnapshotFields;
  restored: StartPolicySnapshotFields;
};

export type SyncProtocolStartPolicy = {
  /**
   * Resolve `"latest"` to an inclusive numeric first boundary. Only called on
   * the first run of a protocol whose configured start is `"latest"`.
   */
  resolveLatest(entry: SyncProtocolWithNetwork): Promise<number>;
  /** Project the immutable fields this protocol persists, split into groups. */
  projectImmutable(
    entry: SyncProtocolWithNetwork,
    resolved: ResolvedStart,
  ): StartPolicyProjection;
  /** Apply a saved snapshot onto the in-memory config — the saved value wins. */
  applySnapshot(
    entry: SyncProtocolWithNetwork,
    snapshot: StartPolicySnapshotFields,
  ): void;
};

type BlockHeightCarrier = { startBlockHeight?: number | "latest" };

/** True when this boot asked the protocol to discover its own first boundary. */
export function configuredStartIsLatest(entry: SyncProtocolWithNetwork): boolean {
  return (entry.syncProtocol as unknown as BlockHeightCarrier).startBlockHeight ===
    "latest";
}

/** `resolveLatest` for protocols whose schema has no `"latest"` (FR-005). */
export function rejectLatest(entry: SyncProtocolWithNetwork): Promise<never> {
  return Promise.reject(
    new Error(
      `[start-policy] "latest" is not supported for sync protocol type ` +
        `"${String(entry.syncProtocolType)}".`,
    ),
  );
}

/**
 * The shared block-height split: an explicitly configured start stays
 * mismatch-checked, a `"latest"` start is restored (a configured `"latest"` can
 * never be a mismatch — that is the whole feature).
 */
export function projectBlockHeightStart(
  entry: SyncProtocolWithNetwork,
  resolved: ResolvedStart,
): StartPolicyProjection {
  const validated: StartPolicySnapshotFields = {};
  const restored: StartPolicySnapshotFields = {
    [START_BLOCK_HEIGHT_PROVENANCE]: resolved.provenance,
  };
  if (configuredStartIsLatest(entry)) {
    restored["startBlockHeight"] = resolved.startBlockHeight;
  } else {
    validated["startBlockHeight"] = resolved.startBlockHeight;
  }
  return { validated, restored };
}

/** Write a saved numeric boundary back onto the live protocol config. */
export function applyBlockHeightStart(
  entry: SyncProtocolWithNetwork,
  snapshot: StartPolicySnapshotFields,
): void {
  if ("startBlockHeight" in snapshot) {
    (entry.syncProtocol as unknown as BlockHeightCarrier).startBlockHeight =
      snapshot["startBlockHeight"] as number;
  }
}

/**
 * Passthrough definition for protocols whose start is already numeric and
 * whose schema does not accept `"latest"`.
 */
export const numericStartPolicy: SyncProtocolStartPolicy = {
  resolveLatest: rejectLatest,
  projectImmutable: projectBlockHeightStart,
  applySnapshot: applyBlockHeightStart,
};

/**
 * The synthetic TEST chain derives blocks arithmetically from
 * `network.startTime + network.blockTimeMS`, exactly like NTP — but unlike NTP
 * those two fields stay *validated*, preserving today's mismatch-CRITICAL
 * behaviour. Shared by TEST_MAIN and TEST_PARALLEL, because today's
 * `extractImmutableConfig` branched on `networkType === TEST` for both.
 */
const testStartPolicy: SyncProtocolStartPolicy = {
  resolveLatest: rejectLatest,
  projectImmutable(entry, resolved) {
    const network = entry.network as unknown as {
      startTime: number;
      blockTimeMS: number;
    };
    const start = projectBlockHeightStart(entry, resolved);
    return {
      validated: {
        startTime: network.startTime,
        blockTimeMS: network.blockTimeMS,
        ...start.validated,
      },
      restored: start.restored,
    };
  },
  applySnapshot(entry, snapshot) {
    // Under USE_DB_STARTHEIGHT the saved network fields are written back too,
    // closing the historical gap where the override skipped them for TEST.
    const network = entry.network as unknown as Record<string, unknown>;
    if ("startTime" in snapshot) network["startTime"] = snapshot["startTime"];
    if ("blockTimeMS" in snapshot) {
      network["blockTimeMS"] = snapshot["blockTimeMS"];
    }
    applyBlockHeightStart(entry, snapshot);
  },
};

/** Cardano CARP starts from an absolute slot, never a block height. */
const cardanoCarpStartPolicy: SyncProtocolStartPolicy = {
  resolveLatest: rejectLatest,
  projectImmutable(entry) {
    const syncProtocol = entry.syncProtocol as unknown as { startSlot: unknown };
    return { validated: { startSlot: syncProtocol.startSlot }, restored: {} };
  },
  applySnapshot(entry, snapshot) {
    if ("startSlot" in snapshot) {
      (entry.syncProtocol as unknown as Record<string, unknown>)["startSlot"] =
        snapshot["startSlot"];
    }
  },
};

/** Cardano UTXOrpc starts from a chain point (`origin`, `tip`, or a point). */
const cardanoUtxoRpcStartPolicy: SyncProtocolStartPolicy = {
  resolveLatest: rejectLatest,
  projectImmutable(entry) {
    const syncProtocol = entry.syncProtocol as unknown as {
      startChainPoint: unknown;
    };
    return {
      validated: { startChainPoint: syncProtocol.startChainPoint },
      restored: {},
    };
  },
  applySnapshot(entry, snapshot) {
    if ("startChainPoint" in snapshot) {
      (entry.syncProtocol as unknown as Record<string, unknown>)[
        "startChainPoint"
      ] = snapshot["startChainPoint"];
    }
  },
};

/**
 * Exhaustive by construction: adding a `ConfigSyncProtocolType` without a start
 * definition is a compile error, and the runtime never guesses.
 */
export const startPolicyRegistry = {
  [ConfigSyncProtocolType.NTP_MAIN]: ntpStartPolicy,
  [ConfigSyncProtocolType.EVM_RPC_PARALLEL]: numericStartPolicy,
  [ConfigSyncProtocolType.CARDANO_CARP_PARALLEL]: cardanoCarpStartPolicy,
  [ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL]: cardanoUtxoRpcStartPolicy,
  [ConfigSyncProtocolType.MINA_PARALLEL]: numericStartPolicy,
  [ConfigSyncProtocolType.AVAIL_PARALLEL]: numericStartPolicy,
  [ConfigSyncProtocolType.MIDNIGHT_PARALLEL]: midnightStartPolicy,
  [ConfigSyncProtocolType.BITCOIN_RPC_PARALLEL]: numericStartPolicy,
  [ConfigSyncProtocolType.CELESTIA_PARALLEL]: numericStartPolicy,
  [ConfigSyncProtocolType.NEAR_RPC_PARALLEL]: numericStartPolicy,
  [ConfigSyncProtocolType.SOLANA_RPC_PARALLEL]: numericStartPolicy,
  [ConfigSyncProtocolType.TEST_MAIN]: testStartPolicy,
  [ConfigSyncProtocolType.TEST_PARALLEL]: testStartPolicy,
} as const satisfies Record<ConfigSyncProtocolType, SyncProtocolStartPolicy>;
