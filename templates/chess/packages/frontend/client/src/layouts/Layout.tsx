import { Box, Container } from "@mui/material";
import React from "react";
import { PaimaNotice } from "../components/PaimaNotice.tsx";
import { Navbar } from "../components/Navbar.tsx";
import { Logo } from "../components/Logo.tsx";

interface Props {
  children?: React.ReactNode;
  small?: boolean;
  navbar?: boolean;
}

export const Layout: React.FC<Props> = ({ children, small, navbar = true }) => {
  return (
    <>
      {navbar ? (
        <Navbar />
      ) : (
        <Box marginBottom="40px" marginTop="24px">
          <Logo height={116} />
        </Box>
      )}
      <Container maxWidth={small ? "sm" : "lg"}>{children}</Container>
      <Box marginTop="32px">
        <PaimaNotice />
      </Box>
    </>
  );
};
