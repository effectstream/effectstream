import React, { createContext } from "react";
import { createRoot } from "react-dom/client";
import { PageCoordinator } from "./pages/PageCoordinator.tsx";
import { MainController } from "./MainController.ts";
import { BrowserRouter } from "react-router-dom";
import { createTheme, ThemeProvider } from "@mui/material";
import { theme } from "./theme.ts";

import "./main.scss";

console.log("[ERWT]: Renderer execution started");
export const AppContext = createContext(null);
const mainController = new MainController();

// Application to Render
const app = (
  <ThemeProvider theme={theme}>
    <BrowserRouter>
      <AppContext.Provider value={mainController}>
        <PageCoordinator />
      </AppContext.Provider>
    </BrowserRouter>
  </ThemeProvider>
);

// Render application in DOM
createRoot(document.getElementById("app")).render(app);
