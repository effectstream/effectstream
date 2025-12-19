import React, { useState, useEffect, useContext } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
} from "@mui/material";
import MainController from "@src/MainController";
import { LobbyState } from "@dice/utils";
import Navbar from "@src/components/Navbar";
import SearchBar from "@src/components/SearchBar";
import { AppContext } from "@src/main";
import Wrapper from "@src/components/Wrapper";
import Button from "@src/components/Button";
import { formatDate } from "@src/utils";
import { useGlobalStateContext } from "@src/GlobalStateContext";

type Column = {
  id: keyof LobbyState | "action";
  label: string;
  minWidth: number;
};

const columns: Column[] = [
  { id: "lobby_id", label: "Lobby ID", minWidth: 50 },
  { id: "created_at", label: "Created At", minWidth: 50 },
  { id: "action", label: "", minWidth: 50 },
];

const expandValue = (id: keyof LobbyState, value: unknown) => {
  if (id === "created_at" && typeof value === "string") {
    return formatDate(value);
  }
  if (typeof value === "string") {
    return value;
  }
  return null;
};

const OpenLobbies: React.FC = () => {
  const mainController: MainController = useContext(AppContext);
  const {
    selectedNftState: [selectedNft],
  } = useGlobalStateContext();
  const [lobbies, setLobbies] = useState<LobbyState[]>([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    mainController.getOpenLobbies(selectedNft).then((lobbies) => {
      setLobbies(lobbies);
    });
  }, []);

  const handleSearchTextChange = (query: string) => {
    setSearchText(query);
    searchForHiddenLobby(query);
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const searchForHiddenLobby = async (query: string) => {
    const results = await mainController.searchLobby(selectedNft, query, 0);
    if (results == null || results.length === 0) return;
    const newLobbies = results.filter(
      (result) => !lobbies.some((lobby) => lobby.lobby_id === result.lobby_id)
    );
    setLobbies([...lobbies, ...newLobbies]);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleLobbiesRefresh = async () => {
    const lobbies = await mainController.getOpenLobbies(selectedNft);

    setPage(0);
    setSearchText("");
    setLobbies(lobbies);
  };

  const filteredLobbies = lobbies.filter((lobby) => {
    const rowValues = Object.values(lobby).join("");
    if (rowValues == null) return false;
    return rowValues.toLowerCase().includes(searchText.toLowerCase());
  });

  return (
    <>
      <Navbar>
        <SearchBar
          value={searchText}
          onRefresh={handleLobbiesRefresh}
          onSearch={handleSearchTextChange}
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
                    align={"left"}
                    style={{ minWidth: column.minWidth }}
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
                              <Button
                                onClick={() =>
                                  mainController.joinLobby(
                                    selectedNft,
                                    lobby.lobby_id
                                  )
                                }
                              >
                                Enter
                              </Button>
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
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </Wrapper>
    </>
  );
};

export default OpenLobbies;
