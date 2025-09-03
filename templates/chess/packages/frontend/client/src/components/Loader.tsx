import React from "react";

import { CircularProgress, styled } from "@mui/material";

const Overlay = styled("div")(() => ({
  position: "fixed",
  width: "100%",
  height: "100%",
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}));

const Loader: React.FC = () => {
  return (
    <Overlay>
      <CircularProgress sx={{ ml: 2 }} />
    </Overlay>
  );
};

export default Loader;
