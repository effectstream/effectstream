import {
  type AllSyncProtocols,
  type ChainBlock,
  genSyncProtocols,
} from "@effectstream/sync";
import {
  acquireDBMutex,
  createDynamicTables,
  detectCapabilities,
  getConnection,
  getLastNonEmptyBlockHash,
  releaseDBMutex,
  resetPublicTables,
  runSnapshotLoop,
  selectViewStrategy,
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
  call,
  ensure,
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
import {
  createEmptyBlockCoalescer,
  initMergeCoalescingBoundaries,
} from "./coalesce.ts";
import { startHttpServer } from "./api/http-server.ts";
import { recordAppliedBlock } from "./api/apply-status.ts";
import { recordCoalesced } from "./api/stream-status.ts";
import { createBoundedFinalizedStream } from "./finalized-stream.ts";
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
  yield* ensure(function* () {
    yield* call(() => dbConn.end());
  });

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

  // 20× main clock block time (NTP if present, else protocol 0).
  // Falls back to 60 s so coalescing is not silently disabled for chains that
  // don't expose a blockTimeMS on their network config (e.g. Midnight-as-main).
  // Computed before the HTTP server starts because /health uses the same
  // threshold to decide whether the node counts as stalled.
  const ntpConfig = syncInfo.find(s => s.networkType === ConfigNetworkType.NTP);
  const clockBlockTimeMS =
    (ntpConfig?.network as { blockTimeMS?: number } | undefined)?.blockTimeMS ??
    (syncInfo[0]?.network as { blockTimeMS?: number } | undefined)?.blockTimeMS;
  const lagThresholdMs = ENV.EFFECTSTREAM_LAG_THRESHOLD_MS ??
    (clockBlockTimeMS != null ? clockBlockTimeMS * 20 : 60_000);

  yield* spawn(function* () {
    yield* startHttpServer(
      dbConn,
      syncProtocols,
      lagThresholdMs,
      config.apiRouter,
      config.grammar,
    );
  });

  // Bounded hand-off queue between the merge and the apply loop. Backpressure caps
  // the in-memory queue so deep catch-up can't grow it toward the whole backlog
  // (see finalized-stream.ts / sync/CLAUDE.md Finding #1).
  const { stream: finalizedStream, subscription: finalizedBlocks } =
    yield* createBoundedFinalizedStream(ENV.EFFECTSTREAM_FINALIZED_STREAM_CAP);

  yield* spawn(() => startMerge(syncProtocols, finalizedStream));

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
      // `consumed` is counted at the subscription pull point (above), not here, so
      // it reflects the channel depth regardless of how many blocks a run folds.
      recordCoalesced(length);
      recordAppliedBlock(endpoint);
      emitLatestBlocks(
        endpoint.blockNumber,
        endpoint.timestamp,
        getRangesForSyncProtocols(endpoint),
        config.events !== false,
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

    // Owns connection checkout, the per-block DB mutex (PGLite), and
    // transient-pg retry/backoff. App events flush below only after it
    // returns — strictly after the block's COMMIT.
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

    // Fire-and-forget: don't stall the sync loop on broker acks. Ordering is
    // safe without a wrapper queue — Opifex assigns packet IDs synchronously in
    // publish() and net.Socket serializes writes in call order, so MQTT 3.1.1
    // §4.6 in-order delivery holds per (publisher, topic, QoS).
    //
    // TODO(scaling): the broker is in-process, so fan-out shares this event
    // loop. At ~thousands of subscribers, move it to a worker and/or add a
    // publisher-side circuit breaker. Today: localhost, O(10²) subs — non-issue.
    emitLatestBlocks(
      value.blockNumber,
      value.timestamp,
      contentBlocksForProtocol,
      config.events !== false,
    );
    for (const { event, payload } of config.events === false ? [] : blockAppEvents) {
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
 * Publish built-in block-level events. Fire-and-forget like the app-event flush
 * above (don't stall the sync loop; ordering held by Opifex + MQTT 3.1.1).
 * Errors are caught locally so they don't reach the global handler contextless.
 */
function emitLatestBlocks(
  rollUpBlockHeight: number,
  rollUpBlockTimestamp: number,
  syncChains: Record<string, [number, number]>,
  enabled = true,
): void {
  if (!enabled) return;
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
  // `finally` releases the mutex on error/cancellation too; a throw in any step
  // below would otherwise leak it and deadlock every later DB operation.
  try {
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

    const capabilities = yield* until(detectCapabilities(dbConn as any));
    const viewStrategy = selectViewStrategy(capabilities);

    yield* createDynamicTables(
      versionInfo,
      lastBlockHeight,
      dbConn as any, // Client,
      syncProtocols,
      viewStrategy,
    );

    // Seed the merge loop's coalescing boundaries before any block is produced.
    yield* initMergeCoalescingBoundaries(dbConn, lastBlockHeight + 1, config.migrations);

    return syncProtocols;
  } finally {
    releaseDBMutex(`startup-node`);
  }
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
