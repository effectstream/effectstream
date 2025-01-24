import { genSyncProtocols } from "@paima/sync";
import { getConnection } from "@paima/db";
import { startMerge, startSync } from "@paima/sync";
import type { SyncProtocolWithNetwork } from "@paima/config";
import { ComponentNames, log, SeverityNumber } from "@paima/log";
import { spawn } from "effection";
import { initTelemetry } from "./telemetry.ts";

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
) {
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
  yield* spawn(() => startMerge(syncProtocols));
}
