import React, { useContext, useEffect, useState } from "react";
import type { LobbyStateQuery } from "@chess/utils";
import type { MainController } from "../MainController.ts";
import { AppContext } from "../main.tsx";
import { Layout } from "../layouts/Layout.tsx";
import { LobbyList } from "../components/LobbyList.tsx";

export const OpenLobbies: React.FC = () => {
  const mainController: MainController = useContext(
    AppContext,
  ) as unknown as MainController;

  const [lobbies, setLobbies] = useState<LobbyStateQuery[]>([]);

  useEffect(() => {
    mainController.getOpenLobbies().then((lobbies) => {
      setLobbies(lobbies);
    });
  }, []);

  const handleLobbyRefresh = async () => {
    const lobbies = await mainController.getOpenLobbies();
    setLobbies(lobbies);
  };

  const searchForHiddenLobby = async (query: string) => {
    const results = await mainController.searchLobby(query, 0);
    if (results == null || results.length === 0) return;
    const newLobbies = results.filter(
      (result) => !lobbies.some((lobby) => lobby.lobby_id === result.lobby_id),
    );
    setLobbies([...lobbies, ...newLobbies]);
  };

  return (
    <Layout>
      <LobbyList
        title="Lobbies"
        lobbies={lobbies}
        onLobbyRefresh={handleLobbyRefresh}
        onLobbySelect={(lobby: any) => mainController.joinLobby(lobby.lobby_id)}
        onLobbySearch={searchForHiddenLobby}
        actionMap={{
          open: "Enter",
        }}
      />
    </Layout>
  );
};
