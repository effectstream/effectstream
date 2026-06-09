import {
  type AllSyncProtocols,
  type ChainBlock,
  genSyncProtocols,
} from "@effectstream/sync";
import {
  acquireDBMutex,
  createDynamicTables,
  getConnection,
  getLastNonEmptyBlockHash,
  releaseDBMutex,
  resetPublicTables,
  runSnapshotLoop,
} from "@effectstream/db";
import { EventBroker } from "@effectstream/event-server";
import { ENV } from "@effectstream/utils/node-env";
import {
  BuiltinEvents,
  EventManager,
} from "@effectstream/event-client";
import { startMerge, startSync } from "@effectstream/sync";
import { ComponentNames, log, SeverityNumber } from "@effectstream/log";
import {
  createChannel,
  type Operation,
  sleep,
  spawn,
  until,
} from "effection";
import { initTelemetry } from "./telemetry.ts";
import {
  type PendingEvent,
  processFinalizedBlockWithRetry,
} from "./process-blocks.ts";
import { createEmptyBlockCoalescer } from "./coalesce.ts";
import { startHttpServer } from "./api/http-server.ts";
import { recordAppliedBlock } from "./api/apply-status.ts";
import type { StartConfig } from "./types.ts";
import type { Client } from "pg";
import type { EffectstreamBlockHash } from "@effectstream/utils";
import { applySystemMigrations } from "./version-migrations.ts";
import { getLastBlockHeight, getVersionInfo } from "@effectstream/db/version";
import { ConfigNetworkType, usePaimaStaticConfig } from "@effectstream/config";
import type { SecurityNamespace, SyncProtocolWithNetwork } from "@effectstream/config";
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

  // Test-only: surface live sync protocols (e.g. for buffer-size assertions).
  config.dev?.onStarted?.({ syncProtocols });

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
  if (ENV.MQTT_BROKER) {
    new EventBroker("effectstream-engine").createServer();
  }

  yield* spawn(function* () {
    yield* startHttpServer(
      dbConn,
      syncProtocols,
      config.apiRouter,
      config.grammar,
    );
  });

  // 10× main clock block time (NTP if present, else protocol 0). Undefined disables lag gating.
  const ntpConfig = syncInfo.find(s => s.networkType === ConfigNetworkType.NTP);
  const clockBlockTimeMS =
    (ntpConfig?.network as { blockTimeMS?: number } | undefined)?.blockTimeMS ??
    (syncInfo[0]?.network as { blockTimeMS?: number } | undefined)?.blockTimeMS;
  const lagThresholdMs = clockBlockTimeMS != null ? clockBlockTimeMS * 10 : undefined;

  const finalizedBlockStream = createChannel<ChainBlock>();

  // Subscribe BEFORE spawning the merge: effection channels drop sends with no
  // active subscriber, so a fast restart (in-memory state, no RPC wait) could
  // emit blocks before we subscribe and silently stall at the pre-restart height.
  const finalizedBlocks = yield* finalizedBlockStream;
  // NOTE: this subscriber's queue is unbounded. During deep catch-up the merge
  // can outpace the per-block processing below and grow it without bound — the
  // downstream side of the Fix C backpressure issue (see sync/CLAUDE.md).

  yield* spawn(() => startMerge(syncProtocols, finalizedBlockStream));

  const heartbeatIntervalMs = 60_000;
  yield* spawn(function* () {
    while (true) {
      yield* sleep(heartbeatIntervalMs);
      const now = Date.now();
      const status = syncProtocols.map((p) => {
        const page = p.lastPage;
        if (page == null) return `${p.name}: waiting for first sync`;
        const ageMs = now - (page.root as number);
        let line = `${p.name}: block ${page.ownBlockNumber} | buf ${p.bufferedData.size()} | age ${(ageMs / 1000).toFixed(1)}s`;
        if (p.consecutiveErrors > 0) {
          const sinceLast = p.lastErrorTimestamp > 0
            ? ` ${((now - p.lastErrorTimestamp) / 1000).toFixed(0)}s ago`
            : "";
          line += ` | ERRORS: ${p.consecutiveErrors}${sinceLast}`;
        } else if (p.lastSuccessfulFetchMs > 0) {
          const idleMs = now - p.lastSuccessfulFetchMs;
          if (idleMs > heartbeatIntervalMs * 2) {
            line += ` | IDLE: ${(idleMs / 1000).toFixed(0)}s`;
          }
        }
        return line;
      });
      log.local(
        ComponentNames.EFFECTSTREAM_SYNC,
        "heartbeat",
        SeverityNumber.INFO,
        (l) => l(status.join(" | ")),
      );
    }
  });

  const [lastHashRow] = yield* until(getLastNonEmptyBlockHash.run(undefined, dbConn));
  let blockHash: EffectstreamBlockHash | null = lastHashRow
    ? lastHashRow.effectstream_block_hash!.toString() as EffectstreamBlockHash
    : null;
  if (config.snapshotConfig) {
    yield* spawn(() => runSnapshotLoop(config.snapshotConfig!));
  }

  const coalescer = createEmptyBlockCoalescer({
    enabled: ENV.EFFECTSTREAM_COALESCE_EMPTY_BLOCKS,
    subscription: finalizedBlocks,
    pool: dbConn as any, // Pool,
    migrations: config.migrations,
    lagThresholdMs,
    getPreviousBlockHash: () => blockHash,
    onFlush: (endpoint, length) => {
      recordAppliedBlock(endpoint);
      emitLatestBlocks(
        endpoint.blockNumber,
        endpoint.timestamp,
        getRangesForSyncProtocols(endpoint),
      );
      log.local(
        ComponentNames.EFFECTSTREAM_SYNC,
        "block-merge",
        SeverityNumber.INFO,
        (l) =>
          l(
            `coalesced ${length} empty block(s) → block ${endpoint.blockNumber}`,
          ),
      );
    },
  });

  while (true) {
    const value = yield* coalescer.advance();
    if (value === undefined) break;

    // processFinalizedBlockWithRetry owns connection checkout, the per-block
    // DB mutex (PGLite), and transient-pg retry/backoff. App events it
    // collects are flushed below ONLY after it returns — i.e. strictly after
    // the block's COMMIT.
    const result = yield* processFinalizedBlockWithRetry(
      value,
      config,
      dbConn as any, // Pool,
      blockHash,
    );
    const blockAppEvents: PendingEvent[] = result.events;
    if (result.blockHash !== "0x0") {
      blockHash = result.blockHash;
    }

    recordAppliedBlock(value); // apply-stage liveness for /debug/metrics

    // Used to emit & log the block range for each protocol.
    const contentBlocksForProtocol = getRangesForSyncProtocols(value);

    // Fire-and-forget: do not stall the sync loop on broker acks.
    //
    // Opifex's TcpClient assigns packet IDs synchronously in client.publish()
    // and writes to the socket via Node's net.Socket, which has its own write
    // queue — so concurrent publish() calls land on the wire in call order.
    // MQTT 3.1.1 §4.6 then guarantees in-order delivery to each subscriber
    // per (publisher, topic, QoS). We don't need a wrapper queue.
    //
    // TODO(scaling): the broker runs in-process (see `new EventBroker(...)`
    // above). Fan-out to N subscribers consumes the same event loop as block
    // processing. At ~thousands of subscribers, consider:
    //   1) moving the broker to a worker / separate process,
    //   2) a publisher-side circuit breaker if ctx.unresolvedPublish.size > N
    //      (drop events with a counter for observability).
    // Today: localhost, in-process, expected O(10²) subscribers — non-issue.
    emitLatestBlocks(
      value.blockNumber,
      value.timestamp,
      contentBlocksForProtocol,
    );
    for (const { event, payload } of blockAppEvents) {
      EventManager.Instance.sendMessage(event, payload as any).catch((err) => {
        log.local(
          ComponentNames.EFFECTSTREAM_RUNTIME,
          "event-publish",
          SeverityNumber.WARN,
          (l) =>
            l(`publish ${event.path.join("/")} failed: ${String(err)}`),
        );
      });
    }

    const lagMs = Date.now() - value.timestamp;
    const lagSuffix = lagThresholdMs != null && lagMs > lagThresholdMs
      ? ` | lag: ${(lagMs / 1000).toFixed(1)}s`
      : "";
    log.local(
      ComponentNames.EFFECTSTREAM_SYNC,
      "block-merge",
      SeverityNumber.INFO,
      (log) =>
        log(
          `finalized block ${value.blockNumber} @ ${
            blockHash?.slice(0, 8)
          }...${lagSuffix} | ${JSON.stringify(contentBlocksForProtocol)}`,
        ),
    );
    if (config.dev?.applyDelayMs) yield* sleep(config.dev.applyDelayMs);
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

/**
 * Publish built-in block-level events.
 *
 * Fire-and-forget for the same reasons as the app-event flush above
 * (do not stall the sync loop; ordering preserved by Opifex + MQTT 3.1.1).
 *
 * Errors are caught locally so they don't escape to the global
 * `unhandledrejection` handler without context.
 */
function emitLatestBlocks(
  rollUpBlockHeight: number,
  rollUpBlockTimestamp: number,
  syncChains: Record<string, [number, number]>,
): void {
  const logFailure = (topic: string) => (err: unknown) =>
    log.local(
      ComponentNames.EFFECTSTREAM_RUNTIME,
      "event-publish",
      SeverityNumber.WARN,
      (l) => l(`publish ${topic} failed: ${String(err)}`),
    );

  EventManager.Instance.sendMessage(BuiltinEvents.RollupBlock, {
    block: rollUpBlockHeight,
    timestamp: rollUpBlockTimestamp,
  }).catch(logFailure("RollupBlock"));

  for (const [chainName, [_, toBlock]] of Object.entries(syncChains)) {
    EventManager.Instance.sendMessage(BuiltinEvents.SyncChains, {
      chain: chainName,
      block: toBlock,
      rollup: rollUpBlockHeight,
    }).catch(logFailure(`SyncChains/${chainName}`));
  }
}

function* startup(
  dbConn: Client,
  syncInfo: SyncProtocolWithNetwork[],
  config: StartConfig,
): Operation<AllSyncProtocols[]> {
  const versionInfo = yield* getVersionInfo(dbConn);
  const lastBlockHeight = yield* getLastBlockHeight(versionInfo, dbConn);
  // Pull the security namespace from the static config so primitives that
  // re-verify batched signatures can access it synchronously.
  const staticConfig = yield* usePaimaStaticConfig();
  // Create Runtime Primitives Instances
  syncInfo.forEach((syncProtocol) => {
    syncProtocol.primitives.forEach((primitive, primitiveIndex) => {
      processPrimitives(
        syncProtocol.primitives,
        primitiveIndex,
        staticConfig.securityNamespace,
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
  securityNamespace: SecurityNamespace | undefined,
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
      securityNamespace,
    }
    if (isBuiltInPrimitive) {
      p = new builtInPrimitivesMap[primitiveType as keyof typeof builtInPrimitivesMap](classConfig as any) ;
    } else if (isUserDefinedPrimitive) {
      p = new userDefinedPrimitives[primitiveType as keyof typeof userDefinedPrimitives](classConfig);
    }
    // Update the primitive with the final configuration
    primitives[primitiveIndex].primitive = p.getConfig();
}