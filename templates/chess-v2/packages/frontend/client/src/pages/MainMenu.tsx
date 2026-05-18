import React, { useEffect } from "react";
import { Box } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { Layout } from "../layouts/Layout.tsx";
import { MenuCard } from "../components/MenuCard.tsx";
import { useWallet } from "../contexts/WalletContext.tsx";

import createBackground from "../../assets/images/create-background.png";
import lobbiesBackground from "../../assets/images/lobbies-background.png";
import gamesBackground from "../../assets/images/games-background.png";

export const MainMenu: React.FC = () => {
  const navigate = useNavigate();
  const { address } = useWallet();

  useEffect(() => {
    if (!address) navigate("/login");
  }, [address, navigate]);

  return (
    <Layout>
      <Box
        sx={{
          display: "flex",
          gap: "24px",
          flexWrap: "wrap",
          justifyContent: "center",
          marginTop: "24px",
        }}
      >
        <MenuCard
          onClick={() => navigate("/create")}
          title="Create"
          background={createBackground}
        />
        <MenuCard
          onClick={() => navigate("/lobbies")}
          title="Lobbies"
          background={lobbiesBackground}
        />
        <MenuCard
          onClick={() => navigate("/my-games")}
          title="My Games"
          background={gamesBackground}
        />
      </Box>
    </Layout>
  );
};
