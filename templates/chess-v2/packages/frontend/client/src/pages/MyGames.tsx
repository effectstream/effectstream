import React, { useEffect, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { Layout } from "../layouts/Layout.tsx";
import { LobbyCard } from "../components/LobbyCard.tsx";
import { useWallet } from "../contexts/WalletContext.tsx";
import { getUserLobbies } from "../api/queries.ts";
import { truncateAddress } from "../utils/index.ts";

export const MyGames: React.FC = () => {
  const { address } = useWallet();
  const navigate = useNavigate();
  const [lobbies, setLobbies] = useState<any[]>([]);

  useEffect(() => {
    if (!address) return;
    getUserLobbies(address).then((r) => setLobbies(r.lobbies));
  }, [address]);

  return (
    <Layout>
      <Typography variant="h2" sx={{ mb: 3 }}>My Games</Typography>
      {lobbies.length === 0 && (
        <Typography>No games yet. Create or join a lobby!</Typography>
      )}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: "16px", justifyContent: "center" }}>
        {lobbies.map((lobby) => (
          <LobbyCard
            key={lobby.lobby_id}
            host={truncateAddress(lobby.lobby_creator)}
            lobbyId={lobby.lobby_id}
            createdAt={lobby.lobby_state}
            myTurn={lobby.lobby_state === "active"}
            ctaButton={
              <Button fullWidth onClick={() => navigate(`/game/${lobby.lobby_id}`)}>
                {lobby.lobby_state === "active" ? "Play" : "View"}
              </Button>
            }
          />
        ))}
      </Box>
    </Layout>
  );
};
