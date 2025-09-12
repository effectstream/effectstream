import React, { useMemo, useState } from "react";
import type { LobbyStatus, UserLobby } from "@chess/utils";
import { formatDate } from "../utils/index.ts";
import { LobbyCard } from "./LobbyCard.tsx";
import { LobbyToolbar } from "./LobbyToolbar.tsx";
import {
  Box,
  Button,
  IconButton,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { ArrowBackIos as ArrowBackIosIcon, ArrowForwardIos as ArrowForwardIosIcon } from "@mui/icons-material";

interface Props {
  title: string;
  lobbies: UserLobby[];
  actionMap: Partial<Record<LobbyStatus, string>>;
  onLobbySelect: (lobby: UserLobby) => void;
  onLobbySearch?: (query: string) => void;
  onLobbyRefresh: () => void;
}

export const LobbyList: React.FC<Props> = ({
  title,
  lobbies,
  actionMap,
  onLobbySelect,
  onLobbySearch,
  onLobbyRefresh,
}) => {
  const theme = useTheme();
  const isTablet = useMediaQuery(theme.breakpoints.up("md"));
  const isDesktop = useMediaQuery(theme.breakpoints.up("lg"));

  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);

  const filteredLobbies = useMemo(() => {
    if (searchQuery) {
      return lobbies.filter((lobby) => {
        // TODO: lobby ID will be enough
        const rowValues = Object.values(lobby).join("");
        if (rowValues == null) return false;
        return rowValues.toLowerCase().includes(searchQuery.toLowerCase());
      });
    }
    return lobbies;
  }, [searchQuery, lobbies]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setPage(0);
    onLobbySearch?.(query);
  };

  const handleRefresh = () => {
    setPage(0);
    setSearchQuery("");
    onLobbyRefresh();
  };

  const lobbiesPerPage = isDesktop ? 4 : isTablet ? 3 : 2;
  const totalPages = Math.ceil(filteredLobbies.length / lobbiesPerPage);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <IconButton
        onClick={() => setPage((page) => (page -= 1))}
        disabled={page === 0}
        color="inherit"
        aria-label="previous"
      >
        <ArrowBackIosIcon fontSize="large" />
      </IconButton>
      <Box sx={{ width: "100%" }}>
        <LobbyToolbar
          onSearch={handleSearch}
          onRefresh={handleRefresh}
          value={searchQuery}
          title={title}
          lobbyCount={filteredLobbies.length}
          currentPage={page}
          totalPages={totalPages}
        />
        <Box
          sx={{
            display: "flex",
            gap: "24px",
            pt: "24px",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {filteredLobbies
            .slice(
              page * lobbiesPerPage,
              page * lobbiesPerPage + lobbiesPerPage,
            )
            .map((lobby) => {
              return (
                <LobbyCard
                  key={lobby.lobby_id}
                  host={lobby.player_one_iswhite ? "White" : "Black"}
                  lobbyId={lobby.lobby_id}
                  createdAt={formatDate(lobby.created_at)}
                  myTurn={lobby.myTurn}
                  hostRating={undefined /* TODO: add this info to the lobby type */}
                  ctaButton={
                    <Button
                      disabled={lobby.lobby_state === "closed"}
                      fullWidth
                      onClick={() => onLobbySelect(lobby)}
                    >
                      {actionMap[lobby.lobby_state]}
                    </Button>
                  }
                />
              );
            })}
        </Box>
      </Box>
      <IconButton
        onClick={() => setPage((page) => (page += 1))}
        disabled={totalPages === 0 || page + 1 === totalPages}
        aria-label="next"
        color="inherit"
      >
        <ArrowForwardIosIcon fontSize="large" />
      </IconButton>
    </Box>
  );
};
