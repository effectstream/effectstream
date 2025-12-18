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
 * @param dev - (optional) Development configuration.
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
  snapshotConfig?: {
    interval?: number;
    path?: string;
  };
  dev?: {
    resetPublicData?: boolean;
  };
};
