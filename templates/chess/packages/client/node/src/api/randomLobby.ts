import { getPaginatedOpenLobbies, getRandomLobby } from "@chess/db";
import type { Pool } from "pg";

export const getRandomLobbyHandler = async (dbConn: Pool) => {
  const [lobby] = await getRandomLobby.run(undefined, dbConn);
  if (lobby) {
    return { lobby };
  }

  const [backupLobby] = await getPaginatedOpenLobbies.run(
    { wallet: "", count: `1`, page: `1` },
    dbConn
  );
  const result = backupLobby || null;
  return { lobby: result };
};
