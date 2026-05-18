import React, { useCallback, useEffect, useState } from "react";
import { walletLogin, sendTransaction, WalletMode } from "@effectstream/wallets";
import type { Wallet } from "@effectstream/wallets";
import { paimaConfig } from "./config.ts";
import { getGateStatus, setGateStatus, getCommands, type Command } from "./api.ts";

export function App() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [gateOpen, setGateOpen] = useState(true);
  const [commands, setCommands] = useState<Command[]>([]);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [g, c] = await Promise.all([getGateStatus(), getCommands()]);
      setGateOpen(g);
      setCommands(c);
    } catch { /* backend not ready */ }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [refresh]);

  const connectWallet = async () => {
    try {
      const result = await walletLogin({
        mode: WalletMode.EvmInjected,
        preferBatchedMode: true,
        checkChainId: false,
      });
      setWallet(result.result);
      setStatus(`Connected: ${result.result.walletAddress.slice(0, 10)}...`);
    } catch (e: any) {
      setStatus(`Wallet error: ${e.message}`);
    }
  };

  const toggleGate = async () => {
    const next = !gateOpen;
    await setGateStatus(next);
    setGateOpen(next);
  };

  const send = async () => {
    if (!wallet || !message.trim()) return;
    setStatus("Sending...");
    try {
      await sendTransaction(wallet, ["sendMessage", message], paimaConfig, "wait-effectstream-processed");
      setStatus("Sent!");
      setMessage("");
      setTimeout(refresh, 2000);
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 32 }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Batcher Validations</h1>
      <p style={{ color: "#888", marginBottom: 24 }}>
        Custom batcher validation demo. Toggle the gate to accept or reject inputs.
      </p>

      {/* Wallet */}
      <section style={{ marginBottom: 24 }}>
        {wallet ? (
          <span style={{ color: "#6f6" }}>{status}</span>
        ) : (
          <button onClick={connectWallet} style={btnStyle}>Connect Wallet</button>
        )}
      </section>

      {/* Gate Toggle */}
      <section style={{ ...cardStyle, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>Gate</h2>
          <button
            onClick={toggleGate}
            style={{
              ...btnStyle,
              background: gateOpen ? "#22c55e" : "#ef4444",
              minWidth: 80,
            }}
          >
            {gateOpen ? "ON" : "OFF"}
          </button>
          <span style={{ color: "#888", fontSize: 14 }}>
            {gateOpen ? "Batcher is accepting inputs" : "Batcher is rejecting all inputs"}
          </span>
        </div>
      </section>

      {/* Send Message */}
      <section style={{ ...cardStyle, marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Send Message</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={280}
            placeholder="Type a message..."
            style={inputStyle}
          />
          <button onClick={send} disabled={!wallet || !message.trim()} style={btnStyle}>
            Send
          </button>
        </div>
        {status && <p style={{ color: "#888", fontSize: 13, marginBottom: 0 }}>{status}</p>}
      </section>

      {/* Commands Table */}
      <section style={cardStyle}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Processed Commands</h2>
        {commands.length === 0 ? (
          <p style={{ color: "#666" }}>No commands yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #333" }}>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Sender</th>
                <th style={thStyle}>Message</th>
                <th style={thStyle}>Block</th>
              </tr>
            </thead>
            <tbody>
              {commands.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid #222" }}>
                  <td style={tdStyle}>{c.id}</td>
                  <td style={tdStyle} title={c.sender}>{c.sender.slice(0, 10)}...</td>
                  <td style={tdStyle}>{c.message}</td>
                  <td style={tdStyle}>{c.block_height}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#1a1d27",
  borderRadius: 8,
  padding: 20,
  border: "1px solid #2a2d37",
};

const btnStyle: React.CSSProperties = {
  background: "#3b82f6",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "8px 16px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: "#0f1117",
  color: "#e1e4ea",
  border: "1px solid #333",
  borderRadius: 6,
  padding: "8px 12px",
  fontSize: 14,
};

const thStyle: React.CSSProperties = { textAlign: "left", padding: "8px 6px", color: "#888" };
const tdStyle: React.CSSProperties = { padding: "8px 6px" };
