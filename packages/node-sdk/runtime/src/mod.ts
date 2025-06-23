import { ChainBlock, genSyncProtocols } from "@paima/sync";
import { getConnection } from "@paima/db";
import { startMerge, startSync } from "@paima/sync";
import type { SyncProtocolWithNetwork } from "@paima/config";
import type { AppEvents } from "@paima/sm";
import { ComponentNames, log, SeverityNumber } from "@paima/log";
import {
  call,
  createChannel,
  each,
  type Operation,
  spawn,
  until,
} from "effection";
import { initTelemetry } from "./telemetry.ts";
import type { Pool } from "pg";
import {
  type BaseStfInput,
  type BaseStfOutput,
  primitiveTransitionFunction,
} from "@paima/sm";
import { PreparedQuery } from "npm:@pgtyped/runtime@2.4.2";
// import { gameStateTransitionRouter } from "@example/state-transition";
// TODO: figure out how to setup env vars instead of relying on defaults
const poolConfig = {
  host: Deno.env.get("DB_HOST") || "localhost",
  user: Deno.env.get("DB_USER") || "postgres",
  password: Deno.env.get("DB_PW") || "",
  database: Deno.env.get("DB_NAME") || "postgres",
  port: parseInt(Deno.env.get("DB_PORT") || "5432", 10),
};

export function* init() {
  // initialize OpenTelemetry
  yield* initTelemetry();
}

export function* start(
  syncInfo: SyncProtocolWithNetwork[],
  gameStateTransitionRouter: (
    blockHeight: number,
    input: BaseStfInput,
  ) => Promise<BaseStfOutput<AppEvents>>,
): Operation<void> {
  const dbConn = getConnection(poolConfig);
  // TODO: this should be a db transaction that closes right afterwards
  const syncProtocols = yield* genSyncProtocols(dbConn, syncInfo);

  // yield* call(newAddress.run({
  //   address: "asdf",
  // }, DBConn));
  // const foo = yield* call(getAddressFromAddress.run({
  //   address: "asdf",
  // }, DBConn));
  // console.log(foo);

  log.remote(
    ComponentNames.PAIMA_RUNTIME,
    [],
    SeverityNumber.INFO,
    (log) => log("start sync"),
  );
  for (const syncProtocol of syncProtocols) {
    yield* startSync(syncProtocol);
  }

  // yield* spawn(function* (): Generator<void> {
  //   yield* startMerge(syncProtocols);
  //   while (true) {}
  // });
  const finalizedBlockStream = createChannel<ChainBlock>();
  yield* spawn(() => startMerge(syncProtocols, finalizedBlockStream));

  for (const value of yield* each(finalizedBlockStream)) {
    // TODO: save data into a database
    // console.log("got value:", value);
    yield* processFinalizedBlock(value, gameStateTransitionRouter, dbConn);
    yield* each.next();
  }
}

function* consumeGeneratorWithDelay<T, R>(
  generator: Generator<T, R, unknown>,
  dbConn: Pool,
): Operation<R> {
  let result = generator.next();

  while (!result.done) {
    // We resolve promises here.
    // Generators cannot execute promises.
    // The PaimaL2 returns the state machine promise to resolve.
    if (
      result.value &&
      typeof result.value === "object" &&
      "type" in result.value &&
      result.value.type === "promise" &&
      "promise" in result.value
    ) {
      const promiseResult = yield* until((result.value as any).promise);
      const stateMachineQuery = (promiseResult as any).stateTransitions;
      for (const [queryIR, params] of stateMachineQuery) {
        yield* call(() => queryIR.run(params, dbConn));
      }
    } else if (result.value && Array.isArray(result.value)) {
      const [queryIR, params] = result.value as [any, any];
      const query = new PreparedQuery(queryIR);
      yield* call(() => query.run(params, dbConn));
    }
    result = generator.next();
  }
  return result.value;
}

// Where shoud we move this? Before emitting finalizedBlockStream?
function* processFinalizedBlock(
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
      yield* consumeGeneratorWithDelay(generator, dbConn);
    }
  }
}
