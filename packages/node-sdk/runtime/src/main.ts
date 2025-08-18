import { type ChainBlock, genSyncProtocols } from "@paima/sync";
import {
  aquireDBMutex,
  createDynamicTables,
  getConnection,
  releaseDBMutex,
} from "@paima/db";
import { startMerge, startSync } from "@paima/sync";
import { ComponentNames, log, SeverityNumber } from "@paima/log";
import { createChannel, each, type Operation, spawn, until } from "effection";
import { initTelemetry } from "./telemetry.ts";
import { processFinalizedBlock } from "./process-blocks.ts";
import { startHttpServer } from "./api/http-server.ts";
import type { StartConfig } from "./types.ts";
import type { Client } from "pg";
import type { EvmBlockHash } from "@paima/utils";

export function* init() {
  // initialize OpenTelemetry
  yield* initTelemetry();
}

/**
 * Main entry point to start the Paima Engine Node.
 *
 * This will launch the networks/primitives syncronization sub-processes,
 * the HTTP server, and the merge and paima-block generation process.
 *
 * @param config - Paima Engine Node configuration object.
 */
export function* start(config: StartConfig): Operation<void> {
  const { syncInfo } = config;
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
    yield* startHttpServer(dbConn, syncProtocols, config.apiRouter);
  });

  const finalizedBlockStream = createChannel<ChainBlock>();

  yield* spawn(() => startMerge(syncProtocols, finalizedBlockStream));

  for (const value of yield* each(finalizedBlockStream)) {
    let blockHash: EvmBlockHash;
    // We request a dbClient for a non-shared dbConn object.
    // For PGLite, this is not enough, as the can only be one connection at a time.
    // So we request a DBMutex as well.
    const dbClient: Client = yield* until(dbConn.connect());
    try {
      yield* aquireDBMutex("processing-blocks");
      blockHash = yield* processFinalizedBlock(value, config, dbClient);
    } finally {
      releaseDBMutex();
      dbClient.release();
    }

    log.remote(
      ComponentNames.PAIMA_SYNC,
      "block-merge",
      SeverityNumber.INFO,
      (log) => log(`finalized block ${value.blockNumber} @ ${blockHash}`),
    );
    yield* each.next();
  }
}
