import type { ChainBlock } from "@effectstream/sync";
import { call, type Operation, until } from "effection";
import type { Pool } from "pg";
import { type BaseStfInput, type EmitFn, primitiveTransitionFunction } from "@effectstream/sm";
import { PreparedQuery } from "@pgtyped/runtime";
import type {
  ExecPromise,
  QueuedUpdate,
  SyncStateUpdateStream,
} from "@effectstream/coroutine";
import {
  blockHeightDone,
  deleteScheduled,
  getFutureGameInputByBlockHeight,
  getFutureGameInputByMaxTimestamp,
  insertGameInputResult,
  removePages,
  saveLastBlock,
} from "@effectstream/db";
import { Buffer } from "node:buffer";
import { ComponentNames, log, SeverityNumber } from "@effectstream/log";
import type { StartConfig } from "./types.ts";
import type { BlockNumber, EffectstreamBlockHash } from "@effectstream/utils";
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
  // DEBUG: tag for tracking which step failed. Reset at start of each step.
  let _debugStep = "init";
  try {
    /* STEP 0: Start the transaction. */
    _debugStep = `BEGIN for block ${value.blockNumber}`;
    yield* until(dbConn.query("BEGIN"));
    const randomGenerator = new Prando(blockHash);

    /* STEP 1: Create a temporal block record */
    _debugStep = `STEP 1 saveLastBlock for block ${value.blockNumber}`;
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
    if (migrations) {
      _debugStep = `STEP 2 applyUserMigrations for block ${value.blockNumber}`;
      yield* applyUserMigrations(
        value.blockNumber,
        dbConn as any, // Client,
        migrations,
      );
    }

    /* STEP 3: Process the primitives. */
    for (const primitive of value.primitives) {
      _debugStep = `STEP 3 primitive for block ${value.blockNumber}`;
      const generator = primitiveTransitionFunction(
        value.blockNumber,
        primitive,
      );
      yield* executeGeneratorStepByStep(generator, dbConn);
    }

    /* STEP 4: Extract the scheduled data. */
    _debugStep = `STEP 4a getFutureGameInputByBlockHeight for block ${value.blockNumber}`;
    const scheduledData1 = yield* call(() =>
      getFutureGameInputByBlockHeight.run({
        block_height: value.blockNumber,
      }, dbConn)
    );
    /* STEP 4.b: Extract the scheduled data by timestamp. */
    _debugStep = `STEP 4b getFutureGameInputByMaxTimestamp for block ${value.blockNumber}`;
    const scheduledData2 = yield* call(() =>
      getFutureGameInputByMaxTimestamp.run({
        max_timestamp: new Date(value.timestamp),
      }, dbConn)
    );

    /* STEP 5: Process the scheduled data in the State Machine. */
    // TODO What should be the order of the scheduled data - per id?
    //
    // De-duplicate by `id`: an input scheduled with both a `future_block_height`
    // matching this block AND a `max_timestamp` matching this block's timestamp
    // will appear in both result sets. Without dedup we run the STF twice for
    // the same input, which (a) wastes work and (b) crashes on the second run
    // when the STF performs INSERT-with-unique-constraint operations (e.g.
    // preorder's launchpad_participations(launchpad, tx_hash, wallet) where
    // tx_hash falls back to `block-${blockHeight}` for both runs).
    const _scheduledMerged = [...scheduledData1, ...scheduledData2];
    const _seenIds = new Set<unknown>();
    const scheduledData = _scheduledMerged.filter((row) => {
      if (_seenIds.has(row.id)) return false;
      _seenIds.add(row.id);
      return true;
    });
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
          _debugStep = `STEP 5 STF for input ${data.id} in block ${value.blockNumber}`;
          yield* executeGeneratorStepByStep(gameSTFGenerator, dbConn);
          // STF succeeded: promote buffered events to the block buffer.
          // Failure path falls through the catch below and `inputEvents`
          // simply goes out of scope.
          if (inputEvents.length > 0) {
            blockEvents.push(...inputEvents);
          }
        } catch (err) {
          success = false;
          // DEBUG: surface to stdout. log.remote routes through tslog/OTel and
          // doesn't always reach the orchestrator stream; we need to see the
          // STF error directly to root-cause issues like the post-COMMIT abort
          // chain (a thrown STF leaves the dbConn transaction poisoned, and
          // the next query in processFinalizedBlock fails with 25P02 instead
          // of the original error).
          console.error(
            `[processFinalizedBlock] STF threw for input ${data.id} block ${value.blockNumber}:`,
            err,
            "\n  input payload:", data.input_data,
          );
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
        _debugStep = `STEP 5 insertGameInputResult for input ${data.id} block ${value.blockNumber}`;
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
        _debugStep = `STEP 5 deleteScheduled for input ${data.id} block ${value.blockNumber}`;
        yield* until(
          deleteScheduled.run({
            id: data.id,
          }, dbConn),
        );
      }
    }

    /* STEP 6: Mark the block as done. */
    _debugStep = `STEP 6 blockHeightDone for block ${value.blockNumber}`;
    yield* call(() =>
      blockHeightDone.run({
        block_hash: Buffer.from(blockHash),
        block_height: value.blockNumber,
      }, dbConn)
    );

    /* STEP 7: Update page state for all sync protocols consumed
    *          This is to mark what blocks where consumed by this specific
    *          block, to avoid re-processing the same blocks more than once
    *          if the sync protocol is restarted.
    */

    // Get latest block for each sync protocol.
    const latestBlocks: Record<string, BlockNumber> = {};
    for (const blockInfo of value.blockInfo) {
      if (
        !latestBlocks[blockInfo.protocol_name] ||
        latestBlocks[blockInfo.protocol_name] < blockInfo.block_number
      ) {
        latestBlocks[blockInfo.protocol_name] = blockInfo.block_number;
      }
    }

    for (const [protocolName, blockNumber] of Object.entries(latestBlocks)) {
      _debugStep = `STEP 7 removePages protocol=${protocolName} for block ${value.blockNumber}`;
      yield* until(
        removePages.run({
          protocol_name: protocolName,
          page_number: blockNumber,
        }, dbConn),
      );
    }

    /* STEP 8: Commit the transaction. */
    _debugStep = `STEP 8 COMMIT for block ${value.blockNumber}`;
    yield* until(dbConn.query("COMMIT"));
  } catch (err) {
    // DEBUG: surface to stdout (log.remote routes via tslog/orchestrator and
    // can be filtered out before we see it). Also include the step tag so we
    // know exactly which query in processFinalizedBlock raised.
    console.error(
      `[processFinalizedBlock] FAILED at: ${_debugStep}`,
      "\n  error:", err,
      "\n  block:", value.blockNumber,
    );
    try {
      yield* until(dbConn.query("ROLLBACK"));
    } catch (rbErr) {
      console.error(`[processFinalizedBlock] ROLLBACK also failed:`, rbErr);
    }
    log.remote(
      ComponentNames.EFFECTSTREAM_SYNC,
      "block-processing",
      SeverityNumber.ERROR,
      (log) =>
        log(`Error processing block ${value.blockNumber} at ${_debugStep}: ${String(err)}`),
    );
    // We cannot recover from this error.
    throw err;
  }
  // Post-COMMIT return: caller (main.ts) flushes `events` to MQTT only after
  // we've returned, guaranteeing read-your-writes for subscribers (I1).
  return { blockHash, events: blockEvents };
}
