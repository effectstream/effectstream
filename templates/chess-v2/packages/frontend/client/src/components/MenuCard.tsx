import React from "react";
import "./MenuCard.scss";
import { Button, Typography } from "@mui/material";
import { Card } from "./Card.tsx";

interface Props {
  onClick?: () => void;
  title: string;
  background: string;
}

export const MenuCard: React.FC<Props> = ({ onClick, title, background }) => {
  return (
    <Card className="menu-card">
      <img className="menu-card__image" src={background} alt={title} />
      <div className="menu-card__content">
        <Typography variant="h2">{title}</Typography>
        <Button onClick={onClick}>{title}</Button>
      </div>
    </Card>
  );
};
