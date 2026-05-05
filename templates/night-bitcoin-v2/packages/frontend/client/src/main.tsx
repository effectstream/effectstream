// NOTE: importing onchain-runtime first ensures the wasm module is loaded
// before any other Midnight SDK code runs. This mirrors the pattern used in
// the node entry points and the evm-midnight-v2 template.
import "@midnight-ntwrk/onchain-runtime";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
