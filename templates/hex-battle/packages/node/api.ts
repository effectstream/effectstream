import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import type { FastifyInstance } from "fastify";
import { runPreparedQuery } from "@effectstream/db";
import {
  getLobbyById,
  getLobbyPlayers,
  getOpenLobbies,
  getLobbyRounds,
  getPlayerByWallet,
  getPlayersByWins,
  getLatestCreatedLobby,
  getLobbyMap,
  getGameState,
} from "@hex-battle/database";

export const apiRouter: StartConfigApiRouter = async function (
  server: FastifyInstance,
  dbConn: Pool,
): Promise<void> {
  // Get a lobby by id, including its players, rounds and parsed game state.
  server.get("/lobby/:lobbyId", async (request, reply) => {
    const { lobbyId } = request.params as { lobbyId: string };
    try {
      const [lobby] = await runPreparedQuery(
        getLobbyById.run({ lobby_id: lobbyId }, dbConn),
        "getLobbyById",
      );
      if (!lobby) return reply.send(null);

      const players = await runPreparedQuery(
        getLobbyPlayers.run({ lobby_id: lobbyId }, dbConn),
        "getLobbyPlayers",
      );
      const rounds = await runPreparedQuery(
        getLobbyRounds.run({ lobby_id: lobbyId }, dbConn),
        "getLobbyRounds",
      );

      let gameState: unknown = null;
      if (lobby.game_state) {
        try {
          gameState = JSON.parse(lobby.game_state);
        } catch {
          gameState = null;
        }
      }
      return reply.send({ ...lobby, gameState, players, rounds });
    } catch (error) {
      console.error("Error fetching lobby:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Get a lobby's players.
  server.get("/lobby/:lobbyId/players", async (request, reply) => {
    const { lobbyId } = request.params as { lobbyId: string };
    try {
      const players = await runPreparedQuery(
        getLobbyPlayers.run({ lobby_id: lobbyId }, dbConn),
        "getLobbyPlayers",
      );
      return reply.send(players);
    } catch (error) {
      console.error("Error fetching lobby players:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Open lobbies anyone can join.
  server.get("/lobbies/open", async (_request, reply) => {
    try {
      const lobbies = await runPreparedQuery(
        getOpenLobbies.run(undefined, dbConn),
        "getOpenLobbies",
      );
      return reply.send(lobbies);
    } catch (error) {
      console.error("Error fetching open lobbies:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Leaderboard player stats by wallet.
  server.get("/player/:wallet", async (request, reply) => {
    const { wallet } = request.params as { wallet: string };
    try {
      const [player] = await runPreparedQuery(
        getPlayerByWallet.run({ wallet: wallet.toLowerCase() }, dbConn),
        "getPlayerByWallet",
      );
      return reply.send(
        player ?? {
          wallet: wallet.toLowerCase(),
          wins: 0,
          losses: 0,
          draws: 0,
          played_games: 0,
        },
      );
    } catch (error) {
      console.error("Error fetching player:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Leaderboard (top players by wins).
  server.get("/leaderboard", async (request, reply) => {
    const { page = 0, count = 10 } = request.query as {
      page?: number;
      count?: number;
    };
    try {
      const players = await runPreparedQuery(
        getPlayersByWins.run(
          { limit: Number(count), offset: Number(page) * Number(count) },
          dbConn,
        ),
        "getPlayersByWins",
      );
      return reply.send(players);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // The most recent OPEN lobby a wallet created (used by the frontend right
  // after createLobby resolves, to learn the server-assigned lobby id).
  server.get("/lobby/latest/:wallet", async (request, reply) => {
    const { wallet } = request.params as { wallet: string };
    try {
      const [lobby] = await runPreparedQuery(
        getLatestCreatedLobby.run({ lobby_creator: wallet.toLowerCase() }, dbConn),
        "getLatestCreatedLobby",
      );
      return reply.send(lobby ?? null);
    } catch (error) {
      console.error("Error fetching latest created lobby:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // A lobby's serialized hex map (the q/r/s coordinate list the engine renders).
  server.get("/lobby/:lobbyId/map", async (request, reply) => {
    const { lobbyId } = request.params as { lobbyId: string };
    try {
      const [lobby] = await runPreparedQuery(
        getLobbyMap.run({ lobby_id: lobbyId }, dbConn),
        "getLobbyMap",
      );
      return reply.send(lobby ?? null);
    } catch (error) {
      console.error("Error fetching lobby map:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // A lobby's state + current round (used to detect game-over / draw).
  server.get("/lobby/:lobbyId/state", async (request, reply) => {
    const { lobbyId } = request.params as { lobbyId: string };
    try {
      const [state] = await runPreparedQuery(
        getGameState.run({ lobby_id: lobbyId }, dbConn),
        "getGameState",
      );
      return reply.send(state ?? null);
    } catch (error) {
      console.error("Error fetching lobby state:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // The submitted move(s) for a lobby + round (frontend polls this to mirror the
  // opponent's turn). Returns the matching round row(s) for that round number.
  server.get("/lobby/:lobbyId/move/:round", async (request, reply) => {
    const { lobbyId, round } = request.params as {
      lobbyId: string;
      round: string;
    };
    try {
      const rounds = await runPreparedQuery(
        getLobbyRounds.run({ lobby_id: lobbyId }, dbConn),
        "getLobbyRounds",
      );
      const match = rounds.filter((r) => r.round === Number(round));
      return reply.send(match);
    } catch (error) {
      console.error("Error fetching move for round:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Lobbies a given wallet is a participant in (the player's active games).
  server.get("/lobbies/my/:wallet", async (request, reply) => {
    const { wallet } = request.params as { wallet: string };
    try {
      const lobbies = await runPreparedQuery(
        getOpenLobbies.run(undefined, dbConn),
        "getOpenLobbies",
      );
      // getOpenLobbies only returns open lobbies; for "my games" we surface the
      // ones this wallet created. (lobby_player membership lookup would need a
      // dedicated query; the open-lobby creator filter covers the rejoin flow
      // the frontend uses.)
      const mine = lobbies.filter(
        (l) => l.lobby_creator?.toLowerCase() === wallet.toLowerCase(),
      );
      return reply.send(mine);
    } catch (error) {
      console.error("Error fetching my games:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  console.log("API routes registered for Hex Battle");
};
