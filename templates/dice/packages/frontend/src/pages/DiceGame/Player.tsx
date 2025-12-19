import React, { Ref } from "react";
import "./DiceGame.scss";
import { Box, Typography } from "@mui/material";
import Button from "@src/components/Button";
import { Dice, DiceRef } from "./Dice";
import { LobbyPlayer } from "@dice/utils";

export type PlayerProps = {
  lobbyPlayer: LobbyPlayer;
  thisClientPlayer: number;
  turn: number;
  diceRef: Ref<DiceRef>;
  onRoll: undefined | (() => void);
  onPass: undefined | (() => void);
};

export default function Player({
  lobbyPlayer,
  thisClientPlayer,
  turn,
  diceRef,
  onRoll,
  onPass,
}: PlayerProps): React.ReactElement {
  const isMeThisClient = lobbyPlayer.nftId === thisClientPlayer;
  const isMyTurn = lobbyPlayer.turn === turn;

  return (
    <Box
      sx={{
        flex: 1,
        padding: 2,
        background: isMyTurn
          ? "rgba(219, 109, 104, 0.5)"
          : "rgba(119, 109, 104, 0.5)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <Typography
        variant="caption"
        sx={{
          fontSize: "1rem",
          lineHeight: "1.5rem",
        }}
      >
        {isMeThisClient ? "You" : "Opponent"}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          fontSize: "1.25rem",
          lineHeight: "1.75rem",
        }}
      >
        Points: {lobbyPlayer.points}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          fontSize: "1.25rem",
          lineHeight: "1.75rem",
        }}
      >
        Score: {lobbyPlayer.score}
      </Typography>
      <Dice
        ref={diceRef}
        disableIndividual
        faceColor="#A51C3E"
        dotColor="#FFEEEE"
      />
      {isMeThisClient && (
        <Box
          sx={{
            display: "flex",
            gap: 1,
          }}
        >
          {onRoll == null && onPass != null ? (
            <Button onClick={onPass}>end turn</Button>
          ) : (
            <>
              <Button disabled={onRoll == null} onClick={onRoll}>
                roll
              </Button>
              <Button disabled={onPass == null} onClick={onPass}>
                pass
              </Button>
            </>
          )}
        </Box>
      )}
    </Box>
  );
}
