import { ChainBlock, genSyncProtocols } from "@paima/sync";
import { getConnection } from "@paima/db";
import { startMerge, startSync } from "@paima/sync";
import type { SyncProtocolWithNetwork } from "@paima/config";
import { ComponentNames, log, SeverityNumber } from "@paima/log";
import { call, createChannel, each, type Operation, spawn } from "effection";
import { initTelemetry } from "./telemetry.ts";
import { Pool } from "npm:pg@^8.14.0";
import { primitiveTransitionFunction } from "@paima/sm";
import { PreparedQuery } from "npm:@pgtyped/runtime@2.4.2";

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
    yield* processFinalizedBlock(value, dbConn);
    yield* each.next();
  }
}

// Where shoud we move this? Before emitting finalizedBlockStream?
function* processFinalizedBlock(
  value: ChainBlock,
  dbConn: Pool,
): Operation<void> {
  // TODO for this example process only evm primitives
  if (
    value.primitives.length > 0 &&
    value.primitives[0].source !== "parallelUtxoRpc"
  ) {
    for (const primitive of value.primitives) {
      const primitiveTransition = primitiveTransitionFunction(primitive as any);
      let next = primitiveTransition.next();
      while (!next.done) {
        // TODO this if can be removed. We are only testing pass async operators.
        if (next.value && Array.isArray(next.value)) {
          const [queryIR, params] = next.value as [any, any];
          const query = new PreparedQuery(queryIR);
          yield* call(() => query.run(params, dbConn));
        }
        next = primitiveTransition.next();
      }
    }
  }
}
