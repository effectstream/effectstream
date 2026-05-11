import React from "react";

type CartItem = { id: number; name: string; quantity: number; price: string };

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

function EvmConfirmModal({ items, totalDisplay, recipientAddress, balance, currencySymbol, onConfirm, onReject }: Omit<Props, "chain">) {
  const unit = currencySymbol || "ETH";
  return (
    <div data-testid="wallet-confirm-modal" style={{
      position: "fixed", inset: 0, zIndex: 1000,
      display: "flex", justifyContent: "flex-end", alignItems: "flex-start",
      background: "rgba(0, 0, 0, 0.3)",
    }}>
      <div style={{
        width: 340, margin: "12px 12px 0 0",
        background: "#ffffff", borderRadius: 12,
        border: "1px solid #e2e8f0",
        boxShadow: "0 20px 60px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.04)",
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      }}>
        <div style={{
          padding: "12px 18px", borderBottom: "1px solid #edf2f7",
          background: "linear-gradient(135deg, #eef2ff, #e0e7ff)",
          borderRadius: "12px 12px 0 0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: "#4f46e5",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, color: "#fff",
            }}>⟠</div>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#1e1b4b" }}>Sign Transaction</span>
          </div>
          <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 8, background: "#eef2ff", color: "#4f46e5", fontWeight: 700, border: "1px solid #c7d2fe", textTransform: "uppercase", letterSpacing: "0.5px" }}>Hardhat</span>
        </div>

        <div style={{ padding: "14px 18px" }}>
          <div style={{ background: "#f8fafc", borderRadius: 8, padding: 12, border: "1px solid #e2e8f0", marginBottom: 12 }}>
            {items.map((item, i) => (
              <div key={item.id} style={{
                display: "flex", justifyContent: "space-between", padding: "6px 0",
                borderBottom: i < items.length - 1 ? "1px solid #f1f5f9" : "none",
                fontSize: 11,
              }}>
                <span style={{ color: "#334155" }}>{item.name} <span style={{ color: "#94a3b8" }}>×{item.quantity}</span></span>
                <span style={{ color: "#64748b", fontFamily: "'SF Mono', monospace", fontSize: 10 }}>{item.price} {unit}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, marginTop: 4, borderTop: "2px solid #e2e8f0" }}>
              <span style={{ color: "#1e293b", fontSize: 12, fontWeight: 700 }}>Total</span>
              <span style={{ color: "#4f46e5", fontSize: 14, fontWeight: 800, fontFamily: "'SF Mono', monospace" }}>{totalDisplay} {unit}</span>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>Contract Address</div>
            <div style={{ fontSize: 9, color: "#64748b", fontFamily: "'SF Mono', monospace", background: "#f8fafc", padding: "6px 10px", borderRadius: 6, border: "1px solid #e2e8f0", wordBreak: "break-all", lineHeight: 1.5 }}>{recipientAddress}</div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", background: "#f8fafc", borderRadius: 6, padding: "8px 12px", border: "1px solid #e2e8f0", marginBottom: 14 }}>
            <span style={{ color: "#94a3b8", fontSize: 10 }}>Wallet balance</span>
            <span style={{ color: "#1e293b", fontSize: 11, fontWeight: 700, fontFamily: "'SF Mono', monospace" }}>{balance} {unit}</span>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button data-testid="wallet-reject-btn" onClick={onReject} style={{
              flex: 1, padding: "10px 0", cursor: "pointer", fontSize: 12, fontWeight: 600,
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, color: "#475569",
            }}>Reject</button>
            <button data-testid="wallet-confirm-btn" onClick={onConfirm} style={{
              flex: 1, padding: "10px 0", cursor: "pointer", fontSize: 12, fontWeight: 700,
              background: "linear-gradient(135deg, #4f46e5, #6366f1)", border: "none", borderRadius: 8, color: "#fff",
              boxShadow: "0 2px 8px rgba(79, 70, 229, 0.25)",
            }}>Sign & Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CardanoConfirmModal({ items, totalDisplay, recipientAddress, balance, currencySymbol, onConfirm, onReject }: Omit<Props, "chain">) {
  const unit = currencySymbol || "ADA";
  return (
    <div data-testid="wallet-confirm-modal" style={{
      position: "fixed", inset: 0, zIndex: 1000,
      display: "flex", justifyContent: "flex-end", alignItems: "flex-start",
      background: "rgba(0, 0, 0, 0.4)",
    }}>
      <div style={{
        width: 420, margin: "20px 20px 0 0",
        background: "#0f0a14", borderRadius: 20,
        border: "1px solid #2a1a30",
        boxShadow: "0 12px 50px rgba(220, 50, 100, 0.08), 0 0 1px rgba(255,100,150,0.2)",
        fontFamily: "'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif",
      }}>
        <div style={{
          padding: "18px 24px",
          background: "#0f0a14",
          borderBottom: "1px solid #2a1a30",
          borderRadius: "20px 20px 0 0",
          textAlign: "center",
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%", margin: "0 auto 10px",
            background: "#1a0d20", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, color: "#f472b6", fontFamily: "sans-serif",
            border: "1px solid #3d1f45",
            boxShadow: "0 0 16px rgba(244, 114, 182, 0.15)",
          }}>₳</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#f0e6f6" }}>Confirm Payment</div>
          <div style={{ fontSize: 11, color: "#a855f7", fontFamily: "sans-serif", marginTop: 2 }}>Review the details below before signing</div>
        </div>

        <div style={{ padding: "16px 24px 24px" }}>
          <div style={{ border: "1px solid #2a1a30", borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ background: "#130e1a", padding: "8px 16px", borderBottom: "1px solid #2a1a30" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#a855f7", fontFamily: "sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px" }}>
                <span>Item</span>
                <span>Amount</span>
              </div>
            </div>
            <div style={{ background: "#0f0a14" }}>
              {items.map((item, i) => (
                <div key={item.id} style={{
                  display: "flex", justifyContent: "space-between", padding: "10px 16px",
                  borderBottom: i < items.length - 1 ? "1px solid #1e1228" : "none",
                }}>
                  <span style={{ fontSize: 13, color: "#d4bfdb", fontFamily: "sans-serif" }}>
                    {item.name} <span style={{ color: "#9d7faa", fontSize: 11 }}>×{item.quantity}</span>
                  </span>
                  <span style={{ fontSize: 12, color: "#c084fc", fontFamily: "'Courier New', Courier, monospace" }}>{item.price} {unit}</span>
                </div>
              ))}
            </div>
            <div style={{ background: "#1a0d20", padding: "12px 16px", borderTop: "1px solid #3d1f45", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#f0e6f6", fontFamily: "sans-serif" }}>Total Due</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: "#f472b6", fontFamily: "'Courier New', Courier, monospace", textShadow: "0 0 12px rgba(244, 114, 182, 0.3)" }}>{totalDisplay} {unit}</span>
            </div>
          </div>

          <div style={{ marginBottom: 16, padding: "14px 16px", border: "1px solid #2a1a30", borderRadius: 12, background: "#130e1a" }}>
            <div style={{ fontSize: 9, color: "#a855f7", fontFamily: "sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>Payment Address</div>
            <div style={{ fontSize: 9, color: "#9d7faa", fontFamily: "'Courier New', Courier, monospace", wordBreak: "break-all", lineHeight: 1.8 }}>{recipientAddress}</div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", border: "1px solid #2a1a30", borderRadius: 12, background: "#130e1a", marginBottom: 18 }}>
            <span style={{ fontSize: 12, color: "#a855f7", fontFamily: "sans-serif" }}>UTxO Balance</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#f0e6f6", fontFamily: "'Courier New', Courier, monospace" }}>{balance} {unit}</span>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button data-testid="wallet-reject-btn" onClick={onReject} style={{
              flex: 1, padding: "13px 0", cursor: "pointer", fontSize: 13,
              background: "transparent", border: "none", color: "#9d7faa",
              fontFamily: "sans-serif", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: "3px",
            }}>Close</button>
            <button data-testid="wallet-confirm-btn" onClick={onConfirm} style={{
              flex: 2, padding: "13px 0", cursor: "pointer", fontSize: 14, fontWeight: 700,
              background: "#db2777", border: "none", borderRadius: 12, color: "#fff",
              fontFamily: "sans-serif",
              boxShadow: "0 0 20px rgba(219, 39, 119, 0.3), 0 3px 10px rgba(219, 39, 119, 0.2)",
            }}>Sign & Submit Transaction</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WalletConfirmModal(props: Props) {
  const { chain, ...rest } = props;
  return chain === "evm" ? <EvmConfirmModal {...rest} /> : <CardanoConfirmModal {...rest} />;
}
