import type { PreparedQuery } from "@pgtyped/runtime";
import type { WithBrand } from "@coderspirit/nominal";
import type { SQLQueryIR } from "@pgtyped/parser";
import { newScheduledHeightData, newScheduledTimestampData } from "@paima/db";
import type {
  INewScheduledHeightDataParams,
  INewScheduledTimestampDataParams,
} from "@paima/db";
import type { Pool, PoolClient } from "pg";
import type { BaseStfInput } from "@paima/sm";

/**
 * Two slightly tricky things about how this is set up:
 * Note 1: we need a type-safe way to pair together a query with the arguments used to execute it
 *         this is a bit hard in Typescript since it doesn't have full dependent types
 *         one way we could do this is with a class whose constructor ensures the entires are correlated
 *         but we want to try to keep things JSON-compatible (which is tedious with classes)
 *         so instead we use `WithBrand` to emulate class-like behavior
 *         that is, it can only be constructed using the `queueUpdate` constructor
 * Note 1: we use SQLQueryIR here instead of PreparedQuery
 *         this is unfortunate since SQLQueryIR is a private field of PreparedQuery
 *         so this slightly breaks encapsulation
 *         but PreparedQuery is a class, and we wanted this to be JSON-compatible
 */
export type QueuedUpdate<Input = any> = WithBrand<
  [queryIR: SQLQueryIR, Input],
  "QueuedUpdate"
>;

/**
 * Methods here are meant to emulate the interface you get with Promise
 *
 * Notably, they all follow the following steps
 * 1. Passes information necessary to make a state transition
 * 2. Yields control so the state transition can be executed
 * 3. Returns the result of the state transition
 *
 * Note: this is a bit hacky since Typescript doesn't have rank2 types / dependent types
 *       so `next` in a generator can't return a type based on its input
 *       however, you can wrap a yield in a generator of a single element to fix this
 *       see https://github.com/microsoft/TypeScript/issues/32523#issuecomment-789452716
 *
 * TODO: see `HexBlob` for how we might be able to unify this type with `SyncStateUpdateStream`
 */
export const World = {
  *resolve<const Input, const Output>(
    query: PreparedQuery<Input, Output>,
    input: Input,
  ): Generator<QueuedUpdate<Input>, Output[], unknown> {
    const unwrapped = yield [(query as any).queryIR, input] as QueuedUpdate;
    return unwrapped as Output[];
  },
  *all<const Streams extends SyncStateUpdateStream<any>[]>(
    streams: Streams,
  ): SyncStateUpdateStream<
    {
      [K in keyof Streams]: Streams[K] extends SyncStateUpdateStream<infer T>
        ? T
        : never;
    }
  > {
    const unwrapped = yield streams as any;
    return unwrapped as any;
  },
};

type Spread<T> = T extends [] // base case 1: empty list
  ? []
  : T extends readonly [infer A] // base case 2: one element
    ? [StateUpdateStream<A>]
  : T extends readonly [infer A, ...infer Rest] // recursion
    ? [StateUpdateStream<A>, ...Spread<Rest>]
  : never;

export function* StateMachineExecution(
  paima_block_height: number,
  blockTimestamp: number,
  conciseInput: string,
  userAddress: `0x${string}` | undefined,
  userId: number | undefined,
  ownChainBlockNumber: number,
  ownChainTransactionHash: string,
): StateUpdateStream<void> {
  yield {
    type: "stm-promise",
    data: {
      blockTimestamp,
      conciseInput,
      blockHeight: paima_block_height,
      userAddress,
      userId,
      chain: {
        blockNumber: ownChainBlockNumber,
        transactionHash: ownChainTransactionHash,
      },
    },
  } satisfies STMExecPromise;
}

// Type to resolve a yield of a StateMachine Execution
export type STMExecPromise = {
  type: "stm-promise";
  data: BaseStfInput;
};

type NoDistribute<T> = [T] extends [any] ? T : never;
/**
 * Typically it's better to use StateUpdateStream as a return type since it's more generic
 * But sometimes it helps simplify to only accept non-async inputs to a function operating on generators
 */
export type SyncStateUpdateStream<Return> = Generator<
  QueuedUpdate | Spread<any> | STMExecPromise,
  Return,
  unknown
>;
export type StateUpdateStream<Return> = NoDistribute<Return> extends
  Promise<infer P> ? AsyncGenerator<QueuedUpdate | Spread<any>, P, unknown>
  : SyncStateUpdateStream<Return>;

export function isScheduledByBlock(
  query: QueuedUpdate,
): query is QueuedUpdate<INewScheduledHeightDataParams> {
  return query[0] === (newScheduledHeightData as any).queryIR;
}
export function isScheduledByTimestamp(
  query: QueuedUpdate,
): query is QueuedUpdate<INewScheduledTimestampDataParams> {
  return query[0] === (newScheduledTimestampData as any).queryIR;
}

export async function execUpdateStateStream<Result>(
  stream: StateUpdateStream<Result>,
  DBConn: Pool | PoolClient,
): Promise<Result> {
  return await Promise.resolve(null as any);
  // let res = stream.next();
  // while (true) {
  //   if (res.done) return res.value;
  //   // TODO: update to support Promise.all
  //   const value = await new PreparedQuery(res.value[0]).run(
  //     res.value[1],
  //     DBConn,
  //   );
  //   res = stream.next(value);
  // }
}
