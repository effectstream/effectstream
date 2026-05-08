import React from "react";
import logo from "../../assets/images/chess_logo.png";
import { Box } from "@mui/material";

interface LogoProps {
  height?: number;
}

export const Logo: React.FC<LogoProps> = ({ height }) => {
  return (
    <Box sx={{ margin: "8px 0" }}>
      <img src={logo} alt="Chess" height={height} />
    </Box>
  );
};
