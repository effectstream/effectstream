import React, { useState } from "react";
import { colors, fonts, btn as btnStyle } from "../styles.ts";
import { detectWallets } from "../cip30.ts";

type WalletMode = "choose" | "lucid-connecting" | "cip30-list";

interface Props {
  onConnectLucid: () => Promise<void>;
  onConnectCIP30: (walletKey: string) => Promise<void>;
  onClose: () => void;
}

export default function WalletConnectModal({ onConnectLucid, onConnectCIP30, onClose }: Props) {
  const [mode, setMode] = useState<WalletMode>("choose");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const handleLucid = async () => {
    setMode("lucid-connecting");
    setError("");
    setStatus("Generating wallet...");
    try {
      await onConnectLucid();
    } catch (e: any) {
      setError(e.message);
      setMode("choose");
    }
  };

  const handleCIP30 = async (key: string) => {
    setError("");
    setStatus(`Connecting to ${key}...`);
    try {
      await onConnectCIP30(key);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const detectedWallets = detectWallets();

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: colors.modalOverlay, backdropFilter: "blur(4px)",
    }}>
      <div style={{
        background: colors.cardBg, border: `1px solid ${colors.cardBorder}`,
        borderTop: `3px solid ${colors.primary}`, borderRadius: 10,
        padding: "1.5rem", width: 440, maxWidth: "90vw", fontFamily: fonts.sans,
      }}>
        <div style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "1rem" }}>
          Connect Wallet
        </div>

        {error && (
          <div style={{
            background: colors.dangerBg, color: colors.danger,
            padding: "0.5rem 0.75rem", borderRadius: 6, fontSize: "0.82rem", marginBottom: "1rem",
          }}>
            {error}
          </div>
        )}

        {mode === "choose" && (
          <>
            <button
              onClick={handleLucid}
              style={{
                ...btnStyle(colors.primary), width: "100%", padding: "0.75rem",
                marginBottom: "0.75rem", fontSize: "0.9rem",
              }}
            >
              Generate Dev Wallet (Recommended)
            </button>
            <p style={{ fontSize: "0.78rem", color: colors.muted, marginBottom: "1.25rem", lineHeight: 1.5 }}>
              Creates a wallet in your browser with a random seed phrase.
              Automatically funded via the YACI devkit faucet.
              Seed is saved in localStorage for this session.
            </p>

            <button
              onClick={() => setMode("cip30-list")}
              style={{
                ...btnStyle("transparent"), width: "100%", padding: "0.75rem",
                border: `1px solid ${colors.cardBorder}`, color: colors.textDim,
                marginBottom: "0.5rem",
              }}
            >
              Connect Browser Extension
            </button>
            <p style={{ fontSize: "0.72rem", color: colors.warning, lineHeight: 1.4 }}>
              Browser extension wallets (Nami, Eternl, etc.) are configured for mainnet/testnet
              and will NOT work with the local YACI devkit network.
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
              <button
                onClick={onClose}
                style={{ ...btnStyle("transparent"), color: colors.muted, border: `1px solid ${colors.cardBorder}` }}
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {mode === "lucid-connecting" && (
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <div style={{ fontSize: "0.9rem", color: colors.textDim, marginBottom: "0.5rem" }}>
              {status}
            </div>
            <div style={{
              width: 24, height: 24, margin: "0.5rem auto",
              border: `2px solid ${colors.cardBorder}`, borderTopColor: colors.primary,
              borderRadius: "50%", animation: "spin 1s linear infinite",
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {mode === "cip30-list" && (
          <>
            <div style={{
              background: "rgba(245,158,11,0.08)", border: `1px solid rgba(245,158,11,0.2)`,
              borderRadius: 6, padding: "0.6rem 0.75rem", marginBottom: "1rem",
              fontSize: "0.78rem", color: colors.warning, lineHeight: 1.5,
            }}>
              These wallets are configured for mainnet/testnet.
              They will NOT work with the local YACI devkit.
            </div>

            {detectedWallets.length === 0 ? (
              <p style={{ color: colors.muted, fontSize: "0.85rem", marginBottom: "1rem" }}>
                No Cardano wallet extensions detected.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
                {detectedWallets.map((w) => (
                  <button
                    key={w.name}
                    onClick={() => handleCIP30(w.name.toLowerCase())}
                    style={{
                      ...btnStyle("transparent"), textAlign: "left",
                      border: `1px solid ${colors.cardBorder}`, color: colors.text,
                      display: "flex", alignItems: "center", gap: "0.6rem",
                    }}
                  >
                    {w.icon && <img src={w.icon} alt="" style={{ width: 20, height: 20 }} />}
                    {w.name}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button
                onClick={() => setMode("choose")}
                style={{ ...btnStyle("transparent"), color: colors.muted, border: `1px solid ${colors.cardBorder}` }}
              >
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
