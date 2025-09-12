import React, { useContext, useEffect, useState } from "react";
import type { MainController } from "../MainController.ts";
import type { UserLobby } from "@chess/utils";
import { AppContext } from "../main.tsx";
import { Layout } from "../layouts/Layout.tsx";
import { LobbyList } from "../components/LobbyList.tsx";

export const MyGames: React.FC = () => {
  const mainController: MainController = useContext(
    AppContext,
  ) as unknown as MainController;

  const [lobbies, setLobbies] = useState<UserLobby[]>([]);

  useEffect(() => {
    mainController.getMyGames().then((lobbies) => {
      setLobbies(lobbies);
    });
  }, []);

  const handleLobbyRefresh = async () => {
    const lobbies = await mainController.getMyGames();
    setLobbies(lobbies);
  };

  const handleLobbyAction = ({ lobby_id, lobby_state }: UserLobby) => {
    if (lobby_state === "open") {
      mainController.closeLobby(lobby_id);
    } else {
      mainController.moveToJoinedLobby(lobby_id);
    }
  };

  return (
    <Layout>
      <LobbyList
        title="My Games"
        lobbies={lobbies}
        onLobbySelect={handleLobbyAction}
        onLobbyRefresh={handleLobbyRefresh}
        actionMap={{
          open: "Close",
          active: "Continue",
          finished: "Replay",
          closed: "Closed",
        }}
      />
    </Layout>
  );
};
