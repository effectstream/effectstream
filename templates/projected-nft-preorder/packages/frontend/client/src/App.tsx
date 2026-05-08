import React, { useState, useCallback, useEffect } from "react";
import LockPage from "./pages/LockPage.tsx";
import LogPanel, { createLogEntry, type LogEntry } from "./components/LogPanel.tsx";
import WalletConnectModal from "./components/WalletConnectModal.tsx";
import TxConfirmModal, { type TxRequest } from "./components/TxConfirmModal.tsx";
import {
  connectLucidWallet,
  connectCIP30Wallet,
  requestFaucet,
  waitForUtxos,
  getSavedSeed,
  clearSavedSeed,
  getCachedWallet,
  type WalletInfo,
} from "./cardano/wallet.ts";
import { truncateAddress } from "./utils.ts";
import { colors, fonts, btn as btnStyle } from "./styles.ts";

export interface WalletState {
  connected: boolean;
  type: "lucid" | "cip30" | null;
  address?: string;
  paymentCredential?: string;
  walletInfo?: WalletInfo;
}

export default function App() {
  const [wallet, setWallet] = useState<WalletState>({ connected: false, type: null });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [txRequest, setTxRequest] = useState<TxRequest | null>(null);

  const addLog = useCallback((message: string, type?: LogEntry["type"]) => {
    setLogs((prev) => [...prev, createLogEntry(message, type)]);
  }, []);

  const requestTx = useCallback((req: Omit<TxRequest, "onCancel">) => {
    return new Promise<void>((resolve, reject) => {
      setTxRequest({
        ...req,
        onConfirm: async () => {
          try {
            await req.onConfirm();
            resolve();
          } catch (e) {
            reject(e);
          } finally {
            setTxRequest(null);
          }
        },
        onCancel: () => {
          setTxRequest(null);
          reject(new Error("Cancelled"));
        },
      });
    });
  }, []);

  useEffect(() => {
    const saved = getSavedSeed();
    if (saved && !wallet.connected) {
      handleConnectLucid().catch(() => {});
    }
  }, []);

  const handleConnectLucid = async () => {
    addLog("Generating dev wallet...");
    const savedSeed = getSavedSeed();
    const info = await connectLucidWallet(savedSeed || undefined);
    addLog(`Wallet address: ${truncateAddress(info.address)}`, "success");

    if (!savedSeed) {
      addLog("Requesting faucet funds (10,000 ADA)...");
      await requestFaucet(info.address);
      addLog("Waiting for UTxOs to appear...");
      await waitForUtxos(info.lucid, info.address);
      addLog("Wallet funded and ready", "success");
    }

    setWallet({
      connected: true,
      type: "lucid",
      address: info.address,
      paymentCredential: info.paymentCredential,
      walletInfo: info,
    });
    setShowWalletModal(false);
  };

  const handleConnectCIP30 = async (walletKey: string) => {
    addLog(`Connecting to ${walletKey}...`);
    const info = await connectCIP30Wallet(walletKey);
    addLog(`CIP-30 wallet connected: ${truncateAddress(info.address)}`, "success");

    setWallet({
      connected: true,
      type: "cip30",
      address: info.address,
      paymentCredential: info.paymentCredential,
      walletInfo: info,
    });
    setShowWalletModal(false);
  };

  const handleDisconnect = () => {
    clearSavedSeed();
    setWallet({ connected: false, type: null });
    addLog("Wallet disconnected");
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: fonts.sans, background: colors.bg, color: colors.text }}>
      <div style={{ flex: "1 1 65%", display: "flex", flexDirection: "column", minWidth: 0, overflow: "auto" }}>
        {/* Header */}
        <header
          data-testid="header"
          style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "1rem 1.5rem", borderBottom: `1px solid ${colors.cardBorder}`, flexShrink: 0,
          }}
        >
          <h1 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0 }}>Projected NFT Pre-Order</h1>

          {wallet.connected && wallet.address ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <span data-testid="wallet-badge" style={{
                fontSize: "0.65rem", padding: "0.15rem 0.5rem", borderRadius: 999, fontWeight: 600,
                background: "rgba(59,130,246,0.15)", color: colors.primary, letterSpacing: "0.03em",
              }}>
                {wallet.type === "cip30" ? "CIP-30" : "DEV"}
              </span>
              <span data-testid="wallet-address" style={{ fontSize: "0.82rem", color: colors.textDim, fontFamily: fonts.mono }}>
                {truncateAddress(wallet.address)}
              </span>
              <button
                data-testid="disconnect-btn"
                onClick={handleDisconnect}
                style={{
                  ...btnStyle("transparent"), color: colors.muted, fontSize: "0.75rem",
                  padding: "0.2rem 0.5rem", border: `1px solid ${colors.cardBorder}`,
                }}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              data-testid="connect-wallet-btn"
              onClick={() => setShowWalletModal(true)}
              style={{ ...btnStyle(colors.primary), fontSize: "0.85rem" }}
            >
              Connect Wallet
            </button>
          )}
        </header>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: "1.5rem" }}>
          <LockPage wallet={wallet} addLog={addLog} requestTx={requestTx} />
        </div>
      </div>

      {/* Log panel */}
      <div style={{ flex: "0 0 35%", maxWidth: 420, minWidth: 280 }}>
        <LogPanel entries={logs} />
      </div>

      {showWalletModal && (
        <WalletConnectModal
          onConnectLucid={handleConnectLucid}
          onConnectCIP30={handleConnectCIP30}
          onClose={() => setShowWalletModal(false)}
        />
      )}

      {txRequest && <TxConfirmModal request={txRequest} />}
    </div>
  );
}
