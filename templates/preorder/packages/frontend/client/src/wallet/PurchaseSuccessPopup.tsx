import React from "react";

interface Props {
  txHash: string;
  chain: "evm" | "cardano";
  onClose: () => void;
}

export function PurchaseSuccessPopup({ txHash, chain, onClose }: Props) {
  const isEvm = chain === "evm";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0, 0, 0, 0.75)", backdropFilter: "blur(6px)",
    }}>
      <div style={{
        width: 440, background: "#111", borderRadius: 16,
        border: "1px solid #19B17B44", overflow: "hidden",
        boxShadow: "0 0 80px rgba(25, 177, 123, 0.12), 0 24px 48px rgba(0,0,0,0.5)",
      }}>
        {/* Header */}
        <div style={{
          padding: "24px 28px 0", textAlign: "center",
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%", margin: "0 auto 16px",
            background: "rgba(25, 177, 123, 0.12)", border: "2px solid #19B17B",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28,
          }}>
            ✓
          </div>
          <h3 data-testid="purchase-status" style={{
            fontSize: 20, fontWeight: 700, color: "#19B17B", marginBottom: 6,
          }}>
            Purchase successful!
          </h3>
          <p style={{ fontSize: 13, color: "#8b949e", marginBottom: 20 }}>
            Your {isEvm ? "on-chain" : "Cardano"} transaction has been confirmed
          </p>
        </div>

        {/* TX Details */}
        <div style={{ padding: "0 28px 24px" }}>
          <div style={{
            background: "#0a0a0a", borderRadius: 10, padding: 16,
            border: "1px solid #2a2a2a", marginBottom: 20,
          }}>
            <div style={{
              fontSize: 10, color: "#6e7681", textTransform: "uppercase",
              letterSpacing: "0.5px", fontWeight: 600, marginBottom: 8,
            }}>
              Transaction Hash
            </div>
            <div style={{
              fontSize: 11, fontFamily: "monospace", color: "#c9d1d9",
              wordBreak: "break-all", lineHeight: 1.6,
              padding: "8px 10px", background: "#161b22", borderRadius: 6,
              border: "1px solid #21262d",
            }}>
              {txHash}
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(txHash)}
              style={{
                marginTop: 10, padding: "6px 14px", cursor: "pointer",
                fontSize: 11, fontWeight: 600, background: "#21262d",
                border: "1px solid #30363d", borderRadius: 6, color: "#c9d1d9",
                width: "100%",
              }}
            >
              Copy to clipboard
            </button>
          </div>

          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 12px", background: "#19B17B0d",
            borderRadius: 8, border: "1px solid #19B17B22", marginBottom: 20,
          }}>
            <span style={{ fontSize: 14 }}>💡</span>
            <span style={{ fontSize: 11, color: "#8b949e", lineHeight: 1.4 }}>
              Save this transaction hash for your records. It serves as your proof of purchase.
            </span>
          </div>

          <button onClick={onClose} style={{
            width: "100%", padding: "12px 0", cursor: "pointer",
            fontSize: 14, fontWeight: 600, background: "#19B17B",
            border: "none", borderRadius: 8, color: "#fff",
          }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
