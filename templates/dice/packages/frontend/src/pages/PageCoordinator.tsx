import React, { useState, useEffect, useContext } from "react";
import MainController, { Page } from "@src/MainController";
import LandingPage from "./Landing";
import MainMenu from "./MainMenu";
import OpenLobbies from "./OpenLobbies";
import MyGames from "./MyGames";
import CreateLobby from "./CreateLobby";
import { Routes, Route, useNavigate } from "react-router-dom";
import { LobbyState } from "@dice/utils";
import "./PageCoordinator.scss";
import { AppContext } from "@src/main";
import { Lobby } from "./DiceGame/Lobby";
import { useGlobalStateContext } from "@src/GlobalStateContext";
import { IGetLobbyByIdResult } from "@dice/db";

const PageCoordinator: React.FC = () => {
  const mainController: MainController = useContext(AppContext);
  const {
    selectedNftState: [selectedNft],
  } = useGlobalStateContext();
  const navigate = useNavigate();

  const [lobby, setLobby] = useState<IGetLobbyByIdResult>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    mainController.callback = (
      newPage: Page | null,
      isLoading: boolean,
      extraData: IGetLobbyByIdResult | null
    ) => {
      // Update the local state and show a message to the user
      setLoading(isLoading);
      if (newPage === Page.Game) {
        setLobby(extraData);
      }
      if (newPage) {
        navigate(newPage);
      }
    };
  }, []);

  return (
    <div className="dice-app">
      <Routes>
        <Route path={Page.MainMenu} element={<MainMenu />} />
        <Route path={Page.OpenLobbies} element={<OpenLobbies />} />
        <Route path={Page.MyGames} element={<MyGames />} />
        <Route
          path={Page.Game}
          element={<Lobby initialLobbyRaw={lobby} selectedNft={selectedNft} />}
        />
        <Route path={Page.CreateLobby} element={<CreateLobby />} />
        <Route path={Page.Landing} element={<LandingPage />} />
        <Route element={<div>There was something wrong...</div>} />
      </Routes>
    </div>
  );
};

export default PageCoordinator;
