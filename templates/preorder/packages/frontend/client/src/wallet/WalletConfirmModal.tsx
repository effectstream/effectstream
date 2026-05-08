import React from "react";

type CartItem = {
  id: number;
  name: string;
  quantity: number;
  price: string;
};

interface Props {
  chain: "evm" | "cardano";
  items: CartItem[];
  totalDisplay: string;
  recipientAddress: string;
  balance: string;
  currencySymbol?: string;
  onConfirm: () => void;
  onReject: () => void;
}

export function WalletConfirmModal({
  chain,
  items,
  totalDisplay,
  recipientAddress,
  balance,
  currencySymbol,
  onConfirm,
  onReject,
}: Props) {
  const isEvm = chain === "evm";
  const unit = currencySymbol || (isEvm ? "ETH" : "ADA");
  const accent = isEvm ? "#58a6ff" : "#f97583";
  const accentBg = isEvm ? "#1f3a5f" : "#5f1f2a";

  return (
    <div data-testid="wallet-confirm-modal" style={{
      position: "fixed", inset: 0, zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(4px)",
    }}>
      <div style={{
        width: 420, background: "#1a1a2e", borderRadius: 16,
        border: `1px solid ${accentBg}`, overflow: "hidden",
        boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
      }}>
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid #2a2a4a",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: accentBg, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 700, color: accent,
            }}>
              {isEvm ? "E" : "C"}
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: "#e6edf3" }}>
              Confirm Transaction
            </span>
          </div>
          <span style={{
            padding: "2px 8px", borderRadius: 8, fontSize: 10,
            background: accentBg, color: accent, fontWeight: 600,
          }}>
            {isEvm ? "Hardhat" : "YACI Devnet"}
          </span>
        </div>

        <div style={{ padding: "16px 20px" }}>
          <div style={{
            background: "#12122a", borderRadius: 10, padding: 14,
            border: "1px solid #2a2a4a", marginBottom: 14,
          }}>
            {items.map((item) => (
              <div key={item.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "6px 0", borderBottom: "1px solid #2a2a4a",
              }}>
                <span style={{ color: "#c9d1d9", fontSize: 13 }}>
                  {item.name} <span style={{ color: "#6e7681" }}>x{item.quantity}</span>
                </span>
                <span style={{ color: "#8b949e", fontSize: 12, fontFamily: "monospace" }}>
                  {item.price} {unit}
                </span>
              </div>
            ))}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              paddingTop: 10, marginTop: 4,
            }}>
              <span style={{ color: "#e6edf3", fontSize: 14, fontWeight: 600 }}>Total</span>
              <span style={{ color: accent, fontSize: 16, fontWeight: 700, fontFamily: "monospace" }}>
                {totalDisplay} {unit}
              </span>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <p style={{ color: "#6e7681", fontSize: 11, marginBottom: 4 }}>Recipient</p>
            <p style={{
              color: "#8b949e", fontSize: 11, fontFamily: "monospace",
              background: "#12122a", padding: "6px 10px", borderRadius: 6,
              wordBreak: "break-all",
            }}>
              {recipientAddress}
            </p>
          </div>

          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            background: "#12122a", borderRadius: 8, padding: "8px 12px",
            marginBottom: 16,
          }}>
            <span style={{ color: "#6e7681", fontSize: 12 }}>Your balance</span>
            <span style={{ color: "#e6edf3", fontSize: 13, fontFamily: "monospace" }}>
              {balance} {unit}
            </span>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button data-testid="wallet-reject-btn" onClick={onReject} style={{
              flex: 1, padding: "12px 0", cursor: "pointer", fontSize: 14, fontWeight: 600,
              background: "transparent", border: "1px solid #3d2a2a", borderRadius: 10,
              color: "#f85149",
            }}>
              Reject
            </button>
            <button data-testid="wallet-confirm-btn" onClick={onConfirm} style={{
              flex: 1, padding: "12px 0", cursor: "pointer", fontSize: 14, fontWeight: 600,
              background: accent, border: "none", borderRadius: 10,
              color: "#fff",
            }}>
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
