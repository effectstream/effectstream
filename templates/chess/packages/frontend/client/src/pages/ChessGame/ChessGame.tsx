import React, { useContext, useEffect, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import type { LobbyState } from "@chess/utils";
import { ChessLogic, ChessService } from "./GameLogic.ts";

import type { MainController } from "../../MainController.ts";
import { AppContext } from "../../main.tsx";
import { Layout } from "../../layouts/Layout.tsx";
import { blocksToSeconds, delay, isTickEvent } from "../../utils/index.ts";
import { Card } from "../../components/Card.tsx";
import { useSearchParams } from "react-router-dom";
import { Timer } from "../../components/Timer.tsx";
import { PromotionList } from "../../components/PromotionList.tsx";
import { ChessBoard } from "./ChessBoard.tsx";
import type { Color } from "chess.js";
import { BLACK, Chess, WHITE } from "chess.js";
import { paimaEngineConfig } from "../../PaimaEngineConfig.ts";

interface Props {
  lobby: LobbyState | null;
}

const LOBBY_REFRESH_INTERVAL = 5 * 1000;

const getTimer = (color: Color, lobbyState: LobbyState) => {
  const whiteStarts = lobbyState.player_one_iswhite;

  if (color === WHITE) {
    return {
      player: whiteStarts ? lobbyState.lobby_creator : lobbyState.player_two,
      blockchainTime: blocksToSeconds(lobbyState.remaining_blocks.w),
    };
  }

  if (color === BLACK) {
    return {
      player: whiteStarts ? lobbyState.player_two : lobbyState.lobby_creator,
      blockchainTime: blocksToSeconds(lobbyState.remaining_blocks.b),
    };
  }
};

export const ChessGame: React.FC<Props> = ({ lobby }) => {
  const [params] = useSearchParams();
  const lobbyID = params.get("lobby") || "";

  const mainController: MainController = useContext(
    AppContext,
  ) as unknown as MainController;
  const chessLogic = new ChessLogic(mainController.userAddress ?? "");

  const [waitingConfirmation, setWaitingConfirmation] = useState(false);
  const [replayInProgress, setReplayInProgress] = useState(false);
  // TODO: this should be internal variable in ChessBoard and not utilizing useState since it's mutable. once lobbyState?.latest_match_state is the source of truth
  const [game, setGame] = useState(new Chess());
  const [promotionPreference, setPromotionPreference] = useState("q");
  const [lobbyState, setLobbyState] = useState<LobbyState | null>(lobby);

  const theme = useTheme();
  const isMediumScreen = useMediaQuery(theme.breakpoints.down("md"));
  useEffect(() => {
    const board = lobbyState?.latest_match_state;
    if (!board) return;
    setGame(new Chess(board));
  }, [lobbyState?.latest_match_state]);

  useEffect(() => {
    const fetchLobby = async () => {
      const lobbyState = await mainController.loadLobbyState(lobbyID);
      if (lobbyState == null) return;

      const isJoinable = lobbyState.lobby_state === "open" &&
        lobbyState.lobby_creator !== mainController.userAddress;
      if (isJoinable) {
        await mainController.joinLobby(lobbyID);
      } else {
        setLobbyState(lobbyState);
      }
    };

    if (!lobby) {
      fetchLobby();
    } else {
      setGame(new Chess(lobby.latest_match_state));
    }
  }, [lobby, lobbyID]);

  useEffect(() => {
    const fetchLobbyData = async () => {
      if (waitingConfirmation || replayInProgress) return;
      const lobbyState = await ChessService.getLobbyState(
        lobbyID,
      );
      if (lobbyState == null) return;
      setLobbyState((old) => {
        return old && old.current_round > lobbyState.current_round
          ? old
          : lobbyState;
      });
    };

    if (lobbyState?.lobby_state === "finished") return;
    const timer = setInterval(fetchLobbyData, LOBBY_REFRESH_INTERVAL);
    return () => {
      clearInterval(timer);
    };
  }, [waitingConfirmation, replayInProgress, lobbyID, lobbyState?.lobby_state]);

  async function handleMove(move: string): Promise<void> {
    setWaitingConfirmation(true);
    game.move(move);
    const newLobbyState = await chessLogic.handleMove(
      mainController.wallet!,
      paimaEngineConfig,
      lobbyState!,
      move,
    );
    if (newLobbyState != null) {
      setLobbyState(newLobbyState);
    } else {
      game.undo();
    }
    setWaitingConfirmation(false);
  }

  const handleReplay = async () => {
    setReplayInProgress(true);
    const matchExecutor = await mainController.getMatchExecutor(lobbyID);
    const localGame = new Chess(matchExecutor.currentState.fenBoard);
    setGame(localGame);
    let events = matchExecutor.tick();
    while (events != null) {
      // chess always has only one relevant event
      const event = events[0];
      // process emitted event (could also just use current state in this instance, this is for demonstration)
      if (isTickEvent(event)) {
        await delay(1000);
        localGame.move(event.pgn_move);
        setGame(new Chess(localGame.fen()));
      }
      events = matchExecutor.tick();
    }
    setReplayInProgress(false);
  };

  // TODO: graceful loader
  if (!lobbyState) return null;

  const isActiveGame = lobbyState != null &&
    lobbyState.lobby_state === "active" && !replayInProgress;
  const interactionEnabled = isActiveGame &&
    !waitingConfirmation &&
    chessLogic.isThisPlayersTurn(lobbyState, game);

  const blackTimerRunning = isActiveGame &&
    ((game.turn() === "b" && !waitingConfirmation) ||
      (game.turn() === "w" && waitingConfirmation));
  const whiteTimerRunning = isActiveGame &&
    ((game.turn() === "w" && !waitingConfirmation) ||
      (game.turn() === "b" && waitingConfirmation));

  const WhiteTimer = (
    <Timer
      isRunning={whiteTimerRunning}
      {...getTimer("w", lobbyState)}
    />
  );
  const BlackTimer = (
    <Timer
      isRunning={blackTimerRunning}
      {...getTimer("b", lobbyState)}
    />
  );

  const content = (
    <Card layout>
      <Box>
        <Typography variant="h2">
          Chess Board{" "}
          <Box textTransform="none" component="span">
            {lobbyState.lobby_id}
          </Box>
        </Typography>
        {waitingConfirmation
          ? (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Typography>Waiting for confirmation</Typography>
              <CircularProgress size={20} sx={{ ml: 2 }} />
            </Box>
          )
          : (
            <Typography>
              {chessLogic.gameStateText(lobbyState, game)}
            </Typography>
          )}
      </Box>
      <ChessBoard
        arePiecesDraggable={interactionEnabled}
        board={game.fen()}
        playerColor={chessLogic.thisPlayerColor(lobbyState) === "b"
          ? "black"
          : "white"}
        promotion={promotionPreference}
        handleMove={handleMove}
      />
      {isActiveGame && (
        <PromotionList
          onValueChange={setPromotionPreference}
          value={promotionPreference}
          color={chessLogic.thisPlayerColor(lobbyState)}
        />
      )}
      {lobbyState.lobby_state === "finished" && (
        <Button disabled={replayInProgress} onClick={handleReplay} fullWidth>
          Replay
        </Button>
      )}
    </Card>
  );

  const YourTimer = chessLogic.thisPlayerColor(lobbyState) === "b"
    ? BlackTimer
    : WhiteTimer;
  const OpponentTimer = chessLogic.thisPlayerColor(lobbyState) === "b"
    ? WhiteTimer
    : BlackTimer;
  return (
    <Layout>
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          gap: "24px",
          flexDirection: isMediumScreen ? "column" : "row",
        }}
      >
        {lobbyState.lobby_state !== "finished" && (
          <Box sx={{ alignSelf: isMediumScreen ? "initial" : "flex-end" }}>
            {isMediumScreen ? OpponentTimer : YourTimer}
          </Box>
        )}
        {content}
        {lobbyState.lobby_state !== "finished" && (
          <Box sx={{ alignSelf: isMediumScreen ? "initial" : "flex-start" }}>
            {isMediumScreen ? YourTimer : OpponentTimer}
          </Box>
        )}
      </Box>
    </Layout>
  );
};
