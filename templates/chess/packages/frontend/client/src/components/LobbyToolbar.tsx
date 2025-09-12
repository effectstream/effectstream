import React from "react";

import { Box, Typography, useTheme } from "@mui/material";
import SearchBar from "./SearchBar";

interface Props {
  title: string;
  lobbyCount: number;
  currentPage: number;
  totalPages: number;
  onSearch: (query: string) => void;
  onRefresh: () => void;
  value?: string;
}

export const LobbyToolbar: React.FC<Props> = ({
  title,
  lobbyCount,
  currentPage,
  totalPages,
  onSearch,
  onRefresh,
  value,
}) => {
  const theme = useTheme();
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Box sx={{ flex: 2 }}>
        <Typography variant="h2" textAlign="left">
          {title}{" "}
          <Box color={theme.palette.primary.contrastText} component="span">
            ({lobbyCount})
          </Box>
        </Typography>
      </Box>
      <SearchBar value={value} onSearch={onSearch} onRefresh={onRefresh} />
      <Box sx={{ flex: 2 }}>
        {lobbyCount !== 0 && (
          <Typography textAlign="right">
            {currentPage + 1} of {totalPages}
          </Typography>
        )}
      </Box>
    </Box>
  );
};
