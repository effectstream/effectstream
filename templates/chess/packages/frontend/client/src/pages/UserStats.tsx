import React, { useContext, useEffect, useState } from "react";
import { AppContext } from "../main.tsx";
import type { MainController } from "../MainController.ts";

import { RatingCard } from "../components/RatingCard.tsx";

export const UserStats: React.FC = () => {
  const mainController: MainController = useContext(
    AppContext,
  ) as unknown as MainController;
  const [rating, setRating] = useState<number>();
  const [rank, setRank] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      const response = await mainController.getStats();
      setRating(response.stats?.rating);
      setRank(response.rank?.toString());
      setLoading(false);
    };

    fetchStats();
  }, []);

  return <RatingCard rating={rating ?? 0} rank={rank} loading={loading} />;
};
