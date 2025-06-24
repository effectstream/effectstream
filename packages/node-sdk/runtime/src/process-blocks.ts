import type { ChainBlock } from "@paima/sync";
import type { AppEvents } from "@paima/sm";
import { call, type Operation } from "effection";
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

function isStateMachineExecution(value: any): value is STMExecPromise {
  return value && typeof value === "object" && value.type === "stm-promise";
}

function isWorldResolve(value: any): value is QueuedUpdate {
  return value && Array.isArray(value);
}

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
  // NOTE: there are 3 types of operations we need to handle
  //       1. state machine executions, these return a series of queries to run.
  //       2. nonce executions insertions, these do not revert.
  //       3. world.resolve calls, that are DB queries.
  while (!result.done) {
    // We resolve the generators promises here.
    // Generators cannot execute promises.

    const operations: any[] = [];
    // const isWorldResolve = result.value && Array.isArray(result.value);
    // const isNoncePromise = result.value && typeof result.value === "object" &&
    //   "type" in result.value && result.value.type === "nonce";
    const value = result.value;

    if (isWorldResolve(value)) {
      const [queryIR, params] = value;
      const query = new PreparedQuery(queryIR);
      const queryResult = yield* call(() => query.run(params, dbConn));
      operations.push(queryResult);
    } else if (isStateMachineExecution(value)) {
      // TODO Run this in a transaction
      //      We need to revert if any query fails.
      const promiseResult = yield* call(() =>
        gameStateTransitionRouter(
          value.data.blockHeight,
          value.data,
        )
      );
      const stateMachineQuery = promiseResult.stateTransitions;
      for (const [queryIR, params] of stateMachineQuery) {
        const queryResult = yield* call(() => queryIR.run(params, dbConn));
        operations.push(queryResult);
      }
    }

    result = generator.next(operations.flat());
  }
  return result.value;
}

// TODO
// Where shoud we move this? Before emitting finalizedBlockStream?
export function* processFinalizedBlock(
  value: ChainBlock,
  gameStateTransitionRouter: (
    blockHeight: number,
    input: BaseStfInput,
  ) => Promise<BaseStfOutput<AppEvents>>,
  dbConn: Pool,
): Operation<void> {
  // TODO
  // This "if" for this example process only evm primitives
  if (
    value.primitives.length > 0 &&
    value.primitives[0].source !== "parallelUtxoRpc"
  ) {
    for (const primitive of value.primitives) {
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
  }
}
