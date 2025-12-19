import React, { useState, useEffect, useContext } from "react";
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
} from "@mui/material";
import MainController from "@src/MainController";
import { LobbyStatus } from "@dice/utils";
import Navbar from "@src/components/Navbar";
import SearchBar from "@src/components/SearchBar";
import { AppContext } from "@src/main";
import Wrapper from "@src/components/Wrapper";
import Button from "@src/components/Button";
import { formatDate } from "@src/utils";
import { useGlobalStateContext } from "@src/GlobalStateContext";
import { IGetPaginatedUserLobbiesResult } from "@dice/db";

type Column = {
  id: keyof IGetPaginatedUserLobbiesResult | "action";
  label: string;
  minWidth: number;
};

const columns: Column[] = [
  { id: "lobby_id", label: "Lobby ID", minWidth: 50 },
  { id: "lobby_state", label: "Status", minWidth: 50 },
  { id: "created_at", label: "Created At", minWidth: 50 },
  { id: "lobby_creator", label: "Host", minWidth: 50 },
  { id: "action", label: "", minWidth: 50 },
];

const actionMap: Record<LobbyStatus, string[]> = {
  active: ["Enter"],
  finished: ["Enter"],
  open: ["Enter", "Close"],
  closed: [],
};

const ActionButton: React.FC<{ lobby: IGetPaginatedUserLobbiesResult }> = (
  props
) => {
  const mainController: MainController = useContext(AppContext);
  const {
    selectedNftState: [selectedNft],
  } = useGlobalStateContext();

  const handleLobbyAction = (
    action: string,
    status: LobbyStatus,
    lobbyId: string
  ) => {
    if (action === "Close") {
      mainController.closeLobby(selectedNft, lobbyId);
    } else if (action === "Enter") {
      mainController.moveToJoinedLobby(lobbyId);
    }
  };

  const actions = actionMap[props.lobby.lobby_state];
  if (actions == null || actions.length === 0) {
    return <></>;
  }
  return (
    <Box sx={{ display: "flex" }}>
      {actions.map((action, i) => (
        <>
          {i > 0 && <Box sx={{ marginLeft: "8px" }} />}
          <Button
            key={action}
            disabled={props.lobby.lobby_state === "closed"}
            onClick={() =>
              handleLobbyAction(
                action,
                props.lobby.lobby_state,
                props.lobby.lobby_id
              )
            }
          >
            {action}
          </Button>
        </>
      ))}
    </Box>
  );
};

const MyGames: React.FC = () => {
  const mainController: MainController = useContext(AppContext);
  const {
    selectedNftState: [selectedNft],
  } = useGlobalStateContext();

  const [lobbies, setLobbies] = useState<IGetPaginatedUserLobbiesResult[]>([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    mainController.getMyGames(selectedNft).then((lobbies) => {
      setLobbies(lobbies);
    });
  }, []);

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleLobbiesRefresh = async () => {
    const lobbies = await mainController.getMyGames(selectedNft);

    setPage(0);
    setSearchText("");
    setLobbies(lobbies);
  };

  const filteredLobbies = lobbies.filter((lobby) => {
    const rowValues = Object.values(lobby).join("");
    if (rowValues == null) return false;
    return rowValues.toLowerCase().includes(searchText.toLowerCase());
  });

  const expandValue = (
    id: keyof IGetPaginatedUserLobbiesResult,
    value: unknown
  ) => {
    if (id === "lobby_creator" && typeof value === "number") {
      return value === selectedNft ? "Yes" : "No";
    }
    if (id === "created_at" && typeof value === "string") {
      return formatDate(value);
    }
    if (typeof value === "string") {
      return value;
    }
    return null;
  };

  return (
    <>
      <Navbar>
        <SearchBar
          value={searchText}
          onRefresh={handleLobbiesRefresh}
          onSearch={setSearchText}
        />
      </Navbar>
      <Wrapper>
        <TableContainer>
          <Table stickyHeader aria-label="sticky table">
            <TableHead>
              <TableRow>
                {columns.map((column) => (
                  <TableCell
                    key={column.id}
                    align="left"
                    sx={{ minWidth: column.minWidth }}
                  >
                    {column.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredLobbies
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((lobby) => {
                  return (
                    <TableRow
                      hover
                      role="checkbox"
                      tabIndex={-1}
                      key={lobby.lobby_id}
                    >
                      {columns.map((column) => {
                        return (
                          <TableCell key={column.id} align="left">
                            {column.id === "action" ? (
                              <ActionButton lobby={lobby} />
                            ) : (
                              expandValue(column.id, lobby[column.id])
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={filteredLobbies.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(_e, newPage) => setPage(newPage)}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </Wrapper>
    </>
  );
};

export default MyGames;
