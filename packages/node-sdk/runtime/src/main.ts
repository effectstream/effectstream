import { type ChainBlock, genSyncProtocols } from "@paima/sync";
import {
  aquireDBMutex,
  createDynamicTables,
  getConnection,
  releaseDBMutex,
} from "@paima/db";
import { startMerge, startSync } from "@paima/sync";
import type { SyncProtocolWithNetwork } from "@paima/config";
import type { AppEvents } from "@paima/sm";
import { ComponentNames, log, SeverityNumber } from "@paima/log";
import { createChannel, each, type Operation, spawn } from "effection";
import { initTelemetry } from "./telemetry.ts";
import type { BaseStfInput, BaseStfOutput } from "@paima/sm";
import { processFinalizedBlock } from "./process-blocks.ts";
import { startHttpServer } from "./api/http-server.ts";

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
  const dbConn = getConnection();
  const syncProtocols = yield* genSyncProtocols(dbConn, syncInfo);

  // TODO We only need to do this once, at the beginning.
  //      We have to distinguish between the start or restart of the node.
  //      Futher updates need to be managed by the user.
  yield* createDynamicTables(dbConn, syncProtocols);

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
    yield* startHttpServer(dbConn, syncProtocols);
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
    const blockHash = yield* processFinalizedBlockFn(value);
    log.remote(
      ComponentNames.PAIMA_SYNC,
      "block-merge",
      SeverityNumber.INFO,
      (log) => log(`finalized block ${value.blockNumber} @ ${blockHash}`),
    );
    releaseDBMutex();
    yield* each.next();
  }
}
