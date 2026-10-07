import { assert } from "../helpers.ts";
import { CREATOR_NFT, JOINER_NFT } from "./actions.test.ts";

const API_PORT = 9999;

// `lobbyId` is the lobby that played a full match in submittedMovesTest (now
// "finished" with 2 players). We assert the documented API routes against
// known state.
export async function apiTest(lobbyId: string) {
  await assert(
    `GET /lobby/:id returns the finished lobby with its players`,
    async () => {
      const res = await fetch(`http://localhost:${API_PORT}/lobby/${lobbyId}`);
      if (!res.ok) return false;
      const data = (await res.json()) as any;
      return (
        data != null &&
        data.lobby_id === lobbyId &&
        Array.isArray(data.players) &&
        data.players.length === 2 &&
        // card-game players expose HP
        data.players.every((p: any) => typeof p.hitPoints === "number")
      );
    },
  );

  await assert(`GET /lobby/:id/players returns both players`, async () => {
    const res = await fetch(
      `http://localhost:${API_PORT}/lobby/${lobbyId}/players`,
    );
    if (!res.ok) return false;
    const players = (await res.json()) as any[];
    if (!Array.isArray(players) || players.length !== 2) return false;
    const nftIds = players.map((p) => Number(p.nft_id)).sort();
    return nftIds[0] === CREATOR_NFT && nftIds[1] === JOINER_NFT;
  });

  await assert(`GET /stats/:nftId returns the creator's tally`, async () => {
    const res = await fetch(`http://localhost:${API_PORT}/stats/${CREATOR_NFT}`);
    if (!res.ok) return false;
    const stats = (await res.json()) as any;
    return (
      stats != null &&
      Number(stats.nft_id) === CREATOR_NFT &&
      Number(stats.wins) + Number(stats.losses) + Number(stats.ties) >= 1
    );
  });

  await assert(
    `GET /lobbies/open?page=&count= returns an array of open lobbies`,
    async () => {
      const res = await fetch(
        `http://localhost:${API_PORT}/lobbies/open?page=0&count=10`,
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
    `GET /cards/:nftId returns the buyer's cards and packs`,
    async () => {
      const res = await fetch(`http://localhost:${API_PORT}/cards/${CREATOR_NFT}`);
      if (!res.ok) return false;
      const data = (await res.json()) as any;
      return (
        data != null &&
        Number(data.nft_id) === CREATOR_NFT &&
        Array.isArray(data.cards) &&
        Array.isArray(data.packs) &&
        data.packs.length >= 1
      );
    },
  );
}
