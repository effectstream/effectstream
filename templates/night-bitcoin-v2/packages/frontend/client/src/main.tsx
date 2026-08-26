// NOTE: importing onchain-runtime first ensures the wasm module is loaded
// before any other Midnight SDK code runs. This mirrors the pattern used in
// the node entry points and the evm-midnight-v2 template.
import "@midnightntwrk/onchain-runtime-v4";

import { setNetworkId, type NetworkId } from "@midnight-ntwrk/midnight-js-network-id";

// Configure the Midnight network ID once, before any wallet or contract
// operation. Without this, SDK calls throw "Network ID has not been configured".
setNetworkId(
  (import.meta.env.VITE_MIDNIGHT_NETWORK_ID as NetworkId) || "undeployed",
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
