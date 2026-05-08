import { getLatestProcessedBlockHeight } from "@effectstream/db";
import {
  getLobbyById,
  getRoundData,
  getLobbyRounds,
  getPaginatedOpenLobbies,
  searchPaginatedOpenLobbies,
  getAllPaginatedUserLobbies,
  getUserStats,
  getUserRatingPosition,
  getFinalState,
  getRoundMoves,
  getMovesByLobby,
  getMatchSeeds,
  getRandomLobby,
  getRandomActiveLobby,
} from "@chess-v2/database";
import { updateTimer } from "./chess-helpers.ts";
import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import type { FastifyInstance } from "fastify";

export const apiRouter: StartConfigApiRouter = async function (
  server: FastifyInstance,
  dbConn: Pool,
): Promise<void> {

  server.get("/api/lobby_state", async (request, reply) => {
    const { lobbyID } = request.query as { lobbyID: string };
    const [lobby] = await getLobbyById.run({ lobby_id: lobbyID }, dbConn);
    if (!lobby) return reply.send({ lobby: null });

    const [[roundData], [latestBlock], lobbyRounds] = await Promise.all([
      getRoundData.run({ lobby_id: lobbyID, round_number: lobby.current_round }, dbConn),
      getLatestProcessedBlockHeight.run(undefined, dbConn),
      getLobbyRounds.run({ lobby_id: lobbyID }, dbConn),
    ]);

    const latestRound = lobbyRounds[lobbyRounds.length - 1];
    const timer = latestRound
      ? updateTimer(latestRound, latestBlock.block_height, lobby.player_one_iswhite)
      : { player_one_blocks_left: lobby.play_time_per_player, player_two_blocks_left: lobby.play_time_per_player };

    reply.send({
      lobby: {
        ...lobby,
        round_start_height: roundData?.starting_block_height || 0,
        remaining_blocks: {
          w: lobby.player_one_iswhite ? timer.player_one_blocks_left : timer.player_two_blocks_left,
          b: lobby.player_one_iswhite ? timer.player_two_blocks_left : timer.player_one_blocks_left,
        },
      },
    });
  });

  server.get("/api/open_lobbies", async (request, reply) => {
    const { wallet, count, page } = request.query as { wallet: string; count: string; page: string };
    const lobbies = await getPaginatedOpenLobbies.run(
      { wallet: wallet.toLowerCase(), count: Number(count || 10), page: Number(page || 0) },
      dbConn,
    );
    reply.send({ lobbies });
  });

  server.get("/api/search_open_lobbies", async (request, reply) => {
    const { wallet, searchQuery, count, page } = request.query as any;
    const lobbies = await searchPaginatedOpenLobbies.run(
      { wallet: wallet.toLowerCase(), searchQuery, count: Number(count || 10), page: Number(page || 0) },
      dbConn,
    );
    reply.send({ lobbies });
  });

  server.get("/api/user_lobbies", async (request, reply) => {
    const { wallet, count, page } = request.query as { wallet: string; count: string; page: string };
    const lobbies = await getAllPaginatedUserLobbies.run(
      { wallet: wallet.toLowerCase(), count: Number(count || 10), page: Number(page || 0) },
      dbConn,
    );
    reply.send({ lobbies });
  });

  server.get("/api/user_stats", async (request, reply) => {
    const { wallet } = request.query as { wallet: string };
    const [stats] = await getUserStats.run({ wallet: wallet.toLowerCase() }, dbConn);
    if (!stats) return reply.send({ stats: null });
    const [ratingPosition] = await getUserRatingPosition.run({ rating: stats.rating }, dbConn);
    reply.send({ stats, rank: ratingPosition?.rank ?? undefined });
  });

  server.get("/api/match_winner", async (request, reply) => {
    const { lobbyID } = request.query as { lobbyID: string };
    const [finalState] = await getFinalState.run({ lobby_id: lobbyID }, dbConn);
    reply.send({ result: finalState ?? null });
  });

  server.get("/api/round_status", async (request, reply) => {
    const { lobbyID, round } = request.query as { lobbyID: string; round: string };
    const [roundData] = await getRoundData.run({ lobby_id: lobbyID, round_number: Number(round) }, dbConn);
    const moves = await getRoundMoves.run({ lobby_id: lobbyID, round_number: Number(round) }, dbConn);
    reply.send({ round: roundData, moves });
  });

  server.get("/api/round_executor", async (request, reply) => {
    const { lobbyID, round } = request.query as { lobbyID: string; round: string };
    const [lobby] = await getLobbyById.run({ lobby_id: lobbyID }, dbConn);
    const [roundData] = await getRoundData.run({ lobby_id: lobbyID, round_number: Number(round) }, dbConn);
    const moves = await getRoundMoves.run({ lobby_id: lobbyID, round_number: Number(round) }, dbConn);
    reply.send({ lobby, round: roundData, moves });
  });

  server.get("/api/match_executor", async (request, reply) => {
    const { lobbyID } = request.query as { lobbyID: string };
    const [lobby] = await getLobbyById.run({ lobby_id: lobbyID }, dbConn);
    const rounds = await getLobbyRounds.run({ lobby_id: lobbyID }, dbConn);
    const moves = await getMovesByLobby.run({ lobby_id: lobbyID }, dbConn);
    const seeds = await getMatchSeeds.run({ lobby_id: lobbyID }, dbConn);
    reply.send({ lobby, rounds, moves, seeds });
  });

  server.get("/api/random_lobby", async (_request, reply) => {
    const [lobby] = await getRandomLobby.run(undefined, dbConn);
    reply.send({ lobby: lobby ?? null });
  });

  server.get("/api/random_active_lobby", async (_request, reply) => {
    const [lobby] = await getRandomActiveLobby.run(undefined, dbConn);
    reply.send({ lobby: lobby ?? null });
  });
};
