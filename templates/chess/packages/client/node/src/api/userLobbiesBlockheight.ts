import { getNewLobbiesByUserAndBlockHeight } from "@chess/db";
import type { Pool } from "pg";

export const getUserLobbiesBlockheightHandler = async (
  dbConn: Pool,
  wallet: string,
  blockHeight: number
) => {
  wallet = wallet.toLowerCase();
  const lobbies = await getNewLobbiesByUserAndBlockHeight.run(
    { wallet, block_height: blockHeight },
    dbConn
  );
  return { lobbies };
};
