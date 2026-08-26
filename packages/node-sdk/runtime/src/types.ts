import type { Operation } from "effection";
import type { AllSyncProtocols } from "@effectstream/sync";
import type { SyncProtocolWithNetwork } from "@effectstream/config";
import type { AppEvents, BaseStfInput, BaseStfOutput, Primitive } from "@effectstream/sm";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { SnapshotConfig } from "@effectstream/db";
import type { SyncStateUpdateStream } from "@effectstream/coroutine";
import type { GrammarDefinition } from "@effectstream/concise";
// These are user type defined objects for launching the Effectstream Node.

export type VERSION = `${number}.${number}.${number}`;

/**
 * Type for the app state transitions function.
 * For each `prefix` it can return a list of state transitions and events.
 */
export type StartConfigAppStateTransitions = (
  blockHeight: number,
  input: BaseStfInput,
) => SyncStateUpdateStream<void>;

export type DBMigrations = {
  versionDependency?: VERSION;
  blockHeight?: number;
  name: string;
  sql: string;
};

/**
 * Type for the API router function.
 * It should return a valid Fastify instance.
 */
export type StartConfigApiRouter = (
  server: FastifyInstance,
  dbConn: Pool,
) => Promise<void>;

export type PrimitiveConstructor<T extends Primitive<any, any>> = new (config: any) => T;

/**
 * Main configuration object for the Effectstream Node.
 *
 * @param syncInfo - The Networks/Primitives Sync information.
 * @param appStateTransitions - (optional) App State Transition Router.
 * @param migrationRouter - (optional) SQL Migrations Router.
 * @param apiRouter - (optional) API Router.
 * @param snapshotConfig - (optional) Automated database snapshot configuration.
 * @param dev - (optional) Development-only configuration.
 * @param dev.resetPublicData - (optional) With this flag, the public schema tables data will be reset on sync process reset. This is useful for testing purposes.

 */
export type StartConfig = {
  appName: string;
  appVersion: VERSION;
  syncInfo: SyncProtocolWithNetwork[];
  appStateTransitions?: StartConfigAppStateTransitions;
  migrations?: DBMigrations[];
  apiRouter?: StartConfigApiRouter;
  grammar?: GrammarDefinition;
  userDefinedPrimitives?: Record<string, PrimitiveConstructor<any>>;
  /** Publish MQTT events. Defaults to true; small read-only nodes may disable it. */
  events?: boolean;
  /**
   * Automated database snapshot configuration via `pg_dump`.
   * An empty object `{}` enables snapshots with all defaults.
   *
   * Env overrides: `EFFECTSTREAM_SNAPSHOT_INTERVAL_SECONDS`, `EFFECTSTREAM_SNAPSHOT_PATH`,
   * `EFFECTSTREAM_SNAPSHOT_LAST_DAY_HOURLY`, `EFFECTSTREAM_SNAPSHOT_LAST_3_DAYS_SIX_HOURLY`,
   * `EFFECTSTREAM_SNAPSHOT_LAST_N_DAYS`.
   * @see docs/home/1000-effectstream-engine/1003-database-snapshots.md
   */
  snapshotConfig?: SnapshotConfig;
  /** Development-only options. Do not use in production. */
  dev?: {
    /** Reset public-schema tables on each sync reset. For local testing only. */
    resetPublicData?: boolean;
    /**
     * Test-only hook invoked once the sync protocols are instantiated (after
     * `genSyncProtocols`, before the merge starts). Lets tests observe live
     * state such as `bufferedData.size()`. No effect in production.
     */
    onStarted?: (ctx: { syncProtocols: AllSyncProtocols[] }) => void;
    /**
     * Test/diagnostic only: sleep this many ms after each applied block, slowing
     * the drain so the per-chain fetch buffers fill to their cap and the
     * backpressure fix becomes observable (otherwise drain ≈ fetch and the buffer
     * never grows). No effect in production (leave unset / 0).
     */
    applyDelayMs?: number;
  };
};
