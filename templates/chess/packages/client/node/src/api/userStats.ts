import { getUserRatingPosition, getUserStats } from "@chess/db";
import type { Pool } from "pg";

export const getUserStatsHandler = async (dbConn: Pool, wallet: string) => {
  wallet = wallet.toLowerCase();
  const [stats] = await getUserStats.run({ wallet }, dbConn);

  if (!stats) {
    return { stats: null };
  }

  const [ratingPosition] = await getUserRatingPosition.run(
    {
      rating: stats.rating,
    },
    dbConn
  );
  return { stats, rank: ratingPosition?.rank ?? undefined };
};
