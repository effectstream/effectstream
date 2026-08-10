import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { ConfigSyncProtocolType } from "../types.ts";
import {
  NameField,
  PollingSyncProtocol,
  StartStopBlockheight,
} from "../../common.ts";
import {
  CommonResponseParallelSyncProtocol,
  type ConfigSyncProtocolCommonResponse,
  genCommonResponse,
  waitingPeriodFromDepth,
} from "../common.ts";
import {
  type IntervalMs,
  type MergeIntersects,
  TypeboxHelpers,
} from "@effectstream/utils";

// ===========
// Base schema
// ===========

/**
 * Reading Midnight primitives from an UmbraDB chain archive over Postgres, instead of the indexer's
 * GraphQL API.
 *
 * Exactly one of `indexer` / `umbra` must be set — enforced at runtime by
 * {@link assertExactlyOneMidnightSource}, because TypeBox cannot express "exactly one of these two
 * optional fields" in a way that survives the `cloneMerge` composition used across this module.
 *
 * `umbra` currently serves only `Midnight:UnshieldedCreate`; every other Midnight primitive needs
 * data that only stateful ledger replay produces. A config mid-migration therefore carries TWO
 * entries: an umbra one for the migrated primitive and an indexer one for the rest.
 */
export const MidnightUmbraSource = Type.Object({
  /** Postgres connection string for the UmbraDB archive database. */
  databaseUrl: Type.String(),
  /** The archive's network label — the `net` every row is keyed by. Must match what the archive was
   *  ingested under, or the feed is empty. */
  net: Type.String(),
  /** Archive schema; UmbraDB's own default is `chain_archive`. */
  schema: Type.Optional(Type.String()),
  /**
   * Proceed on transactions whose applied result the archive does not record.
   *
   * **Required for any UmbraDB-backed entry today.** Stock UmbraDB never populates
   * `chain_archive.transactions.result`, so without this the reader refuses every transaction and
   * the state machine never fires. It waives only the *unknown* case — a result positively recorded
   * as `failure`/`partial_success` is still refused.
   *
   * Deliberately unpleasant to type: a genuinely failed transaction whose result was simply not
   * recorded will be emitted as though it landed. Only set it where something else establishes the
   * range contains no such transaction. Delete it — do not rename it — once the archive populates
   * `result`.
   */
  unsafeAllowIncompleteEffects: Type.Optional(Type.Boolean()),
});

export const ConfigSyncProtocolSchemaMidnightBase = NameField.cloneMerge(
  PollingSyncProtocol,
).cloneMerge(StartStopBlockheight).cloneMerge({
  required: Type.Object({}),
  optional: Type.Object({
    // Exactly one of these two; both optional in the schema, checked at runtime — see
    // MidnightUmbraSource's doc for why.
    // note: node URL and proof server are not needed for read-only use
    indexer: Type.Optional(Type.String()),
    umbra: Type.Optional(MidnightUmbraSource),
    stepSize: Type.Number({ default: 10 }),
    paginationLimit: Type.Number({ default: 50 }),
  }),
});

/** The shape {@link assertExactlyOneMidnightSource} validates. */
export interface MidnightSourceLike {
  indexer?: string;
  umbra?: {
    databaseUrl: string;
    net: string;
    schema?: string;
    unsafeAllowIncompleteEffects?: boolean;
  };
}

/**
 * Enforces the exactly-one-source rule, naming the protocol so a misconfigured entry fails at
 * startup rather than at the first fetch. Both-set is rejected as firmly as neither-set: two
 * sources would silently pick one and ignore the other, which is exactly the "it ran, so it must be
 * right" failure a migration cannot afford.
 */
export function assertExactlyOneMidnightSource(
  protocolName: string,
  source: MidnightSourceLike,
): void {
  const hasIndexer = source.indexer != null && source.indexer !== "";
  const hasUmbra = source.umbra != null;
  if (hasIndexer && hasUmbra) {
    throw new Error(
      `Midnight sync protocol "${protocolName}" sets both "indexer" and "umbra". Exactly one data ` +
        `source is allowed; use two separate sync-protocol entries if you need both.`,
    );
  }
  if (!hasIndexer && !hasUmbra) {
    throw new Error(
      `Midnight sync protocol "${protocolName}" sets neither "indexer" nor "umbra". Exactly one ` +
        `data source is required.`,
    );
  }
}

/**
 * Refuses an UmbraDB-backed entry on any network other than a local dev one.
 *
 * The UmbraDB source is an explicitly incomplete, devnet-only demonstration: it cannot gate on
 * applied-ness (stock UmbraDB records no transaction result) and it refuses reward claims outright.
 * Documentation alone would not stop an operator enabling it in production, so this is a
 * construction-time guard rather than a note.
 */
export function assertUmbraSourceNetworkAllowed(
  protocolName: string,
  networkId: string | undefined,
): void {
  const allowed = new Set(["undeployed"]);
  if (networkId !== undefined && allowed.has(networkId)) return;
  throw new Error(
    `Midnight sync protocol "${protocolName}" uses the UmbraDB source on network ` +
      `"${networkId ?? "<unset>"}". That source is a devnet-only demonstration -- it cannot gate on ` +
      `applied transaction results and refuses ClaimRewards transactions -- so it is allowed only ` +
      `on: ${[...allowed].join(", ")}.`,
  );
}

export const CommonResponseMidnightGraphqlBase = {
  internal: {},
  payload: {
    primitiveName: Type.String(),
    caip2: TypeboxHelpers.Caip2,
    ownChain: Type.Object({
      blockNumber: TypeboxHelpers.BlockNumber(),
    }),
    transactionHash: TypeboxHelpers.Midnight.TxHash,
  },
} as const satisfies ConfigSyncProtocolCommonResponse;

// ==========================
// Variant 2: parallel config
// ==========================

const blockTime: IntervalMs = 6 * 1000; // 6 seconds
/**
 * finality is "2~3 blocks", so we pick the larger of the two
 */
const finalityDepth = 3;

export const ConfigSyncProtocolSchemaMidnightParallel =
  ConfigSyncProtocolSchemaMidnightBase
    .cloneMerge({
      required: Type.Object({
        type: Type.Literal(ConfigSyncProtocolType.MIDNIGHT_PARALLEL),
      }),
      optional: Type.Object({
        ...waitingPeriodFromDepth(finalityDepth, blockTime, {
          absolute: 2 * 1000,
        }),
      }),
    });
export type ConfigSyncProtocolMidnightParallel = MergeIntersects<
  Static<
    ReturnType<
      typeof ConfigSyncProtocolSchemaMidnightParallel.allProperties<true>
    >
  >
>;

export const CommonResponseMidnightGraphqlParallel = genCommonResponse(
  CommonResponseParallelSyncProtocol,
  CommonResponseMidnightGraphqlBase,
);
