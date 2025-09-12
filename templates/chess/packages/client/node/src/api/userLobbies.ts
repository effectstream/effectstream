import { getAllPaginatedUserLobbies } from "@chess/db";
import type { Pool } from "pg";

export const getUserLobbiesHandler = async (
  dbConn: Pool,
  wallet: string,
  count?: number,
  page?: number
) => {
  wallet = wallet.toLowerCase();
  const offset = (page ?? 1) * (count ?? 10);

  const userLobbies = await getAllPaginatedUserLobbies.run(
    { wallet: wallet, count: `${count ?? 10}`, page: `${offset}` },
    dbConn
  );

  return { lobbies: userLobbies };
};
