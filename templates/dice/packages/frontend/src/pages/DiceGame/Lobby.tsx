import React, { Ref, useEffect, useMemo, useRef, useState } from "react";
import "./Lobby.scss";
import { Box, CircularProgress, Typography } from "@mui/material";
import type { LobbyState } from "@dice/utils";
import Navbar from "@src/components/Navbar";
import Wrapper from "@src/components/Wrapper";
import { DiceService } from "./GameLogic";
import DiceGame from "./DiceGame";
import { IGetLobbyByIdResult } from "@dice/db";

export function Lobby({
  initialLobbyRaw,
  selectedNft,
}: {
  initialLobbyRaw: undefined | IGetLobbyByIdResult;
  selectedNft: number;
}): React.ReactElement {
  const [lobbyState, setLobbyState] = useState<LobbyState>();

  useEffect(() => {
    const fetchLobbyData = async () => {
      if (initialLobbyRaw == null) return;

      const newLobbyState = await DiceService.getLobbyState(
        initialLobbyRaw.lobby_id
      );
      if (newLobbyState == null) return;
      setLobbyState(newLobbyState);
    };

    // Fetch data every 5 seconds
    const intervalIdLobby = setInterval(fetchLobbyData, 5 * 1000);

    // Clean up the interval when component unmounts
    return () => {
      clearInterval(intervalIdLobby);
    };
  }, [lobbyState]);

  if (initialLobbyRaw == null) return <></>;

  return (
    <>
      <Navbar />
      <Wrapper small blurred={false}>
        <Typography variant="h1">Lobby {initialLobbyRaw.lobby_id}</Typography>
        {lobbyState == null && (
          <>
            <div>
              Waiting for another player
              <span className="loading-text">...</span>
            </div>
          </>
        )}
        {lobbyState != null && (
          <DiceGame
            lobbyState={lobbyState}
            selectedNft={selectedNft}
            refetchLobbyState={async () => {
              const response = await DiceService.getLobbyState(
                initialLobbyRaw.lobby_id
              );
              if (response == null) return;
              setLobbyState(response);
            }}
          />
        )}
      </Wrapper>
    </>
  );
}
