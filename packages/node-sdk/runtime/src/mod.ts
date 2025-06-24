import { type ChainBlock, genSyncProtocols } from "@paima/sync";
import { getConnection } from "@paima/db";
import { startMerge, startSync } from "@paima/sync";
import type { SyncProtocolWithNetwork } from "@paima/config";
import type { AppEvents } from "@paima/sm";
import { ComponentNames, log, SeverityNumber } from "@paima/log";
import { createChannel, each, type Operation, spawn } from "effection";
import { initTelemetry } from "./telemetry.ts";
import type { BaseStfInput, BaseStfOutput } from "@paima/sm";
import { processFinalizedBlock } from "./process-blocks.ts";
// import { gameStateTransitionRouter } from "@example/state-transition";
// TODO: figure out how to setup env vars instead of relying on defaults
const poolConfig = {
  host: Deno.env.get("DB_HOST") || "localhost",
  user: Deno.env.get("DB_USER") || "postgres",
  password: Deno.env.get("DB_PW") || "",
  database: Deno.env.get("DB_NAME") || "postgres",
  port: parseInt(Deno.env.get("DB_PORT") || "5432", 10),
};

export function* init() {
  // initialize OpenTelemetry
  yield* initTelemetry();
}

export function* start(
  syncInfo: SyncProtocolWithNetwork[],
  gameStateTransitionRouter: (
    blockHeight: number,
    input: BaseStfInput,
  ) => Promise<BaseStfOutput<AppEvents>>,
): Operation<void> {
  const dbConn = getConnection(poolConfig);
  const syncProtocols = yield* genSyncProtocols(dbConn, syncInfo);

  log.remote(
    ComponentNames.PAIMA_RUNTIME,
    [],
    SeverityNumber.INFO,
    (log) => log("start sync"),
  );
  for (const syncProtocol of syncProtocols) {
    yield* startSync(syncProtocol);
  }

  const finalizedBlockStream = createChannel<ChainBlock>();
  yield* spawn(() => startMerge(syncProtocols, finalizedBlockStream));

  for (const value of yield* each(finalizedBlockStream)) {
    yield* processFinalizedBlock(value, gameStateTransitionRouter, dbConn);
    yield* each.next();
  }
}
