import React from "react";
import { LaunchpadDetail } from "./pages/LaunchpadDetail.tsx";
import { AdminPanel } from "./pages/AdminPanel.tsx";
import { LogProvider } from "./logs/LogContext.tsx";
import { WalletProvider } from "./wallet/WalletContext.tsx";
import { Header } from "./layout/Header.tsx";
import { ActivityLog } from "./logs/ActivityLog.tsx";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const SIDEBAR_WIDTH = 360;

export function App() {
  // Simple path-based routing: /admin → admin console, everything else → the launchpad.
  const isAdmin =
    typeof window !== "undefined" &&
    window.location.pathname.replace(/\/+$/, "").endsWith("/admin");

  // Referral link params: ?type=evm|cardano (filters the wallet options) & ?ref=<referrer>.
  const params = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();
  const rawType = params.get("type");
  const walletType: "evm" | "cardano" | undefined =
    rawType === "evm" ? "evm" : rawType === "cardano" ? "cardano" : undefined;
  const referrer = params.get("ref") ?? undefined;

  return (
    <LogProvider>
      <WalletProvider>
        <div data-testid="app-root" style={{
          display: "flex", height: "100vh",
          background: "#010409", color: "#e6edf3",
        }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
            <Header walletType={walletType} />
            <main style={{ flex: 1, overflowY: "auto" }}>
              {isAdmin ? (
                <AdminPanel apiUrl={API_URL} />
              ) : (
                <LaunchpadDetail slug="test-launchpad-1" apiUrl={API_URL} referrer={referrer} walletType={walletType} />
              )}
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
