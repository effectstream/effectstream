import fastify, { type FastifyRequest } from "fastify";
// import { Value } from "npm:@sinclair/typebox/value";
import { evmRpcEngine } from "./rpc-evm/eip1193.ts";
import type { Pool } from "pg";
import cors from "@fastify/cors";
import { run, until } from "effection";
import {
  aquireDBMutex,
  erc721Ivm,
  releaseDBMutex,
  runPreparedQuery,
} from "@paima/db";
import { ENV } from "@paima/utils";
import type { AllSyncProtocols } from "../../../sync/src/sync-protocols/types.ts";
import { ConfigPrimitiveType } from "@paima/config";

export enum RpcPaths {
  Root = "rpc",
  EVM = "evm",
}

export const startHttpServer = function* (
  dbConn: Pool,
  syncProtocols: AllSyncProtocols[],
) {
  // Allow any webpage to access the server.
  // This node is not specific for a specific website.
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
  //   return clearBigInts(syncProtocols);
  // });

  // TODO This is dev only endpoint to monitor sync protocols.
  server.get("/config", () => {
    const config = syncProtocols.map((syncProtocol) => syncProtocol.config)
      .flat();
    return clearBigInts(config);
  });

  // TODO How to only select user defined tables?
  server.get("/table-schema/:tableName", async (
    request: FastifyRequest<{ Params: { tableName: string } }>,
    reply,
  ) => {
    const { tableName } = request.params;
    // TODO This is unsafe.
    const result = await runPreparedQuery<{ rows: unknown[] }>(dbConn.query(
      `select column_name, data_type, character_maximum_length, column_default, is_nullable
from INFORMATION_SCHEMA.COLUMNS where table_name = '${tableName.toLowerCase()}';
`,
    ));
    return result.rows;
  });

  server.get(
    "/tables/:tableName",
    async (
      request: FastifyRequest<{ Params: { tableName: string } }>,
      reply,
    ) => {
      const { tableName } = request.params;
      try {
        // TODO This is unsafe.
        const result = await runPreparedQuery<{ rows: unknown[] }>(dbConn.query(
          `SELECT * FROM "${tableName.toLowerCase()}"`,
        ));
        return result.rows;
      } catch (error) {
        return reply.status(404).send({ error: "Table not found" });
      }
    },
  );

  server.get("/primitives-schema/:primitiveName", async (
    request: FastifyRequest<{ Params: { primitiveName: string } }>,
    reply,
  ) => {
    const { primitiveName } = request.params;
    // TODO map/find the results generated bad TS Types (too hard to represent)
    const findPrimitive = (syncProtocols: AllSyncProtocols[]) => {
      for (const syncProtocol of syncProtocols) {
        for (const primitive of syncProtocol.config.primitives) {
          if (primitive.primitive.name === primitiveName) {
            return primitive;
          }
        }
      }
      return undefined;
    };
    const primitive = findPrimitive(syncProtocols);
    if (!primitive) {
      return reply.status(404).send({ error: "Primitive not found" });
    }

    if (primitive.primitive.type === ConfigPrimitiveType.EvmRpcERC20) {
      // TODO This is unsafe.
      const result = await runPreparedQuery<{ rows: unknown[] }>(dbConn.query(
        `select column_name, data_type, character_maximum_length, column_default, is_nullable
from INFORMATION_SCHEMA.COLUMNS where table_name = 'erc20_balances_view_${primitive.primitive.name.toLowerCase()}';
`,
      ));
      return result.rows;
    } else if (
      primitive.primitive.type === ConfigPrimitiveType.EvmRpcERC721
    ) {
      // TODO This is unsafe.
      const result = await runPreparedQuery<{ rows: unknown[] }>(dbConn.query(
        `select column_name, data_type, character_maximum_length, column_default, is_nullable
from INFORMATION_SCHEMA.COLUMNS where table_name = 'erc721_ownership_view_${primitive.primitive.name.toLowerCase()}';
`,
      ));
      return result.rows;
    }

    return reply.status(404).send({
      error: "Primitive does not have aggregated data",
    });
  });

  server.get(
    "/primitives/:primitiveName",
    async (
      request: FastifyRequest<{ Params: { primitiveName: string } }>,
      reply,
    ) => {
      const { primitiveName } = request.params;
      // TODO map/find the results generated bad TS Types (too hard to represent)
      const findPrimitive = (syncProtocols: AllSyncProtocols[]) => {
        for (const syncProtocol of syncProtocols) {
          for (const primitive of syncProtocol.config.primitives) {
            if (primitive.primitive.name === primitiveName) {
              return primitive;
            }
          }
        }
        return undefined;
      };
      const primitive = findPrimitive(syncProtocols);
      if (!primitive) {
        return reply.status(404).send({ error: "Primitive not found" });
      }

      if (primitive.primitive.type === ConfigPrimitiveType.EvmRpcERC20) {
        // TODO This is unsafe.
        const result = await runPreparedQuery<{ rows: unknown[] }>(dbConn.query(
          `SELECT * FROM "erc20_balances_view_${primitive.primitive.name.toLowerCase()}"`,
        ));
        return result.rows;
      } else if (
        primitive.primitive.type === ConfigPrimitiveType.EvmRpcERC721
      ) {
        // TODO This is unsafe.
        const result = await runPreparedQuery<{ rows: unknown[] }>(dbConn.query(
          `SELECT * FROM "erc721_ownership_view_${primitive.primitive.name.toLowerCase()}"`,
        ));
        return result.rows;
      }

      return reply.status(404).send({
        error: "Primitive does not have aggregated data",
      });
    },
  );

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

export function clearBigInts<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(
      value,
      (_, v) => typeof v === "bigint" ? v.toString() : v,
    ),
  );
}
