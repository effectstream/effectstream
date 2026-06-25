import { assert } from "../helpers.ts";
import { wallet0 } from "./actions.test.ts";

const API_PORT = 9999;

// `lobbyId` is the lobby that started a match in joinedLobbyTest (active, with a
// serialized hex board). We assert the documented read routes against it.
export async function apiTest(lobbyId: string) {
  await assert(
    `GET /lobby/:id returns the lobby with players, rounds and parsed gameState`,
    async () => {
      const res = await fetch(`http://localhost:${API_PORT}/lobby/${lobbyId}`);
      if (!res.ok) return false;
      const data = (await res.json()) as any;
      return (
        data != null &&
        data.lobby_id === lobbyId &&
        Array.isArray(data.players) &&
        data.players.length === 2 &&
        Array.isArray(data.rounds) &&
        data.gameState != null &&
        Array.isArray(data.gameState.map?.tiles) &&
        data.gameState.map.tiles.length === 37
      );
    },
  );

  await assert(`GET /lobby/:id/players returns both players`, async () => {
    const res = await fetch(
      `http://localhost:${API_PORT}/lobby/${lobbyId}/players`,
    );
    if (!res.ok) return false;
    const players = (await res.json()) as any[];
    return Array.isArray(players) && players.length === 2;
  });

  await assert(`GET /lobbies/open returns an array of open lobbies`, async () => {
    const res = await fetch(`http://localhost:${API_PORT}/lobbies/open`);
    if (!res.ok) return false;
    const lobbies = (await res.json()) as any[];
    return (
      Array.isArray(lobbies) &&
      lobbies.every((l) => l.lobby_state === "open")
    );
  });

  await assert(`GET /player/:wallet returns the creator's record`, async () => {
    const res = await fetch(
      `http://localhost:${API_PORT}/player/${wallet0.address.toLowerCase()}`,
    );
    if (!res.ok) return false;
    const player = (await res.json()) as any;
    return (
      player != null &&
      player.wallet === wallet0.address.toLowerCase() &&
      typeof player.wins !== "undefined"
    );
  });

  await assert(`GET /leaderboard returns a players array`, async () => {
    const res = await fetch(
      `http://localhost:${API_PORT}/leaderboard?page=0&count=10`,
    );
    if (!res.ok) return false;
    const players = (await res.json()) as any[];
    return Array.isArray(players);
  });
}
