import { getPaginatedOpenLobbies } from "@chess/db";
import type { Pool } from "pg";

export const getOpenLobbiesHandler = async (
  dbConn: Pool,
  wallet: string,
  count?: number,
  page?: number
) => {
  wallet = wallet.toLowerCase();

  const offset = (page ?? 1) * (count ?? 10);
  const lobbies = await getPaginatedOpenLobbies.run(
    { count: `${count ?? 10}`, page: `${offset}`, wallet },
    dbConn
  );

  return { lobbies };
};
