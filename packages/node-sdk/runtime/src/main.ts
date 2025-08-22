import {
  type AllSyncProtocols,
  type ChainBlock,
  genSyncProtocols,
} from "@paima/sync";
import {
  acquireDBMutex,
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
import type { PaimaBlockHash } from "@paima/utils";
import { applySystemMigrations } from "./version-migrations.ts";
import { getLastBlockHeight, getVersionInfo } from "@paima/db/version";
import type { SyncProtocolWithNetwork } from "@paima/config";

export function* init() {
  // initialize OpenTelemetry
  yield* initTelemetry();
}

/**
 * Main entry point to start the Paima Engine Node.
 *
 * This will launch the networks/primitives synchronization sub-processes,
 * the HTTP server, and the merge and paima-block generation process.
 *
 * @param config - Paima Engine Node configuration object.
 */
export function* start(config: StartConfig): Operation<void> {
  const { syncInfo } = config;

  const dbConn = getConnection();

  const syncProtocols = yield* startup(dbConn, syncInfo, config);

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
    yield* startHttpServer(
      dbConn,
      syncProtocols,
      config.apiRouter,
      config.grammar,
    );
  });

  const finalizedBlockStream = createChannel<ChainBlock>();

  yield* spawn(() => startMerge(syncProtocols, finalizedBlockStream));

  let blockHash: PaimaBlockHash | null = null;
  for (const value of yield* each(finalizedBlockStream)) {
    // We request a dbClient for a non-shared dbConn object.
    // For PGLite, this is not enough, as the can only be one connection at a time.
    // So we request a DBMutex as well.
    const dbClient: Client = yield* until(dbConn.connect());
    try {
      yield* acquireDBMutex(`processing-blocks:${value.blockNumber}`);
      blockHash = yield* processFinalizedBlock(
        value,
        config,
        dbClient,
        blockHash,
      );
    } finally {
      releaseDBMutex(`processing-blocks:${value.blockNumber}`);
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

function* startup(
  dbConn: Client,
  syncInfo: SyncProtocolWithNetwork[],
  config: StartConfig,
): Operation<AllSyncProtocols[]> {
  const versionInfo = yield* getVersionInfo(dbConn);
  const lastBlockHeight = yield* getLastBlockHeight(versionInfo, dbConn);

  yield* acquireDBMutex(`startup-node`);

  // When the node is started, we apply system migrations.
  // Either system initial migrations, or migrations given a Paima Engine Update.
  yield* applySystemMigrations(
    config.appVersion,
    versionInfo,
    lastBlockHeight,
    dbConn,
    config.migrationRouter,
  );

  const syncProtocols = yield* genSyncProtocols(dbConn, syncInfo);

  yield* createDynamicTables(
    versionInfo,
    lastBlockHeight,
    dbConn,
    syncProtocols,
  );

  releaseDBMutex(`startup-node`);
  return syncProtocols;
}
