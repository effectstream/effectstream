import type { ChainBlock } from "@effectstream/sync";
import { call, type Operation, sleep, until } from "effection";
import type { Pool, PoolClient } from "pg";
import { type BaseStfInput, type EmitFn, primitiveTransitionFunction } from "@effectstream/sm";
import { PreparedQuery } from "@pgtyped/runtime";
import type {
  ExecPromise,
  QueuedUpdate,
  SyncStateUpdateStream,
} from "@effectstream/coroutine";
import {
  acquireDBMutex,
  blockHeightDone,
  deleteEmptyBlocks,
  deleteScheduled,
  getFutureGameInputByBlockHeight,
  getFutureGameInputByMaxTimestamp,
  insertGameInputResult,
  isTransientPgError,
  poolErrors,
  releaseDBMutex,
  removePages,
  saveLastBlock,
  upsertPage,
} from "@effectstream/db";
import { Buffer } from "node:buffer";
import { ComponentNames, log, SeverityNumber } from "@effectstream/log";
import type { StartConfig } from "./types.ts";
import type { EffectstreamBlockHash } from "@effectstream/utils";
import { generateEffectstreamBlockHash, Prando } from "@effectstream/crypto";
import { applyUserMigrations } from "./version-migrations.ts";
import type { EventPathAndDef } from "@effectstream/event-client";

/**
 * A pending app event collected during STF execution, flushed to MQTT by
 * the caller (main.ts) only after the block-level `COMMIT` succeeds.
 *
 * See plan invariants I1 (post-COMMIT delivery) and I2 (rollback drops events)
 * in /Users/edwardalvarado/.claude/plans/wild-kindling-reddy.md.
 */
export type PendingEvent = {
  event: EventPathAndDef;
  payload: Record<string, unknown>;
};

export type ProcessFinalizedBlockResult = {
  blockHash: EffectstreamBlockHash;
  events: PendingEvent[];
};

/** Helper to check if a SyncStateUpdateStream object is a WorldResolve */
function isWorldResolve(value: any): value is QueuedUpdate {
  return value && Array.isArray(value);
}
/** Helper to check if a SyncStateUpdateStream object is a promise */
function isPromise(value: any): value is ExecPromise<any> {
  return value && typeof value === "object" && "promise" in value;
}

/**
 * We need to process all the SQL calls of an STF update in an all-or-nothing manner
 * STF updates can fail (since the data for them comes from arbitrary onchain data)
 * But we can't allow a single user's bad transaction to DOS the game for everybody else
 * So failures should be isolated to just the specific input, and not the full block
 * (recall: without this, in pgsql, if a query fails during a db transaction, the entire dbTx becomes invalid)
 */
async function tryOrRollback<T>(
  dbTx: Pool,
  func: () => Promise<T>,
): Promise<{ status: "success" | "error"; value: T | undefined }> {
  const checkpointName = `game_state_transition`;
  await dbTx.query(`SAVEPOINT ${checkpointName}`);
  try {
    const value = await func();
    return { status: "success", value };
  } catch (err) {
    await dbTx.query(`ROLLBACK TO SAVEPOINT ${checkpointName}`);
    log.remote(
      ComponentNames.EFFECTSTREAM_SYNC,
      "block-processing",
      SeverityNumber.INFO,
      (log) =>
        log(`Database error on ${checkpointName}. Rolling back.` + String(err)),
    );
    return { status: "error", value: undefined };
  } finally {
    await dbTx.query(`RELEASE SAVEPOINT ${checkpointName}`);
  }
}

/**
 * This function is used to execute a generator step by step.
 * Each step returns either a Query or a StateMachineExecution.
 * The results are processed, then the generator is resumed.
 */
function* executeGeneratorStepByStep(
  generator: SyncStateUpdateStream<void>,
  dbConn: Pool,
): Operation<any> {
  let result = generator.next();

  // NOTE: sync generators cannot execute promises
  //       so we pause the execution, and resolve them here.
  // NOTE: there are 2 types of operations we need to handle
  //       1. state machine executions, these return a series of queries to run.
  //       2. generic promises required in the primitives (e.g., verifySignature)
  while (!result.done) {
    // We resolve the generators promises here.
    // As generators cannot execute promises.
    const operations: unknown[] = [];
    const value = result.value;

    if (isWorldResolve(value)) {
      const [queryIR, params] = value;
      const query = new PreparedQuery(queryIR);
      const queryResult = yield* call(() => query.run(params, dbConn));
      operations.push(queryResult);
    } else if (isPromise(value)) {
      // This means that we have non-database promises in the generator.
      // Each time yield is called, we catch the intention and resolve it.
      const queryResult = yield* until(value.promise);
      // We wrap the result, but it will be flattened by the generator.
      operations.push([queryResult]);
    } else {
      console.error("Yielding unhandled type", result);
      throw new Error("Unhandled type in generator");
    }
    result = generator.next(operations.flat());
  }
  return result.value;
}

/**
 * This function is the main entry point for processing a produced block.
 * It is called when a block can be processed and finalized.
 * It runs the entire pipeline in a transaction, with sub-transactions for each StateMachineExecution.
 *
 * Process Order:
 * 1. Create a temporal block record
 * 2. Process the migrations for this block height
 * 4. Extract the scheduled data from the primitives in the block
 * 4. Process the scheduled data for this block height, and time
 * 5. Mark the block as done, and add the hash.
 * 6. Commit the transaction
 *
 * IMPORTANT: This function must receive a non-shared dbConn object.
 *            as it will be used in a transaction.
 */
export function* processFinalizedBlock(
  value: ChainBlock,
  config: StartConfig,
  dbConn: Pool,
  previousBlockHash: EffectstreamBlockHash | null,
): Operation<ProcessFinalizedBlockResult> {
  const { gameStateTransitions, migrations } = config;
  const blockHash: EffectstreamBlockHash = generateEffectstreamBlockHash(
    value,
    previousBlockHash,
  );
  // Per-block event buffer. Only events from STF runs that succeeded
  // (and survived to the post-COMMIT return) end up here. On block-level
  // ROLLBACK below, this buffer goes out of scope unflushed.
  const blockEvents: PendingEvent[] = [];
  let hasOperations = false;
  try {
    /* STEP 0: Start the transaction. */
    yield* until(dbConn.query("BEGIN"));
    const randomGenerator = new Prando(blockHash);

    /* STEP 1: Create a temporal block record */
    yield* call(() =>
      saveLastBlock.run({
        // TODO: Check these values
        block_height: value.blockNumber,
        ver: 0,
        main_chain_block_hash: Buffer.from(value.blockNumber.toString()),
        seed: randomGenerator.seed.toString(),
        ms_timestamp: new Date(value.timestamp),
      }, dbConn)
    );

    /* STEP 2: Process the migrations. */
    let hasMigrations = false;
    if (migrations) {
      hasMigrations = yield* applyUserMigrations(
        value.blockNumber,
        dbConn as any, // Client,
        migrations,
      );
    }

    /* STEP 3: Process the primitives. */
    for (const primitive of value.primitives) {
      const generator = primitiveTransitionFunction(
        value.blockNumber,
        primitive,
      );
      yield* executeGeneratorStepByStep(generator, dbConn);
    }

    /* STEP 4: Extract the scheduled data. */
    const scheduledData1 = yield* call(() =>
      getFutureGameInputByBlockHeight.run({
        block_height: value.blockNumber,
      }, dbConn)
    );
    /* STEP 4.b: Extract the scheduled data by timestamp. */
    const scheduledData2 = yield* call(() =>
      getFutureGameInputByMaxTimestamp.run({
        max_timestamp: new Date(value.timestamp),
      }, dbConn)
    );

    /* STEP 5: Process the scheduled data in the State Machine. */
    // TODO What should be the order of the scheduled data - per id?
    const scheduledData = [...scheduledData1, ...scheduledData2];
    let index_in_block = 0;

    if (gameStateTransitions && scheduledData.length > 0) {
      randomGenerator.skip();
      for (const data of scheduledData) {
        let success = true;
        // Per-input event buffer. If the STF throws below, this buffer is
        // dropped (events from rolled-back inputs never reach MQTT — I2).
        // On success, we promote into `blockEvents` after the catch block.
        const inputEvents: PendingEvent[] = [];
        const emit: EmitFn = (event, payload) => {
          inputEvents.push({
            event,
            // Auto-inject blockHeight (I5). registerEvents prepends it as the
            // first indexed field; apps never set it themselves.
            payload: { ...payload, blockHeight: value.blockNumber },
          });
        };
        try {
          const input: BaseStfInput = {
            blockTimestamp: value.timestamp,
            blockHeight: value.blockNumber,
            conciseInput: data.input_data,
            signerAddress: data.from_address,
            signerAddressType: data.from_address_type,
            randomGenerator,
            emit,
            // TODO: We might want to add this to the scheduled data.
            //
            //      Or do we resolve it here. Account might change.
            //      Should we preserve the original accountId or the signer's
            //      current accountId?
            accountId: undefined, // data.accountId,
          };
          const gameSTFGenerator = gameStateTransitions(
            value.blockNumber,
            input,
          );
          yield* executeGeneratorStepByStep(gameSTFGenerator, dbConn);
          // STF succeeded: promote buffered events to the block buffer.
          // Failure path falls through the catch below and `inputEvents`
          // simply goes out of scope.
          if (inputEvents.length > 0) {
            blockEvents.push(...inputEvents);
          }
        } catch (err) {
          if (isTransientPgError(err)) throw err;
          success = false;
          log.remote(
            ComponentNames.EFFECTSTREAM_SYNC,
            "block-processing",
            SeverityNumber.ERROR,
            (log) =>
              log(
                `Error processing block ${value.blockNumber}: ${
                  String(err)
                }. Payload: ${JSON.stringify(data)}`,
              ),
          );
        }
        const conciseInputHash = `0x${
          Array(64).fill(0).map(() =>
            Math.floor(Math.random() * 16).toString(16)
          )
            .join("")
        }`;
        yield* until(
          insertGameInputResult.run({
            id: data.id,
            success,
            effectstream_tx_hash: Buffer.from(conciseInputHash),
            index_in_block,
            block_height: value.blockNumber,
          }, dbConn),
        );
        index_in_block++;

        // Remove the scheduled data from the database.
        yield* until(
          deleteScheduled.run({
            id: data.id,
          }, dbConn),
        );
      }
    }

    /* STEP 6: Mark the block as done. */
    hasOperations = hasMigrations ||
      value.primitives.length > 0 ||
      scheduledData.length > 0;
    if (!hasOperations) {
      yield* call(() => deleteEmptyBlocks.run(undefined, dbConn));
    }
    yield* call(() =>
      blockHeightDone.run({
        block_hash: Buffer.from(hasOperations ? blockHash : "0x0"),
        block_height: value.blockNumber,
      }, dbConn)
    );

    /* STEP 7: Persist the block-accurate resume marker per protocol, inside this
    *          block's transaction (the runtime is the sole writer of the resume
    *          position). Upsert at page_number = ownBlockNumber, then prune
    *          everything below → one row per protocol = the committed watermark.
    *          Full mechanism: @effectstream/sync CLAUDE.md, design idea #5.
    */
    for (const { protocol_name, lastPage } of value.resumePages) {
      yield* until(
        upsertPage.run({
          protocol_name,
          page_number: lastPage.ownBlockNumber,
          page: JSON.stringify(lastPage),
        }, dbConn),
      );
      yield* until(
        removePages.run({
          protocol_name,
          page_number: lastPage.ownBlockNumber,
        }, dbConn),
      );
    }

    /* STEP 8: Commit the transaction. */
    yield* until(dbConn.query("COMMIT"));
    // A successful COMMIT proves the DB is reachable end-to-end — reset the
    // pool failure clock so the write path also feeds the health tracker
    // (it otherwise only sees floating pool errors and the read-side API).
    poolErrors.markHealthy();
  } catch (err) {
    // Best-effort rollback. If the socket is dead the ROLLBACK throws too;
    // swallow that so it doesn't mask the original error — the caller's retry
    // loop keys off the original (transient) error, not a rollback failure.
    try {
      yield* until(dbConn.query("ROLLBACK"));
    } catch (rollbackErr) {
      log.remote(
        ComponentNames.EFFECTSTREAM_SYNC,
        "block-processing",
        SeverityNumber.WARN,
        (log) =>
          log(
            `ROLLBACK failed for block ${value.blockNumber} (connection likely dead): ${
              String(rollbackErr)
            }`,
          ),
      );
    }
    log.remote(
      ComponentNames.EFFECTSTREAM_SYNC,
      "block-processing",
      SeverityNumber.ERROR,
      (log) =>
        log(`Error processing block ${value.blockNumber}: ${String(err)}`),
    );
    // Re-throw: `processFinalizedBlockWithRetry` decides whether this is a
    // retryable transient pg failure or a fatal bug.
    throw err;
  }

  return {
    blockHash: hasOperations ? blockHash : "0x0" as PaimaBlockHash,
    events: blockEvents
  };
}

/** Caps the exponential backoff between block-retry attempts. */
const MAX_RETRY_BACKOFF_MS = 5_000;

/**
 * Run {@link processFinalizedBlock} against a freshly checked-out pool client,
 * retrying the whole block on transient pg failures (Neon cold-starts,
 * idle-socket evictions, TLS blips).
 *
 * The previous socket is dead after such a failure, so each attempt
 * re-acquires a client and reprocesses the block from `BEGIN` — safe because
 * the failed tx never committed and the caller only advances the block stream
 * after this returns.
 *
 * `poolErrors` governs escalation: it logs WARN→ERROR as the outage persists
 * and calls `process.exit(1)` once it crosses the fatal threshold, letting the
 * orchestrator restart us. A non-transient error (a real SQL/logic bug) is
 * re-thrown and crashes, as before.
 *
 * Owns the per-block DB mutex (for PGLite) and client lifecycle so the caller
 * doesn't have to.
 */
export function* processFinalizedBlockWithRetry(
  value: ChainBlock,
  config: StartConfig,
  pool: Pool,
  previousBlockHash: EffectstreamBlockHash | null,
): Operation<ProcessFinalizedBlockResult> {
  const lockName = `processing-blocks:${value.blockNumber}`;
  let attempt = 0;
  while (true) {
    let dbClient: PoolClient | undefined;
    let checkout: Promise<PoolClient> | undefined;
    let transientErr: unknown;
    try {
      yield* acquireDBMutex(lockName);
      checkout = pool.connect();
      dbClient = yield* until(checkout);
      return yield* processFinalizedBlock(
        value,
        config,
        dbClient as unknown as Pool, // a checked-out client, used as the tx conn
        previousBlockHash,
      );
    } catch (err) {
      if (!isTransientPgError(err)) throw err;
      transientErr = err;
    } finally {
      releaseDBMutex(lockName);
      if (dbClient) {
        // Passing the error destroys the client instead of recycling it, so
        // the pool never hands the dead socket back out. On success
        // `transientErr` is undefined and the client returns to the pool.
        try {
          dbClient.release(transientErr as Error | undefined);
        } catch {
          /* already released/destroyed */
        }
      } else if (checkout) {
        // Cancellation won the race with the checkout. `until` abandons the
        // promise, but the pool still hands the client over afterwards and
        // nobody is left in this scope to give it back — a leaked client keeps
        // the pool one connection short and blocks `pool.end()` forever.
        void checkout.then(
          (client) => {
            try {
              client.release();
            } catch {
              /* already released/destroyed */
            }
          },
          () => {
            /* the checkout itself failed; nothing to return */
          },
        );
      }
    }

    attempt++;
    poolErrors.log(transientErr, ["sync-write"]);
    const backoffMs = Math.min(500 * 2 ** (attempt - 1), MAX_RETRY_BACKOFF_MS);
    log.local(
      ComponentNames.EFFECTSTREAM_SYNC,
      "block-processing",
      SeverityNumber.WARN,
      (l) =>
        l(
          `transient db error on block ${value.blockNumber}; retry #${attempt} in ${backoffMs}ms: ${
            String(transientErr)
          }`,
        ),
    );
    yield* sleep(backoffMs);
  }
}
