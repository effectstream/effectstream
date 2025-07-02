import type { ChainBlock } from "@paima/sync";
import type { AppEvents } from "@paima/sm";
import { call, type Operation, until } from "effection";
import type { Pool } from "pg";
import {
  type BaseStfInput,
  type BaseStfOutput,
  primitiveTransitionFunction,
} from "@paima/sm";
import { PreparedQuery } from "npm:@pgtyped/runtime";
import type {
  QueuedUpdate,
  STMExecPromise,
  SyncStateUpdateStream,
} from "@paima/coroutine";
import { blockHeightDone, saveLastBlock } from "@paima/db";
import { Buffer } from "node:buffer";
import { ComponentNames, log, SeverityNumber } from "@paima/log";

/** Helper to check if a SyncStateUpdateStream object is a StateMachineExecution */
function isStateMachineExecution(value: any): value is STMExecPromise {
  return value && typeof value === "object" && value.type === "stm-promise";
}

/** Helper to check if a SyncStateUpdateStream object is a WorldResolve */
function isWorldResolve(value: any): value is QueuedUpdate {
  return value && Array.isArray(value);
}

/**
 * We need to process all the SQL calls of an STF update in an all-or-nothing manner
 * STF updates can fail (since the data for them comes from arbitrary onchain data)
 * But we can't allow a single user's bad transaction to DOS the game for everybody else
 * So failures should be isolated to just the specific input, and not the full block
 * (recall: without this, in psql, if a query fails during a db transaction, the entire dbTx becomes invalid)
 */
async function tryOrRollback<T>(
  dbTx: Pool,
  func: () => Promise<T>,
): Promise<undefined | T> {
  const checkpointName = `game_state_transition`;
  await dbTx.query(`SAVEPOINT ${checkpointName}`);
  try {
    return await func();
  } catch (err) {
    await dbTx.query(`ROLLBACK TO SAVEPOINT ${checkpointName}`);
    log.remote(
      ComponentNames.PAIMA_SYNC,
      "block-processing",
      SeverityNumber.INFO,
      (log) =>
        log(`Database error on ${checkpointName}. Rolling back.` + String(err)),
    );
    return undefined;
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
  gameStateTransitionRouter: (
    blockHeight: number,
    input: BaseStfInput,
  ) => Promise<BaseStfOutput<AppEvents>>,
  dbConn: Pool,
): Operation<any> {
  let result = generator.next();

  // NOTE: sync generators cannot execute promises
  //       so we pause the execution, and resolve them here.
  // NOTE: there are 2 types of operations we need to handle
  //       1. state machine executions, these return a series of queries to run.
  //       2. world.resolve calls, that are DB queries.
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
    } else if (isStateMachineExecution(value)) {
      yield* until(tryOrRollback(dbConn, async () => {
        const stateMachineResult = await gameStateTransitionRouter(
          value.data.blockHeight,
          value.data,
        );
        for (const [queryIR, params] of stateMachineResult.stateTransitions) {
          await queryIR.run(params, dbConn);
        }
      }));
    } else {
      // This should never happen.
      throw new Error("Unknown value", { cause: value });
    }
    result = generator.next(operations.flat());
  }
  return result.value;
}

/**
 * This function is used to process the user defined migrations
 * to be executed at specific block heights.
 */
function* processMigrations(
  blockHeight: number,
  migrations: (blockHeight: number) => Operation<string | undefined>,
  dbConn: Pool,
): Operation<void> {
  const migrationToApply = yield* migrations(blockHeight);
  if (migrationToApply) {
    yield* until(
      tryOrRollback(dbConn, async () => await dbConn.query(migrationToApply)),
    );
  }
}

// TODO
// Where shoud we move this? Before emitting finalizedBlockStream?
/**
 * This function is the main entry point for processing a produced block.
 * It is called whem a block can be processed and finalized.
 * It runs the entire pipeline in a transaction, with subtransactions for each StateMachineExecution.
 * Process Order:
 * 1. Create a temporal block record
 * 2. Process the migrations for this block height
 * 3. Process the scheduled data for this block height
 * 4. Process the primitives in the block
 * 4.a Resolve primitives effects (in order of appearance)
 * 4.b Resolve state machine effects (in order of apperance)
 * 5. Mark the block as done, and add the hash.
 * 6. Commit the transaction
 */
export function processFinalizedBlock(
  gameStateTransitionRouter: (
    blockHeight: number,
    input: BaseStfInput,
  ) => Promise<BaseStfOutput<AppEvents>>,
  dbConn: Pool,
  migrations?: (blockHeight: number) => Operation<string | undefined>,
): (value: ChainBlock) => Operation<`0x${string}`> {
  return function* (value: ChainBlock): Operation<`0x${string}`> {
    let blockHash: `0x${string}`;
    try {
      yield* until(dbConn.query("BEGIN"));

      // TODO: Should this be after the primitves?
      //       This should not be saved if the process fails.
      //       But each StateMachineExecution is a transaction.
      yield* call(() =>
        saveLastBlock.run({
          // TODO: Check thses values
          block_height: value.blockNumber,
          ver: 0,
          main_chain_block_hash: Buffer.from(value.blockNumber.toString()),
          seed: value.blockNumber.toString(),
          ms_timestamp: new Date(value.timestamp),
        }, dbConn)
      );

      // First Process the migrations.
      if (migrations) {
        yield* processMigrations(value.blockNumber, migrations, dbConn);
      }

      // TODO:
      // Second Process the scheduled data.

      // Third Process the primitives.
      for (const primitive of value.primitives) {
        // TODO:
        // This "if" for this example process only evm primitives.
        if (primitive.source === "parallelUtxoRpc") {
          continue;
        }
        const generator = primitiveTransitionFunction(
          value.blockNumber,
          primitive,
        );
        yield* executeGeneratorStepByStep(
          generator,
          gameStateTransitionRouter,
          dbConn,
        );
      }

      // Fourth, mark the block as done.
      // TODO create the hash from the contents (how?)
      blockHash = `0x${
        Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16))
          .join("")
      }`;

      yield* call(() =>
        blockHeightDone.run({
          block_hash: Buffer.from(blockHash),
          block_height: value.blockNumber,
        }, dbConn)
      );

      yield* until(dbConn.query("COMMIT"));
    } catch (err) {
      yield* until(dbConn.query("ROLLBACK"));
      log.remote(
        ComponentNames.PAIMA_SYNC,
        "block-processing",
        SeverityNumber.ERROR,
        (log) =>
          log(`Error processing block ${value.blockNumber}: ${String(err)}`),
      );
      // We cannot recover from this error.
      throw err;
    }
    return blockHash;
  };
}
