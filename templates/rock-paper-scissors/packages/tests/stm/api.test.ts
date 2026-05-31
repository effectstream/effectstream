import { assert } from "../helpers.ts";
import { P1, P2 } from "./actions.test.ts";

const API_PORT = 9999;

// `lobbyId` is the lobby that played a full match in submittedMovesTest (now
// "finished" with both players). We assert the documented API routes against
// known state.
export async function apiTest(lobbyId: string) {
  await assert(`GET /lobby/:lobbyId returns the finished lobby`, async () => {
    const res = await fetch(`http://localhost:${API_PORT}/lobby/${lobbyId}`);
    if (!res.ok) return false;
    const data = (await res.json()) as any;
    return (
      data != null &&
      data.lobby_id === lobbyId &&
      data.lobby_state === "finished" &&
      data.lobby_creator === P1 &&
      data.player_two === P2
    );
  });

  await assert(`GET /user_stats?wallet= returns P1's tally`, async () => {
    const res = await fetch(
      `http://localhost:${API_PORT}/user_stats?wallet=${P1}`,
    );
    if (!res.ok) return false;
    const stats = (await res.json()) as any;
    return (
      stats != null &&
      stats.wallet === P1 &&
      Number(stats.wins) + Number(stats.losses) + Number(stats.ties) >= 1
    );
  });

  await assert(
    `GET /open_lobbies?page=&count= returns an array of open lobbies`,
    async () => {
      const res = await fetch(
        `http://localhost:${API_PORT}/open_lobbies?page=0&count=10`,
      );
      if (!res.ok) return false;
      const lobbies = (await res.json()) as any[];
      return (
        Array.isArray(lobbies) &&
        lobbies.every((l) => l.lobby_state === "open" && l.hidden === false)
      );
    },
  );

  await assert(
    `GET /lobby/:lobbyId/round/1/moves returns both round-1 moves`,
    async () => {
      const res = await fetch(
        `http://localhost:${API_PORT}/lobby/${lobbyId}/round/1/moves`,
      );
      if (!res.ok) return false;
      const moves = (await res.json()) as any[];
      if (!Array.isArray(moves) || moves.length !== 2) return false;
      const codes = moves.map((m) => m.move_rps).sort();
      return codes[0] === "R" && codes[1] === "S";
    },
  );

  await assert(
    `GET /lobby/:lobbyId/final returns the archived final match state`,
    async () => {
      const res = await fetch(
        `http://localhost:${API_PORT}/lobby/${lobbyId}/final`,
      );
      if (!res.ok) return false;
      const fin = (await res.json()) as any;
      return (
        fin != null &&
        fin.lobby_id === lobbyId &&
        fin.player_one_result === "win" &&
        fin.player_two_result === "loss" &&
        fin.game_moves === "RSRS**"
      );
    },
  );
}
