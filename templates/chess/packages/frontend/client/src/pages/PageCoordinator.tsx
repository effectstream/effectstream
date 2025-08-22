import React, { useContext, useEffect, useState } from "react";
import type { MainController } from "../MainController.ts";
import { Page } from "../MainController.ts";
import { Login } from "./Login.tsx";
import { MainMenu } from "./MainMenu.tsx";
import { OpenLobbies } from "./OpenLobbies.tsx";
import { MyGames } from "./MyGames.tsx";
import { ChessGame } from "./ChessGame/ChessGame.tsx";
import { CreateLobby } from "./CreateLobby.tsx";
import { Box } from "@mui/material";
import { Route, Routes, useNavigate } from "react-router-dom";
import type { LobbyState } from "@chess/utils";
import { AppContext } from "../main.tsx";
import Loader from "../components/Loader.tsx";
import { ProtectedRoute } from "./ProtectedRoute.tsx";

export const PageCoordinator: React.FC = () => {
  const mainController: MainController = useContext(
    AppContext,
  ) as unknown as MainController;
  const navigate = useNavigate();

  const [lobby, setLobby] = useState<LobbyState>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    mainController.callback = (
      newPage: Page | null,
      isLoading: boolean,
      extraData: LobbyState | null,
    ) => {
      // Update the local state and show a message to the user
      setLoading(isLoading);
      if (newPage === Page.Game) {
        setLobby(extraData);
        navigate(`${newPage}?lobby=${extraData.lobby_id}`);
      } else if (newPage) {
        navigate(newPage);
      }
    };
  }, []);

  return (
    <Box>
      {loading && <Loader />}
      <Routes>
        <Route path={Page.Login} element={<Login />} />
        <Route
          element={
            <ProtectedRoute walletAddress={mainController.userAddress} />
          }
        >
          <Route path={Page.MainMenu} element={<MainMenu />} />
          <Route path={Page.CreateLobby} element={<CreateLobby />} />
          <Route path={Page.OpenLobbies} element={<OpenLobbies />} />
          <Route path={Page.MyGames} element={<MyGames />} />
          <Route path={Page.Game} element={<ChessGame lobby={lobby} />} />
        </Route>
        <Route element={<div>There was something wrong...</div>} />
      </Routes>
    </Box>
  );
};
