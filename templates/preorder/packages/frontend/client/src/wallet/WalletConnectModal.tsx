import React from "react";

interface Props {
  chain: "evm" | "cardano";
  site: string;
  walletName: string;
  walletAddress?: string;
  onApprove: () => void;
  onReject: () => void;
}

function EvmConnectModal({ site, walletName, walletAddress, onApprove, onReject }: Omit<Props, "chain">) {
  return (
    <div data-testid="wallet-connect-modal" style={{
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
          padding: "14px 18px", borderBottom: "1px solid #edf2f7",
          background: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)",
          display: "flex", alignItems: "center", gap: 10,
          borderRadius: "12px 12px 0 0",
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: "#4f46e5", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15, color: "#fff", boxShadow: "0 2px 8px rgba(79, 70, 229, 0.3)",
          }}>
            ⟠
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1e1b4b" }}>{walletName}</div>
            <div style={{ fontSize: 10, color: "#6366f1", fontWeight: 500 }}>Hardhat · Chain 31337</div>
          </div>
          <button onClick={onReject} style={{
            width: 26, height: 26, cursor: "pointer", fontSize: 14,
            background: "#fff", border: "1px solid #e2e8f0", color: "#94a3b8",
            borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>

        <div style={{ padding: "20px 18px" }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 2, textAlign: "center" }}>Connect Wallet</p>
          <p style={{ fontSize: 11, color: "#64748b", marginBottom: 18, textAlign: "center" }}>{site}</p>

          <div style={{ background: "#f8fafc", borderRadius: 8, padding: 14, border: "1px solid #e2e8f0", marginBottom: 16 }}>
            <div style={{ fontSize: 9, color: "#94a3b8", marginBottom: 10, textTransform: "uppercase", letterSpacing: "1px", fontWeight: 700 }}>Permissions</div>
            {["View your wallet address", "Request transaction signatures", "Check token balances"].map((p) => (
              <div key={p} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#475569", padding: "5px 0" }}>
                <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#ecfdf5", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#10b981" }}>✓</span>
                {p}
              </div>
            ))}
          </div>

          {walletAddress && (
            <div style={{ background: "#f8fafc", borderRadius: 6, padding: "8px 12px", border: "1px solid #e2e8f0", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, background: "linear-gradient(135deg, #818cf8, #6366f1)", flexShrink: 0 }} />
              <span style={{ fontSize: 9, color: "#64748b", fontFamily: "'SF Mono', 'Fira Code', monospace", wordBreak: "break-all" }}>{walletAddress}</span>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button data-testid="wallet-connect-reject" onClick={onReject} style={{
              flex: 1, padding: "10px 0", cursor: "pointer", fontSize: 12, fontWeight: 600,
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, color: "#475569",
            }}>Cancel</button>
            <button data-testid="wallet-connect-approve" onClick={onApprove} style={{
              flex: 1, padding: "10px 0", cursor: "pointer", fontSize: 12, fontWeight: 700,
              background: "linear-gradient(135deg, #4f46e5, #6366f1)", border: "none", borderRadius: 8, color: "#fff",
              boxShadow: "0 2px 8px rgba(79, 70, 229, 0.25)",
            }}>Connect</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CardanoConnectModal({ site, walletName, walletAddress, onApprove, onReject }: Omit<Props, "chain">) {
  return (
    <div data-testid="wallet-connect-modal" style={{
      position: "fixed", inset: 0, zIndex: 1000,
      display: "flex", justifyContent: "flex-end", alignItems: "flex-start",
      background: "rgba(0, 0, 0, 0.4)",
    }}>
      <div style={{
        width: 400, margin: "24px 24px 0 0",
        background: "#0f0a14", borderRadius: 20,
        border: "1px solid #2a1a30",
        boxShadow: "0 12px 50px rgba(220, 50, 100, 0.08), 0 0 1px rgba(255,100,150,0.2)",
        fontFamily: "'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif",
      }}>
        <div style={{
          padding: "20px 24px 16px",
          background: "#0f0a14",
          borderBottom: "1px solid #2a1a30",
          borderRadius: "20px 20px 0 0",
          textAlign: "center",
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%", margin: "0 auto 12px",
            background: "#1a0d20", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, color: "#f472b6", fontFamily: "sans-serif",
            border: "1px solid #3d1f45",
            boxShadow: "0 0 20px rgba(244, 114, 182, 0.15), inset 0 0 12px rgba(244, 114, 182, 0.05)",
          }}>₳</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#f0e6f6", marginBottom: 2 }}>{walletName}</div>
          <div style={{ fontSize: 11, color: "#a855f7", fontFamily: "sans-serif" }}>YACI Development Network</div>
        </div>

        <div style={{ padding: "16px 24px 24px" }}>
          <div style={{
            border: "1px solid #2a1a30", borderRadius: 14, padding: 18,
            background: "#130e1a", marginBottom: 18,
          }}>
            <p style={{ fontSize: 14, color: "#d4bfdb", marginBottom: 14, fontStyle: "italic" }}>
              The application at <strong style={{ fontStyle: "normal", color: "#f0e6f6" }}>{site}</strong> is requesting access to your wallet.
            </p>
            <div style={{ height: 1, background: "#2a1a30", marginBottom: 14 }} />
            <div style={{ fontSize: 10, color: "#a855f7", marginBottom: 10, fontFamily: "sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px" }}>
              This will allow the site to:
            </div>
            {["Read your stake & payment address", "Construct and submit transactions", "Query your UTxO set and balance"].map((perm, i) => (
              <div key={perm} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "5px 0", fontSize: 12, color: "#d4bfdb", fontFamily: "sans-serif" }}>
                <span style={{ color: "#f472b6", fontWeight: 700, fontSize: 11, marginTop: 1 }}>{i + 1}.</span>
                {perm}
              </div>
            ))}
          </div>

          {walletAddress && (
            <div style={{ marginBottom: 18, padding: "12px 14px", border: "1px solid #2a1a30", borderRadius: 10, background: "#130e1a" }}>
              <div style={{ fontSize: 9, color: "#a855f7", fontFamily: "sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>
                Wallet Address
              </div>
              <div style={{ fontSize: 9, color: "#9d7faa", fontFamily: "'Courier New', Courier, monospace", wordBreak: "break-all", lineHeight: 1.7 }}>
                {walletAddress}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 12 }}>
            <button data-testid="wallet-connect-reject" onClick={onReject} style={{
              flex: 1, padding: "12px 0", cursor: "pointer", fontSize: 13, fontWeight: 600,
              background: "transparent", border: "1px solid #3d1f45", borderRadius: 12,
              color: "#d4bfdb", fontFamily: "sans-serif",
            }}>Decline</button>
            <button data-testid="wallet-connect-approve" onClick={onApprove} style={{
              flex: 1, padding: "12px 0", cursor: "pointer", fontSize: 13, fontWeight: 700,
              background: "#db2777", border: "none", borderRadius: 12, color: "#fff",
              fontFamily: "sans-serif",
              boxShadow: "0 0 20px rgba(219, 39, 119, 0.3), 0 3px 10px rgba(219, 39, 119, 0.2)",
            }}>Authorize</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WalletConnectModal(props: Props) {
  const { chain, ...rest } = props;
  return chain === "evm" ? <EvmConnectModal {...rest} /> : <CardanoConnectModal {...rest} />;
}
