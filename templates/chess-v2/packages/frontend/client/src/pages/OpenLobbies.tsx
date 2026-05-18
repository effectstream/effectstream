import React, { useEffect, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { Layout } from "../layouts/Layout.tsx";
import { LobbyCard } from "../components/LobbyCard.tsx";
import { useWallet } from "../contexts/WalletContext.tsx";
import { getOpenLobbies } from "../api/queries.ts";
import { joinLobby } from "../api/write.ts";
import { truncateAddress } from "../utils/index.ts";

export const OpenLobbies: React.FC = () => {
  const { address, wallet } = useWallet();
  const navigate = useNavigate();
  const [lobbies, setLobbies] = useState<any[]>([]);

  useEffect(() => {
    if (!address) return;
    getOpenLobbies(address).then((r) => setLobbies(r.lobbies));
  }, [address]);

  const handleJoin = async (lobbyId: string) => {
    if (!wallet) return;
    try {
      await joinLobby(wallet, lobbyId);
      navigate(`/game/${lobbyId}`);
    } catch (err) {
      console.error("Join failed:", err);
    }
  };

  return (
    <Layout>
      <Typography variant="h2" sx={{ mb: 3 }}>Lobbies</Typography>
      {lobbies.length === 0 && (
        <Typography>No open lobbies available.</Typography>
      )}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: "16px", justifyContent: "center" }}>
        {lobbies.map((lobby) => (
          <LobbyCard
            key={lobby.lobby_id}
            host={truncateAddress(lobby.lobby_creator)}
            lobbyId={lobby.lobby_id}
            createdAt={new Date(lobby.created_at).toLocaleDateString()}
            ctaButton={
              <Button fullWidth onClick={() => handleJoin(lobby.lobby_id)}>
                Join
              </Button>
            }
          />
        ))}
      </Box>
    </Layout>
  );
};
