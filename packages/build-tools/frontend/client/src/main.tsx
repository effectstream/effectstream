import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
// import { grammar } from "@example/data-types";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    {/* <pre>{JSON.stringify(grammar)}</pre> */}
  </StrictMode>,
);

// {"schedule":[["tick",{"type":"integer"}],["message",{"type":"string"}]],"attack":[["playerId",{"type":"integer"}],["moveId",{"type":"integer"}]],"transfer":[["payload",{"type":"object","properties":{"to":{"type":"string"},"from":{"type":"string"},"value":{"type":"string"}},"required":["to","from","value"]}]],"switchMap":[["mapId",{"type":"string"}]]}
