import React from "react";
import { AppBar, Box, IconButton, styled, Button } from "@mui/material";
import { ArrowBackIos as BackIcon } from "@mui/icons-material";
import { useLocation, useNavigate } from "react-router-dom";
import { Logo } from "./Logo.tsx";
import { Card } from "./Card.tsx";
import { Container as ContainerBase } from "@mui/material";
import { useWallet } from "../contexts/WalletContext.tsx";

const ChessBar = styled(AppBar as any)(({ theme }) => ({
  borderBottom: `1px solid ${theme.palette.primary.main}`,
  backgroundColor: theme.palette.primary.dark,
}));

const Container = styled(ContainerBase)(() => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
}));

const IconCard = styled(Card)(() => ({
  display: "inline-flex",
  width: "40px",
  alignItems: "center",
  justifyContent: "center",
}));

const navigationMap: Record<string, string> = {
  "/login": "/login",
  "/": "/",
  "/create": "/",
  "/lobbies": "/",
  "/my-games": "/",
  "/game": "/my-games",
};

export const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { address, openModal, disconnect } = useWallet();

  const previousPage = navigationMap[location.pathname] || "/";
  return (
    <Box sx={{ pb: "32px" }}>
      <ChessBar position="static">
        <Container maxWidth="lg">
          <Box sx={{ flex: 2, textAlign: "left" }}>
            <IconCard>
              <IconButton
                edge="end"
                color="inherit"
                aria-label="back"
                onClick={() =>
                  previousPage ? navigate(previousPage) : navigate(-1)
                }
              >
                <BackIcon sx={{ textAlign: "center" }} />
              </IconButton>
            </IconCard>
          </Box>
          <Logo height={88} />
          <Box sx={{ flex: 2, display: "flex", justifyContent: "flex-end" }}>
            {address ? (
              <Button
                size="small"
                onClick={disconnect}
                sx={{ fontSize: "12px", padding: "4px 12px" }}
              >
                {address.slice(0, 6)}...{address.slice(-4)}
              </Button>
            ) : (
              <Button size="small" onClick={openModal} sx={{ fontSize: "12px", padding: "4px 12px" }}>
                Connect
              </Button>
            )}
          </Box>
        </Container>
      </ChessBar>
    </Box>
  );
};
