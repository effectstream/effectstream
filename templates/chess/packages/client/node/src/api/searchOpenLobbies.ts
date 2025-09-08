import { getOpenLobbyById, searchPaginatedOpenLobbies } from "@chess/db";
import type { Pool } from "pg";

const MIN_SEARCH_LENGTH = 3;
const LOBBY_ID_LENGTH = 12;

export const searchOpenLobbiesHandler = async (
  dbConn: Pool,
  wallet: string,
  searchQuery: string,
  page?: number,
  count?: number
) => {
  if (
    searchQuery.length < MIN_SEARCH_LENGTH ||
    searchQuery.length > LOBBY_ID_LENGTH
  ) {
    return { lobbies: [] };
  }

  wallet = wallet.toLowerCase();

  if (searchQuery.length === LOBBY_ID_LENGTH) {
    const lobbies = await getOpenLobbyById.run(
      { searchQuery, wallet },
      dbConn
    );
    return { lobbies };
  }

  const offset = (page ?? 1) * (count ?? 10);

  const lobbies = await searchPaginatedOpenLobbies.run(
    {
      count: `${count ?? 10}`,
      page: `${offset}`,
      searchQuery: `%${searchQuery}%`,
      wallet,
    },
    dbConn
  );
  return { lobbies };
};
