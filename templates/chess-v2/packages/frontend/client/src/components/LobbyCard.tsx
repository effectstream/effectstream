import React from "react";
import background from "../../assets/images/game.png";
import "./LobbyCard.scss";
import { Box, Typography } from "@mui/material";
import { Card } from "./Card.tsx";

interface Props {
  ctaButton: React.ReactNode;
  host: string;
  lobbyId: string;
  createdAt: string;
  myTurn?: boolean;
}

export const LobbyCard: React.FC<Props> = ({
  ctaButton,
  host,
  lobbyId,
  createdAt,
  myTurn,
}) => {
  return (
    <Card blurred className="lobby-card">
      <img className="lobby-card__image" src={background} alt="Lobby" />
      <div className="lobby-card__content">
        <div className="lobby-card__cta-button">{ctaButton}</div>
        {myTurn !== undefined && (
          <Box>
            <Typography variant="subtitle1">My Turn?</Typography>
            <Typography>{myTurn ? "Yes" : "No"}</Typography>
          </Box>
        )}
        <Box>
          <Typography variant="subtitle1">Host</Typography>
          <Typography>{host}</Typography>
        </Box>
        <Box>
          <Typography variant="subtitle1">Lobby ID</Typography>
          <Typography>{lobbyId}</Typography>
        </Box>
        <Box>
          <Typography variant="subtitle1">Created At</Typography>
          <Typography>{createdAt}</Typography>
        </Box>
      </div>
    </Card>
  );
};
