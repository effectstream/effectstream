import type { Operation } from "effection";
import type { SyncProtocolWithNetwork } from "@paima/config";
import type { AppEvents, BaseStfInput, BaseStfOutput } from "@paima/sm";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
// These are user type defined objects for launching Paima Engine Node.

/**
 * Type for the game state transitions function.
 * For each `prefix` it can return a list of state transitions and events.
 */
export type StartConfigGameStateTransitions = (
  blockHeight: number,
  input: BaseStfInput,
) => Promise<BaseStfOutput<AppEvents>>;

/**
 * Type for the migration router function.
 * It should return a valid SQL to be executed at a given block height.
 */
export type StartConfigMigrationRouter = (
  blockHeight: number,
) => Promise<string | undefined>;

/**
 * Type for the API router function.
 * It should return a valid Fastify instance.
 */
export type StartConfigApiRouter = (
  server: FastifyInstance,
  dbConn: Pool,
) => Promise<void>;

/**
 * Main configuration object for the Paima Engine Node.
 *
 * @param syncInfo - The Networks/Primitives Sync information.
 * @param gameStateTransitions - (optional) Game State Transition Router.
 * @param migrationRouter - (optional) SQL Migrations Router.
 * @param apiRouter - (optional) API Router.
 */
export type StartConfig = {
  syncInfo: SyncProtocolWithNetwork[];
  gameStateTransitions?: StartConfigGameStateTransitions;
  migrationRouter?: StartConfigMigrationRouter;
  apiRouter?: StartConfigApiRouter;
};
