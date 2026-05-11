import { Routes, Route } from "react-router-dom";
import { Box } from "@mui/material";
import { useWallet } from "./contexts/WalletContext.tsx";
import { WalletModal } from "./components/WalletModal.tsx";
import { Login } from "./pages/Login.tsx";
import { MainMenu } from "./pages/MainMenu.tsx";
import { OpenLobbies } from "./pages/OpenLobbies.tsx";
import { MyGames } from "./pages/MyGames.tsx";
import { CreateLobby } from "./pages/CreateLobby.tsx";
import { Game } from "./pages/Game.tsx";

function App() {
  const { isModalOpen, closeModal } = useWallet();

  return (
    <Box>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<MainMenu />} />
        <Route path="/create" element={<CreateLobby />} />
        <Route path="/lobbies" element={<OpenLobbies />} />
        <Route path="/my-games" element={<MyGames />} />
        <Route path="/game/:lobbyID" element={<Game />} />
      </Routes>
      {isModalOpen && <WalletModal onClose={closeModal} />}
    </Box>
  );
}

export default App;
