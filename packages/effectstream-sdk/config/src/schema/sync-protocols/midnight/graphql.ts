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
 * Where a Midnight sync protocol reads its data from. Exactly one of `indexer` / `umbra` must be
 * set -- enforced at runtime by {@link assertExactlyOneMidnightSource}, since TypeBox alone
 * cannot express "exactly one of these two optional fields" in a way that survives the
 * `cloneMerge` composition used throughout this schema module.
 *
 * `umbra` reads an UmbraDB chain archive directly (Postgres) instead of the indexer's GraphQL.
 * It currently serves only `Midnight:ZswapRoot`; every other Midnight primitive needs data that
 * stateful ledger replay produces, and asking for one throws at startup rather than quietly
 * yielding an empty feed. A config mid-migration therefore carries TWO entries: an umbra one for
 * the migrated primitives and an indexer one for the rest.
 */
export const MidnightUmbraSource = Type.Object({
  /** Postgres connection string for the UmbraDB archive database. */
  databaseUrl: Type.String(),
  /** The archive's network label -- the `net` every feed view is keyed by. Must match what the
   *  archive was ingested under, or the feed is empty. */
  net: Type.String(),
  /** Archive schema; UmbraDB's own default is `chain_archive`. */
  schema: Type.Optional(Type.String()),
});

export const ConfigSyncProtocolSchemaMidnightBase = NameField.cloneMerge(
  PollingSyncProtocol,
).cloneMerge(StartStopBlockheight).cloneMerge({
  required: Type.Object({}),
  optional: Type.Object({
    // Exactly one of these two. Both are optional in the schema and checked at runtime -- see
    // MidnightUmbraSource's doc for why.
    // note: node URL and proof server are not needed for read-only use
    indexer: Type.Optional(Type.String()),
    umbra: Type.Optional(MidnightUmbraSource),
    stepSize: Type.Number({ default: 10 }),
    paginationLimit: Type.Number({ default: 50 }),
  }),
});

/**
 * Enforces the exactly-one-source rule with a message that names the protocol, so a misconfigured
 * entry fails at startup instead of at the first fetch. Both-set is rejected as firmly as
 * neither-set: two sources would silently pick one and quietly ignore the other, which is exactly
 * the kind of "it ran, so it must be right" failure a migration cannot afford.
 */
export function assertExactlyOneMidnightSource(
  protocolName: string,
  source: { indexer?: string; umbra?: { databaseUrl: string; net: string; schema?: string } },
): void {
  const hasIndexer = source.indexer != null && source.indexer !== "";
  const hasUmbra = source.umbra != null;
  if (hasIndexer && hasUmbra) {
    throw new Error(
      `Midnight sync protocol "${protocolName}" sets both "indexer" and "umbra". Exactly one ` +
        `data source is allowed; use two separate sync-protocol entries if you need both.`,
    );
  }
  if (!hasIndexer && !hasUmbra) {
    throw new Error(
      `Midnight sync protocol "${protocolName}" sets neither "indexer" nor "umbra". Exactly one ` +
        `data source is required.`,
    );
  }
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
