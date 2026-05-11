import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import type { FastifyInstance } from "fastify";
import {
  getDelegations,
  getDelegationsByPool,
  getDelegationsByAddress,
  getPoolStats,
  getBlockHeights,
} from "@cardano-delegation/database";

export const apiRouter: StartConfigApiRouter = async function (
  server: FastifyInstance,
  dbConn: Pool,
): Promise<void> {
  server.get("/api/delegations", async (request, reply) => {
    try {
      const { limit = "50", offset = "0" } = request.query as {
        limit?: string;
        offset?: string;
      };
      const result = await getDelegations.run(
        { limit: Number(limit), offset: Number(offset) },
        dbConn,
      );
      reply.send(result);
    } catch {
      reply.send([]);
    }
  });

  server.get("/api/delegations/:pool", async (request, reply) => {
    try {
      const { pool } = request.params as { pool: string };
      const { limit = "50", offset = "0" } = request.query as {
        limit?: string;
        offset?: string;
      };
      const result = await getDelegationsByPool.run(
        { pool, limit: Number(limit), offset: Number(offset) },
        dbConn,
      );
      reply.send(result);
    } catch {
      reply.send([]);
    }
  });

  server.get("/api/delegations/by-address/:address", async (request, reply) => {
    try {
      const { address } = request.params as { address: string };
      const result = await getDelegationsByAddress.run({ address }, dbConn);
      reply.send(result);
    } catch {
      reply.send([]);
    }
  });

  server.get("/api/pool-stats", async (_request, reply) => {
    try {
      const result = await getPoolStats.run(undefined, dbConn);
      reply.send(result);
    } catch {
      reply.send([]);
    }
  });

  server.get("/api/block-heights", async (_request, reply) => {
    try {
      const result = await getBlockHeights.run(undefined, dbConn);
      reply.send(result);
    } catch {
      reply.send([]);
    }
  });
};
