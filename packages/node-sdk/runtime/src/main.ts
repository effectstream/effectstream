import {
  type AllSyncProtocols,
  type ChainBlock,
  genSyncProtocols,
} from "@effectstream/sync";
import {
  acquireDBMutex,
  createDynamicTables,
  getConnection,
  releaseDBMutex,
  resetPublicTables,
} from "@effectstream/db";
import { PaimaEventBroker } from "@effectstream/event-server";
import {
  BuiltinEvents,
  PaimaEventManager,
} from "@effectstream/event-client";
import { startMerge, startSync } from "@effectstream/sync";
import { ComponentNames, log, SeverityNumber } from "@effectstream/log";
import {
  createChannel,
  each,
  type Operation,
  spawn,
  until,
} from "effection";
import { initTelemetry } from "./telemetry.ts";
import { processFinalizedBlock } from "./process-blocks.ts";
import { startHttpServer } from "./api/http-server.ts";
import type { StartConfig } from "./types.ts";
import type { Client } from "pg";
import type { PaimaBlockHash } from "@effectstream/utils";
import { applySystemMigrations } from "./version-migrations.ts";
import { getLastBlockHeight, getVersionInfo } from "@effectstream/db/version";
import type { SyncProtocolWithNetwork } from "@effectstream/config";
import { builtInPrimitivesMap } from "@effectstream/sm";
import { validateAndSnapshotConfig } from "./config-snapshot.ts";

export function* init() {
  // initialize OpenTelemetry
  yield* initTelemetry();
}

/**
 * Main entry point to start the Paima Engine Node.
 *
 * This will launch the networks/primitives synchronization sub-processes,
 * the HTTP server, and the merge and effectstream-block generation process.
 *
 * @param config - Paima Engine Node configuration object.
 */
export function* start(config: StartConfig): Operation<void> {
  const { syncInfo } = config;

  const dbConn = getConnection();

  const syncProtocols = yield* startup(dbConn as any, // Client,
    syncInfo, config);

  log.remote(
    ComponentNames.EFFECTSTREAM_RUNTIME,
    [],
    SeverityNumber.INFO,
    (log) => log("start sync", syncProtocols.map(p => p.name)),
  );
  for (const syncProtocol of syncProtocols) {
    yield* startSync(syncProtocol);
  }

  // Create MQTT Broker
  new PaimaEventBroker("effectstream-engine").createServer();

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
    let dbClient: Client | undefined;
    try {
      yield* acquireDBMutex(`processing-blocks:${value.blockNumber}`);
      dbClient = yield* until((dbConn as any).connect()); // Client,

      blockHash = yield* processFinalizedBlock(
        value,
        config,
        dbClient as any, // Client,
        blockHash,
      );
    } finally {
      releaseDBMutex(`processing-blocks:${value.blockNumber}`);
      if (dbClient) {
        (dbClient as any).release(); // Client,
      }
    }

    // Used to emit & log the block range for each protocol.
    const contentBlocksForProtocol = getRangesForSyncProtocols(value);
  
    yield* until(
      emitLatestBlocks(
        value.blockNumber,
        value.timestamp,
        contentBlocksForProtocol,
      ),
    );

    log.local(
      ComponentNames.EFFECTSTREAM_SYNC,
      "block-merge",
      SeverityNumber.INFO,
      (log) =>
        log(
          `finalized block ${value.blockNumber} @ ${
            blockHash?.slice(0, 8)
          }... | ${JSON.stringify(contentBlocksForProtocol)}`,
        ),
    );
    yield* each.next();
  }
}

function getRangesForSyncProtocols(value: ChainBlock): Record<string, [number, number]> {
  const contentBlocksForProtocol: Record<string, [number, number]> = {};
  for (const block of value.blockInfo) {
    if (!contentBlocksForProtocol[block.protocol_name]) {
      contentBlocksForProtocol[block.protocol_name] = [block.block_number, block.block_number];
    }
    contentBlocksForProtocol[block.protocol_name] = [
      Math.min(contentBlocksForProtocol[block.protocol_name][0], block.block_number),
      Math.max(contentBlocksForProtocol[block.protocol_name][1], block.block_number),
    ];
  }
  return contentBlocksForProtocol;
}

async function emitLatestBlocks(
  rollUpBlockHeight: number,
  rollUpBlockTimestamp: number,
  syncChains: Record<string, [number, number]>,
) {
  return await Promise.all([
    PaimaEventManager.Instance.sendMessage(BuiltinEvents.RollupBlock, {
      block: rollUpBlockHeight,
      timestamp: rollUpBlockTimestamp,
    }),
    ...Object.entries(syncChains).map(([chainName, [_, toBlock]]) =>
      PaimaEventManager.Instance.sendMessage(BuiltinEvents.SyncChains, {
        chain: chainName,
        block: toBlock,
        rollup: rollUpBlockHeight
      })
    ),
  ]);
}

function* startup(
  dbConn: Client,
  syncInfo: SyncProtocolWithNetwork[],
  config: StartConfig,
): Operation<AllSyncProtocols[]> {
  const versionInfo = yield* getVersionInfo(dbConn);
  const lastBlockHeight = yield* getLastBlockHeight(versionInfo, dbConn);
  // Create Runtime Primitives Instances
  syncInfo.forEach((syncProtocol) => {
    syncProtocol.primitives.forEach((primitive, primitiveIndex) => {
      processPrimitives(
        syncProtocol.primitives,
        primitiveIndex,
        config.userDefinedPrimitives
      );
    });
  });

  
  yield* acquireDBMutex(`startup-node`);

  // Dev-only reset of user-owned public tables
  if (config.dev?.resetPublicData) {
    yield* resetPublicTables(dbConn as any); // Client,
  }

  // When the node is started, we apply system migrations.
  // Either system initial migrations, or migrations given a Paima Engine Update.
  yield* applySystemMigrations(
    config.appVersion,
    versionInfo,
    lastBlockHeight,
    dbConn,
    config.migrations,
  );

  // Validate that immutable config fields (e.g. NTP startTime, startBlockHeight)
  // have not changed since the last run. Persists a snapshot on first start.
  // Must run after system migrations so the snapshot table exists.
  yield* validateAndSnapshotConfig(syncInfo, dbConn);

  const syncProtocols = yield* genSyncProtocols(dbConn as any, // Client,
    syncInfo);

  yield* createDynamicTables(
    versionInfo,
    lastBlockHeight,
    dbConn as any, // Client,
    syncProtocols,
  );

  releaseDBMutex(`startup-node`);
  return syncProtocols;
}

// Convert the primitive config to the final primitive instance
const processPrimitives = (
  primitives: {primitive: any, id: string}[],
  primitiveIndex: number,
  userDefinedPrimitives?: Record<string, any>,
) => {
    const primitiveType = primitives[primitiveIndex].primitive.type;
    const primitiveUniqueName = primitives[primitiveIndex].id;
    const primitiveConfig = primitives[primitiveIndex].primitive;
    const isBuiltInPrimitive = primitiveType in builtInPrimitivesMap;
    const isUserDefinedPrimitive = userDefinedPrimitives && primitiveType in userDefinedPrimitives;
    if (isBuiltInPrimitive && isUserDefinedPrimitive) {
      throw new Error(`User defined primitive cannot have the same name as a built-in primitive.
                       Built-in values: ${Object.keys(builtInPrimitivesMap).join(", ")}`);
    }
    if (!isBuiltInPrimitive && !isUserDefinedPrimitive) {
      throw new Error(`PrimitiveUniqueName "${primitiveUniqueName}" is not built-in and not user-defined.
                       Available values: ${Object.keys([
                        ...Object.keys(builtInPrimitivesMap),
                        ...Object.keys(userDefinedPrimitives || {}),
                      ]).join(", ")}`);
    }
    let p = null;
    const classConfig = {
      ...primitiveConfig,
      instanceName: primitiveUniqueName,
    }
    if (isBuiltInPrimitive) {
      p = new builtInPrimitivesMap[primitiveType as keyof typeof builtInPrimitivesMap](classConfig as any) ;
    } else if (isUserDefinedPrimitive) {
      p = new userDefinedPrimitives[primitiveType as keyof typeof userDefinedPrimitives](classConfig);
    }
    // Update the primitive with the final configuration
    primitives[primitiveIndex].primitive = p.getConfig();
}