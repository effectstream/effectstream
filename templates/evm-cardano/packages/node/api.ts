import { contractAddressesEvmMain } from "@evm-cardano/contracts-evm";
import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import type { FastifyInstance } from "fastify";

export const apiRouter: StartConfigApiRouter = async function (
  server: FastifyInstance,
  dbConn: Pool,
): Promise<void> {
  server.get("/api/events", async (request, reply) => {
    try {
      const { limit = "50", offset = "0" } = request.query as {
        limit?: string;
        offset?: string;
      };
      const result = await dbConn.query(
        "SELECT * FROM events ORDER BY id DESC LIMIT $1 OFFSET $2",
        [Number(limit), Number(offset)],
      );
      reply.send(result.rows);
    } catch {
      reply.send([]);
    }
  });

  server.get("/api/events/:chain", async (request, reply) => {
    try {
      const { chain } = request.params as { chain: string };
      const { limit = "50", offset = "0" } = request.query as {
        limit?: string;
        offset?: string;
      };
      const result = await dbConn.query(
        "SELECT * FROM events WHERE chain = $1 ORDER BY id DESC LIMIT $2 OFFSET $3",
        [chain, Number(limit), Number(offset)],
      );
      reply.send(result.rows);
    } catch {
      reply.send([]);
    }
  });

  server.get("/api/stats", async (_request, reply) => {
    try {
      const result = await dbConn.query("SELECT * FROM chain_stats");
      reply.send(result.rows);
    } catch {
      reply.send([]);
    }
  });

  server.get("/api/block-heights", async (_request, reply) => {
    try {
      const result = await dbConn.query(
        "SELECT protocol_name, MAX(page_number) AS synced_page FROM effectstream.sync_protocol_pagination GROUP BY protocol_name ORDER BY protocol_name",
      );
      reply.send(result.rows);
    } catch {
      reply.send([]);
    }
  });

  server.get("/api/contract-address", async (_request, reply) => {
    try {
      const address =
        contractAddressesEvmMain().chain31337["Erc721DevModule#Erc721Dev"];
      reply.send({ address });
    } catch {
      reply.status(503).send({ address: null });
    }
  });
};
