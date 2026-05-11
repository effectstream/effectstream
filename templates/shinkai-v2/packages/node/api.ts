import { runPreparedQuery } from "@effectstream/db";
import {
  getGameById,
  getNewGame,
  getQuestionAnswer,
  getUserStats,
  getWorldStats,
} from "@shinkai-v2/database";
import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import type { FastifyInstance } from "fastify";

export const apiRouter: StartConfigApiRouter = async function (
  server: FastifyInstance,
  dbConn: Pool,
): Promise<void> {
  server.get("/api/game", async (request, reply) => {
    const { game_id } = request.query as { game_id: string };
    const id = parseInt(game_id, 10);
    if (isNaN(id) || id < 1) return reply.code(400).send({ error: "invalid game_id" });
    const result = await runPreparedQuery(getGameById.run({ id }, dbConn), "/api/game");
    reply.send({ stats: result[0] ?? null });
  });

  server.get("/api/game/new", async (request, reply) => {
    const { wallet } = request.query as { wallet: string };
    if (!wallet) return reply.code(400).send({ error: "wallet required" });
    const result = await runPreparedQuery(
      getNewGame.run({ wallet: wallet.toLowerCase() }, dbConn),
      "/api/game/new",
    );
    reply.send({ stats: result[0] ?? null });
  });

  server.get("/api/game/round", async (request, reply) => {
    const { game_id, stage } = request.query as { game_id: string; stage: string };
    const id = parseInt(game_id, 10);
    if (isNaN(id) || id < 1) return reply.code(400).send({ error: "invalid game_id" });
    if (!stage) return reply.code(400).send({ error: "stage required" });
    const result = await runPreparedQuery(
      getQuestionAnswer.run({ game_id: id, stage }, dbConn),
      "/api/game/round",
    );
    reply.send({ stats: result[0] ?? null });
  });

  server.get("/api/game/tokens", async (request, reply) => {
    const { wallet } = request.query as { wallet: string };
    if (!wallet) return reply.code(400).send({ error: "wallet required" });
    const [userStats] = await runPreparedQuery(
      getUserStats.run({ wallet: wallet.toLowerCase() }, dbConn),
      "/api/game/tokens/user",
    );
    const [worldStats] = await runPreparedQuery(
      getWorldStats.run(undefined, dbConn),
      "/api/game/tokens/world",
    );
    reply.send({
      stats: {
        tokens: userStats?.tokens ?? 0,
        global: worldStats?.tokens ?? 0,
      },
    });
  });
};
