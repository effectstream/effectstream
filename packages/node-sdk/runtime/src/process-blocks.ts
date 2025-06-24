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

function* executeGeneratorStepByStep<T, R>(
  generator: Generator<T, R, unknown>,
  dbConn: Pool,
): Operation<R> {
  let result = generator.next();

  while (!result.done) {
    // We resolve the generators promises here.
    // Generators cannot execute promises.
    // The PaimaL2 returns the state machine promise to resolve.
    const operations: any[] = [];
    const isPromise = result.value &&
      typeof result.value === "object" &&
      "type" in result.value;
    if (
      isPromise &&
      (result.value as any).type === "promise"
    ) {
      const promiseResult = yield* until((result.value as any).promise);
      const stateMachineQuery = (promiseResult as any).stateTransitions;
      for (const [queryIR, params] of stateMachineQuery) {
        const queryResult = yield* call(() => queryIR.run(params, dbConn));
        operations.push(queryResult);
      }
    } else if (isPromise && (result.value as any).type === "nounce") {
      // TODO
      // This operation has to persist
      const [query, params] = (result.value as any).promise as [
        PreparedQuery<any, any>,
        any,
      ];
      const queryResult = yield* call(() => query.run(params, dbConn));
      operations.push(queryResult);
    } else if (result.value && Array.isArray(result.value)) {
      const [queryIR, params] = result.value as [any, any];
      const query = new PreparedQuery(queryIR);
      const queryResult = yield* call(() => query.run(params, dbConn));
      operations.push(queryResult);
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
  // TODO for this example process only evm primitives
  if (
    value.primitives.length > 0 &&
    value.primitives[0].source !== "parallelUtxoRpc"
  ) {
    for (const primitive of value.primitives) {
      const generator = primitiveTransitionFunction(
        primitive as any,
        gameStateTransitionRouter,
      );
      yield* executeGeneratorStepByStep(generator, dbConn);
    }
  }
}
