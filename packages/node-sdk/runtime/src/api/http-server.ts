import fastify from "npm:fastify";
// import { Value } from "npm:@sinclair/typebox/value";
import { evmRpcEngine } from "./rpc-evm/eip1193.ts";
import type { Pool } from "pg";
import cors from "@fastify/cors";
import { run, until } from "effection";
import { aquireDBMutex, releaseDBMutex } from "@paima/db";
import { ENV } from "@paima/utils";
// import type { AllSyncProtocols } from "../../../sync/src/sync-protocols/types.ts";

export enum RpcPaths {
  Root = "rpc",
  EVM = "evm",
}

export const startHttpServer = function* (
  dbConn: Pool,
  // syncProtocols: AllSyncProtocols[],
) {
  const server = fastify();
  yield* until(
    server.register(cors, {
      origin: "*",
    }),
  );

  server.get("/health", () => {
    return {
      status: "ok",
    };
  });

  // TODO This is dev only endpoint to monitor sync protocols.
  // server.get("/debug/sync-protocols", () => {
  //   const stringify: typeof JSON.stringify = (value, replacer, space) =>
  //     JSON.stringify(
  //       value,
  //       (key, value_) => {
  //         const value = typeof value_ === "bigint" ? value_.toString() : value_;
  //         return typeof replacer === "function" ? replacer(key, value) : value;
  //       },
  //       space,
  //     );
  //   return JSON.parse(stringify(syncProtocols, null, 2));
  // });

  // These endpoints:
  // * /db_aquire_lock
  // * /db_release_lock
  // Are only used by the e2e tests to ensure that only one query is executed at a time.
  // They are not used by the main application.
  // TODO Disable this totally for production.
  server.get("/db_aquire_lock", async () => {
    await run(aquireDBMutex);
    return "ok";
  });

  server.get("/db_release_lock", () => {
    releaseDBMutex();
    return "ok";
  });

  const rpcEngine = evmRpcEngine(dbConn);
  server.post(`/${RpcPaths.Root}/${RpcPaths.EVM}`, (request, _) => {
    return rpcEngine.handle(
      request.body as any,
      (err: unknown, result: unknown) => {
        if (err) throw err;
        return result;
      },
    );
  });

  // Start the server
  server.listen(
    { port: ENV.PAIMA_API_PORT, host: "0.0.0.0" },
    (err: Error | null, address: string) => {
      if (err) {
        console.error("err", err);
      }
      console.log(`Paima Engine HTTP server running on ${address}`);
    },
  );
};
