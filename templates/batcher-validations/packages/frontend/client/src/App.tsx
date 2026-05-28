import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  allInjectedWallets,
  sendTransaction,
  walletLogin,
  WalletMode,
} from "@effectstream/wallets";
import type { Wallet } from "@effectstream/wallets";
import { paimaConfig } from "./config.ts";
import { getGateStatus, setGateStatus, getCommands, type Command } from "./api.ts";

type InjectedEntry = {
  metadata: { name: string; displayName: string; icon?: string };
};

const SUPPORTED_MODES: WalletMode[] = [WalletMode.EvmInjected, WalletMode.Cardano];

const modeLabel = (mode: WalletMode) =>
  mode === WalletMode.Cardano ? "cardano" : "evm";

export function App() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [gateOpen, setGateOpen] = useState(true);
  const [commands, setCommands] = useState<Command[]>([]);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [injectedWallets, setInjectedWallets] =
    useState<Record<WalletMode, InjectedEntry[]> | null>(null);

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

  useEffect(() => {
    // Some injected providers register asynchronously.
    const id = setTimeout(async () => {
      try {
        const all = (await allInjectedWallets()) as unknown as Record<
          WalletMode,
          InjectedEntry[]
        >;
        setInjectedWallets(all);
      } catch (e) {
        console.error("Failed to enumerate injected wallets:", e);
      }
    }, 200);
    return () => clearTimeout(id);
  }, []);

  const availableWallets = useMemo(() => {
    if (!injectedWallets) return [];
    const list: { mode: WalletMode; entry: InjectedEntry }[] = [];
    for (const mode of SUPPORTED_MODES) {
      const entries = injectedWallets[mode];
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) list.push({ mode, entry });
    }
    return list;
  }, [injectedWallets]);

  const connectWallet = async (mode: WalletMode, name: string) => {
    try {
      const result = await walletLogin({
        mode,
        preference: { name },
        preferBatchedMode: true,
        checkChainId: false,
      } as any);
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
        ) : injectedWallets === null ? (
          <span style={{ color: "#888" }}>Detecting wallets…</span>
        ) : availableWallets.length === 0 ? (
          <span style={{ color: "#888" }}>
            No EVM or Cardano browser wallet detected.
          </span>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {availableWallets.map(({ mode, entry }) => (
              <button
                key={`${mode}:${entry.metadata.name}`}
                onClick={() => connectWallet(mode, entry.metadata.name)}
                style={walletBtnStyle}
                title={`${entry.metadata.displayName} (${modeLabel(mode)})`}
              >
                {entry.metadata.icon ? (
                  <img
                    src={entry.metadata.icon}
                    alt=""
                    style={{ width: 20, height: 20, borderRadius: 4 }}
                  />
                ) : (
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      background: "#4a5568",
                      color: "#fff",
                      fontSize: 12,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {entry.metadata.displayName.charAt(0)}
                  </span>
                )}
                <span>{entry.metadata.displayName}</span>
                <span style={{ color: "#aaa", fontSize: 12 }}>
                  {modeLabel(mode)}
                </span>
              </button>
            ))}
          </div>
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

const walletBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  background: "#1a1d27",
  color: "#e1e4ea",
  border: "1px solid #2a2d37",
  borderRadius: 6,
  padding: "8px 12px",
  cursor: "pointer",
  fontSize: 14,
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
