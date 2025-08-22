import React from "react";
import { AppBar } from "@mui/material";
import { Box } from "@mui/material";
import { IconButton, styled } from "@mui/material";
import { ArrowBackIos as BackIcon } from "@mui/icons-material";
import { useLocation, useNavigate } from "react-router-dom";
import { Logo } from "./Logo.tsx";
import { Card } from "./Card.tsx";
import { Container as ContainerBase } from "@mui/material";
import { Page } from "../MainController.ts";

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

const navigationMap: Record<Page, Page> = {
  [Page.Login]: Page.Login,
  [Page.MainMenu]: Page.MainMenu,
  [Page.CreateLobby]: Page.MainMenu,
  [Page.OpenLobbies]: Page.MainMenu,
  [Page.MyGames]: Page.MainMenu,
  [Page.Game]: Page.MyGames,
};

export const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const previousPage = navigationMap[location.pathname as Page];
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
          <Box sx={{ flex: 2 }} />
        </Container>
      </ChessBar>
    </Box>
  );
};
