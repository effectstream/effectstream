import { type ChainBlock, genSyncProtocols } from "@paima/sync";
import { aquireDBMutex, getConnection, releaseDBMutex } from "@paima/db";
import { startMerge, startSync } from "@paima/sync";
import type { SyncProtocolWithNetwork } from "@paima/config";
import type { AppEvents } from "@paima/sm";
import { ComponentNames, log, SeverityNumber } from "@paima/log";
import { createChannel, each, type Operation, spawn } from "effection";
import { initTelemetry } from "./telemetry.ts";
import type { BaseStfInput, BaseStfOutput } from "@paima/sm";
import { processFinalizedBlock } from "./process-blocks.ts";
import { startHttpServer } from "./api/http-server.ts";
import { ENV } from "@paima/utils";

// TODO: figure out how to setup env vars instead of relying on defaults
const poolConfig = {
  host: ENV.DB_HOST,
  user: ENV.DB_USER,
  password: ENV.DB_PW,
  database: ENV.DB_NAME,
  port: ENV.DB_PORT,
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
  migrations?: (blockHeight: number) => Operation<string | undefined>,
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

  yield* spawn(function* () {
    yield* startHttpServer(dbConn);
  });

  const finalizedBlockStream = createChannel<ChainBlock>();
  const processFinalizedBlockFn = processFinalizedBlock(
    gameStateTransitionRouter,
    dbConn,
    migrations,
  );
  yield* spawn(() => startMerge(syncProtocols, finalizedBlockStream));

  for (const value of yield* each(finalizedBlockStream)) {
    yield* aquireDBMutex();
    yield* processFinalizedBlockFn(value);
    log.remote(
      ComponentNames.PAIMA_SYNC,
      "block-merge",
      SeverityNumber.INFO,
      (log) => log(`finalized block ${value.blockNumber}`),
    );
    releaseDBMutex();
    yield* each.next();
  }
}
