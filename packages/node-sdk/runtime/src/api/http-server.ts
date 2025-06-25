import fastify from "npm:fastify";
// import { Value } from "npm:@sinclair/typebox/value";
import { evmRpcEngine } from "./rpc-evm/eip1193.ts";
import type { Pool } from "pg";

const PORT = 9999; // default port for OTLP HTTP traces

export enum RpcPaths {
  Root = "rpc",
  EVM = "evm",
}

export const startHttpServer = function* (dbConn: Pool) {
  const server = fastify();
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
    { port: PORT, host: "0.0.0.0" },
    (err: Error | null, address: string) => {
      if (err) {
        console.error("err", err);
      }
      console.log(`in-memory OpenTelemetry Collector running on ${address}`);
    },
  );
};
