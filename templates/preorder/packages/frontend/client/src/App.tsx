import React from "react";
import { LaunchpadDetail } from "./pages/LaunchpadDetail.tsx";
import { LogProvider } from "./logs/LogContext.tsx";
import { WalletProvider } from "./wallet/WalletContext.tsx";
import { Header } from "./layout/Header.tsx";
import { ActivityLog } from "./logs/ActivityLog.tsx";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const SIDEBAR_WIDTH = 360;

export function App() {
  return (
    <LogProvider>
      <WalletProvider>
        <div data-testid="app-root" style={{
          display: "flex", height: "100vh",
          background: "#010409", color: "#e6edf3",
        }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
            <Header />
            <main style={{ flex: 1, overflowY: "auto" }}>
              <LaunchpadDetail slug="test-launchpad-1" apiUrl={API_URL} />
            </main>
          </div>
          <aside style={{ width: SIDEBAR_WIDTH, flexShrink: 0, height: "100vh" }}>
            <ActivityLog />
          </aside>
        </div>
      </WalletProvider>
    </LogProvider>
  );
}
