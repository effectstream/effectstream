import { getRandomActiveLobby } from "@chess/db";
import type { Pool } from "pg";

export const getRandomActiveLobbyHandler = async (dbConn: Pool) => {
  const [lobby] = await getRandomActiveLobby.run(undefined, dbConn);
  const result = lobby || null;
  return { lobby: result };
};
