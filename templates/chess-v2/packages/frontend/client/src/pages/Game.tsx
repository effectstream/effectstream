import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { Box, Typography } from "@mui/material";
import { useWallet } from "../contexts/WalletContext.tsx";
import { getLobbyState, getMatchWinner } from "../api/queries.ts";
import { submitMove } from "../api/write.ts";
import { Layout } from "../layouts/Layout.tsx";
import { Card } from "../components/Card.tsx";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";

export function Game() {
  const { lobbyID } = useParams<{ lobbyID: string }>();
  const { address, wallet } = useWallet();
  const [lobby, setLobby] = useState<any>(null);
  const [game, setGame] = useState(new Chess());
  const [winner, setWinner] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!lobbyID || submittingRef.current) return;
    const { lobby: l } = await getLobbyState(lobbyID);
    setLobby(l);
    if (l) {
      const chess = new Chess();
      chess.load(l.latest_match_state);
      setGame(chess);
    }
  }, [lobbyID]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (lobby?.lobby_state === "finished" && lobbyID) {
      getMatchWinner(lobbyID).then((r) => setWinner(r.result));
    }
  }, [lobby?.lobby_state, lobbyID]);

  if (!lobby) {
    return (
      <Layout>
        <Typography>Loading...</Typography>
      </Layout>
    );
  }

  const isMyTurn = (() => {
    if (lobby.lobby_state !== "active" || !address) return false;
    const turn = game.turn();
    if (lobby.player_one_iswhite) {
      return (turn === "w" && lobby.lobby_creator === address) ||
             (turn === "b" && lobby.player_two === address);
    }
    return (turn === "b" && lobby.lobby_creator === address) ||
           (turn === "w" && lobby.player_two === address);
  })();

  const onDrop = async (source: string, target: string) => {
    if (!isMyTurn || !lobbyID || !wallet || submitting) return false;
    const tempGame = new Chess(game.fen());
    const move = tempGame.move({ from: source, to: target, promotion: "q" });
    if (!move) return false;

    setGame(tempGame);
    setSubmitting(true);
    submittingRef.current = true;
    try {
      await submitMove(wallet, lobbyID, lobby.current_round, move.san);
    } catch (err) {
      console.error("Submit move failed:", err);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      refresh();
    }
    return true;
  };

  const orientation = (() => {
    if (!address) return "white" as const;
    if (lobby.lobby_creator === address) {
      return lobby.player_one_iswhite ? "white" as const : "black" as const;
    }
    return lobby.player_one_iswhite ? "black" as const : "white" as const;
  })();

  return (
    <Layout>
      <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "center" }}>
        <Box sx={{ maxWidth: "560px", width: "100%" }}>
          <Chessboard
            position={game.fen()}
            onPieceDrop={onDrop}
            boardOrientation={orientation}
            arePiecesDraggable={isMyTurn && !submitting}
            customDarkSquareStyle={{ backgroundColor: "#907B90" }}
            customLightSquareStyle={{ backgroundColor: "#D8E9EB" }}
          />
        </Box>
        <Box sx={{ minWidth: "200px" }}>
          <Card blurred layout>
            <Typography variant="h2">
              {lobby.lobby_state === "finished" ? "Game Over" : isMyTurn ? "Your Turn" : "Waiting..."}
            </Typography>
            <Box>
              <Typography variant="subtitle1">Round</Typography>
              <Typography>{lobby.current_round} / {lobby.num_of_rounds}</Typography>
            </Box>
            {lobby.remaining_blocks && (
              <Box>
                <Typography variant="subtitle1">Time Left</Typography>
                <Typography>W: {lobby.remaining_blocks.w} | B: {lobby.remaining_blocks.b}</Typography>
              </Box>
            )}
            <Box>
              <Typography variant="subtitle1">State</Typography>
              <Typography>{lobby.lobby_state}</Typography>
            </Box>
            {winner && (
              <Box>
                <Typography variant="subtitle1">Winner</Typography>
                <Typography>
                  {winner.player_one_result === "win"
                    ? winner.player_one_wallet.slice(0, 10) + "..."
                    : winner.player_two_result === "win"
                    ? winner.player_two_wallet.slice(0, 10) + "..."
                    : "Draw"}
                </Typography>
              </Box>
            )}
          </Card>
        </Box>
      </Box>
    </Layout>
  );
}
