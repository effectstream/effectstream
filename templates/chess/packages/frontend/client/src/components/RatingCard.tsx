import React from "react";
import { Card } from "./Card.tsx";
import { Box, CircularProgress, Typography } from "@mui/material";

interface Props {
  loading?: boolean;
  rating: number | string;
  rank: number | string;
}

export const RatingCard: React.FC<Props> = ({ rank, rating, loading }) => {
  const rankLabel = rank ? `#${rank}` : "N/A";

  return (
    <Card
      blurred
      sx={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "8px 16px",
      }}
    >
      <Typography>Player ranking</Typography>
      <Box
        sx={{
          height: 72.5,
          display: "flex",
          alignItems: "center",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        {loading ? (
          <CircularProgress />
        ) : (
          <>
            <Typography sx={{ fontSize: 32 }}>{rankLabel}</Typography>
            <Typography variant="subtitle1">{`Rating: ${rating}`}</Typography>
          </>
        )}
      </Box>
    </Card>
  );
};
