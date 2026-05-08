import React from "react";

interface Props {
  chain: "evm" | "cardano";
  site: string;
  walletName: string;
  walletAddress?: string;
  onApprove: () => void;
  onReject: () => void;
}

export function WalletConnectModal({
  chain,
  site,
  walletName,
  walletAddress,
  onApprove,
  onReject,
}: Props) {
  const isEvm = chain === "evm";
  const accent = isEvm ? "#58a6ff" : "#f97583";
  const accentBg = isEvm ? "#1f3a5f" : "#5f1f2a";
  const networkName = isEvm ? "Hardhat (31337)" : "YACI Devnet";

  return (
    <div data-testid="wallet-connect-modal" style={{
      position: "fixed", inset: 0, zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(4px)",
    }}>
      <div style={{
        width: 380, background: "#1a1a2e", borderRadius: 16,
        border: `1px solid ${accentBg}`, overflow: "hidden",
        boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid #2a2a4a",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: accentBg, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 700, color: accent,
          }}>
            {isEvm ? "E" : "C"}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#e6edf3" }}>{walletName}</div>
            <div style={{ fontSize: 11, color: "#6e7681" }}>{networkName}</div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 20px 16px", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "#c9d1d9", marginBottom: 16 }}>
            Connect to <strong style={{ color: "#e6edf3" }}>{site}</strong>?
          </p>

          <div style={{
            background: "#12122a", borderRadius: 10, padding: 14,
            border: "1px solid #2a2a4a", marginBottom: 16, textAlign: "left",
          }}>
            <div style={{ fontSize: 11, color: "#6e7681", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              This site will be able to
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#c9d1d9" }}>
                <span style={{ color: "#3fb950" }}>&#10003;</span> View your wallet address
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#c9d1d9" }}>
                <span style={{ color: "#3fb950" }}>&#10003;</span> Request transaction approval
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#c9d1d9" }}>
                <span style={{ color: "#3fb950" }}>&#10003;</span> View your balance
              </div>
            </div>
          </div>

          {walletAddress && (
            <div style={{
              background: "#12122a", borderRadius: 8, padding: "8px 12px",
              border: "1px solid #2a2a4a", marginBottom: 16,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%",
                background: `linear-gradient(135deg, ${accent}40, ${accentBg})`,
              }} />
              <span style={{ fontSize: 11, color: "#8b949e", fontFamily: "monospace", wordBreak: "break-all" }}>
                {walletAddress}
              </span>
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button data-testid="wallet-connect-reject" onClick={onReject} style={{
              flex: 1, padding: "12px 0", cursor: "pointer", fontSize: 14, fontWeight: 600,
              background: "transparent", border: "1px solid #3d2a2a", borderRadius: 10,
              color: "#f85149",
            }}>
              Cancel
            </button>
            <button data-testid="wallet-connect-approve" onClick={onApprove} style={{
              flex: 1, padding: "12px 0", cursor: "pointer", fontSize: 14, fontWeight: 600,
              background: accent, border: "none", borderRadius: 10,
              color: "#fff",
            }}>
              Connect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
