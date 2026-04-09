import type { Operation } from "effection";
import type { SyncProtocolWithNetwork } from "@effectstream/config";
import type { AppEvents, BaseStfInput, BaseStfOutput, PaimaPrimitive } from "@effectstream/sm";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { SyncStateUpdateStream } from "@effectstream/coroutine";
import type { GrammarDefinition } from "@effectstream/concise";
// These are user type defined objects for launching Paima Engine Node.

export type VERSION = `${number}.${number}.${number}`;

/**
 * Type for the game state transitions function.
 * For each `prefix` it can return a list of state transitions and events.
 */
export type StartConfigGameStateTransitions = (
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

export type PaimaPrimitiveConstructor<T extends PaimaPrimitive<any, any>> = new (config: any) => T;

/**
 * Main configuration object for the Paima Engine Node.
 *
 * @param syncInfo - The Networks/Primitives Sync information.
 * @param gameStateTransitions - (optional) Game State Transition Router.
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
  gameStateTransitions?: StartConfigGameStateTransitions;
  migrations?: DBMigrations[];
  apiRouter?: StartConfigApiRouter;
  grammar?: GrammarDefinition;
  userDefinedPrimitives?: Record<string, PaimaPrimitiveConstructor<any>>;
  /**
   * Automated database snapshot configuration via pg_dump.
   *
   * Setting this field (even as an empty object `{}`) enables snapshots
   * with sensible defaults — no further configuration is required.
   *
   * Snapshots are created in **pg_dump custom format** (`-F c`).
   * They do NOT block normal DML operations (INSERT/UPDATE/DELETE/SELECT)
   * because pg_dump uses PostgreSQL's MVCC to take a consistent snapshot.
   * Only DDL operations (DROP TABLE, ALTER TABLE, TRUNCATE) are blocked
   * while the dump runs.
   *
   * Works for both PGlite (via its pg-gateway TCP server) and real PostgreSQL.
   *
   * ## How to restore a snapshot
   * ```bash
   * pg_restore -h localhost -p 5432 -U postgres -d postgres --clean snapshot-N.dump
   * ```
   *
   * ## Environment variable overrides
   * - `PAIMA_SNAPSHOT_INTERVAL`              – block interval (overrides `interval`)
   * - `PAIMA_SNAPSHOT_PATH`                  – output directory (overrides `path`)
   * - `PAIMA_SNAPSHOT_LAST_DAY_HOURLY`       – "false" to disable hourly tier
   * - `PAIMA_SNAPSHOT_LAST_3_DAYS_SIX_HOURLY` – "false" to disable 6-hour tier
   * - `PAIMA_SNAPSHOT_LAST_N_DAYS`           – override daily retention window
   */
  snapshotConfig?: {
    /** Block interval between snapshots. Default: 100 */
    interval?: number;
    /** Directory path for snapshot `.dump` files. Default: `"./snapshots"` */
    path?: string;
    /**
     * Time-based tiered retention policy.
     * File age is determined by `mtime`.
     *
     * | Age            | Granularity kept         |
     * |----------------|--------------------------|
     * | ≤ 24 h         | One per **hour**         |
     * | 24 h – 3 days  | One per **6-hour window**|
     * | 3 days – N days| One per **day**          |
     * | > N days       | Deleted                  |
     */
    retention?: {
      /** Keep one snapshot per hour for the last 24 h. Default: `true` */
      lastDayHourly?: boolean;
      /** Keep one snapshot per 6 h for the last 3 days. Default: `true` */
      last3DaysSixHourly?: boolean;
      /** How many days of daily snapshots to keep. Default: `7` */
      lastNDaysDaily?: number;
    };
  };
  /**
   * Development-only configuration.
   * These settings should not be used in production.
   */
  dev?: {
    /**
     * When `true`, the public schema tables data will be reset each time the
     * sync process resets. Useful for local testing.
     */
    resetPublicData?: boolean;
  };
};
