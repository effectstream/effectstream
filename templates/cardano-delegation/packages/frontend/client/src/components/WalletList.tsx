import React, { useState } from "react";
import type { WalletState } from "../wallet/cardano-wallet.ts";
import { AVAILABLE_POOLS } from "../config.ts";

interface WalletListProps {
  wallets: WalletState[];
  onCreateWallet: () => void;
  onFundWallet: (id: number) => void;
  onDelegateWallet: (id: number, poolBech32: string) => void;
  onCheckDelegation: (id: number) => void;
  creating: boolean;
}

function WalletCard({
  w,
  onFundWallet,
  onDelegateWallet,
  onCheckDelegation,
}: {
  w: WalletState;
  onFundWallet: (id: number) => void;
  onDelegateWallet: (id: number, poolBech32: string) => void;
  onCheckDelegation: (id: number) => void;
}) {
  const [poolInput, setPoolInput] = useState(AVAILABLE_POOLS[0].bech32);

  return (
    <div data-testid="wallet-card" style={cardStyle}>
      <div style={cardHeaderStyle}>
        <span style={walletIdStyle}>#{w.id}</span>
        <span
          data-testid="wallet-address"
          style={addressStyle}
          title={w.address}
        >
          {w.address.slice(0, 20)}...{w.address.slice(-8)}
        </span>
      </div>

      <div style={cardBodyStyle}>
        <div style={infoRowStyle}>
          <div style={infoItemStyle}>
            <span style={labelStyle}>Balance</span>
            <span data-testid="wallet-balance" style={balanceStyle}>
              {w.balanceAda.toLocaleString()} ADA
            </span>
          </div>
          <div style={infoItemStyle}>
            <span style={labelStyle}>Staking Credential</span>
            <span style={credStyle} title={w.stakingCredential}>
              {w.stakingCredential.slice(0, 16)}...
            </span>
          </div>
          <div style={infoItemStyle}>
            <span style={labelStyle}>Status</span>
            <span
              data-testid="delegation-status"
              style={{
                ...statusStyle,
                color: w.delegated ? "#19B17B" : "#888",
              }}
            >
              {w.delegating
                ? "Delegating..."
                : w.delegated
                  ? "Delegated"
                  : "Not Delegated"}
            </span>
          </div>
          {w.delegatedPool && (
            <div style={infoItemStyle}>
              <span style={labelStyle}>Current Pool</span>
              <span style={credStyle} title={w.delegatedPool}>
                {w.delegatedPool.slice(0, 20)}...
              </span>
            </div>
          )}
        </div>

        <div style={poolInputRowStyle}>
          <label style={labelStyle}>Delegate to Pool</label>
          <select
            data-testid="pool-select"
            value={poolInput}
            onChange={(e) => setPoolInput(e.target.value)}
            style={poolSelectStyle}
          >
            {AVAILABLE_POOLS.map((p) => (
              <option key={p.bech32} value={p.bech32}>
                {p.name} — {p.hash.slice(0, 16)}...
              </option>
            ))}
          </select>
        </div>

        <div style={actionsStyle}>
          <button
            data-testid="fund-wallet-btn"
            onClick={() => onFundWallet(w.id)}
            disabled={w.funding}
            style={actionBtnStyle}
          >
            {w.funding ? "Funding..." : "Fund 1000 ADA"}
          </button>
          <button
            data-testid="delegate-btn"
            onClick={() => onDelegateWallet(w.id, poolInput)}
            disabled={w.delegating || w.balanceAda === 0}
            style={{
              ...actionBtnStyle,
              ...delegateBtnStyle,
              opacity: w.delegating || w.balanceAda === 0 ? 0.5 : 1,
            }}
          >
            {w.delegating
              ? "Delegating..."
              : w.delegated
                ? "Re-delegate"
                : "Delegate to Pool"}
          </button>
          <button
            data-testid="check-delegation-btn"
            onClick={() => onCheckDelegation(w.id)}
            disabled={w.checkingDelegation}
            style={{
              ...actionBtnStyle,
              ...checkBtnStyle,
            }}
          >
            {w.checkingDelegation ? "Querying..." : "Check Delegations"}
          </button>
        </div>

        {w.delegationHistory && w.delegationHistory.length > 0 && (
          <div data-testid="delegation-history" style={historyStyle}>
            <span style={historyLabelStyle}>
              Indexed Delegation History ({w.delegationHistory.length})
            </span>
            <table style={historyTableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Block</th>
                  <th style={thStyle}>Epoch</th>
                  <th style={thStyle}>Pool</th>
                </tr>
              </thead>
              <tbody>
                {w.delegationHistory.map((d) => (
                  <tr key={d.id}>
                    <td style={tdStyle}>{d.block_height}</td>
                    <td style={tdStyle}>{d.epoch}</td>
                    <td style={tdStyle} title={d.pool}>
                      {d.pool.slice(0, 16)}...
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {w.delegationHistory && w.delegationHistory.length === 0 && (
          <div style={historyStyle}>
            <span style={{ color: "#888", fontSize: 12 }}>
              No delegations indexed yet for this staking credential
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function WalletList({
  wallets,
  onCreateWallet,
  onFundWallet,
  onDelegateWallet,
  onCheckDelegation,
  creating,
}: WalletListProps) {
  return (
    <div style={containerStyle}>
      <div style={headerRowStyle}>
        <h2 style={headerStyle}>Wallets</h2>
        <button
          data-testid="create-wallet-btn"
          onClick={onCreateWallet}
          disabled={creating}
          style={createBtnStyle}
        >
          {creating ? "Creating..." : "+ Create Wallet"}
        </button>
      </div>

      {wallets.length === 0 && (
        <p style={emptyStyle}>No wallets yet. Create one to get started.</p>
      )}

      <div style={listStyle}>
        {wallets.map((w) => (
          <WalletCard
            key={w.id}
            w={w}
            onFundWallet={onFundWallet}
            onDelegateWallet={onDelegateWallet}
            onCheckDelegation={onCheckDelegation}
          />
        ))}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  background: "#141414",
  border: "1px solid #2a2a2a",
  borderRadius: 8,
  padding: 20,
  marginBottom: 20,
};

const headerRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 16,
};

const headerStyle: React.CSSProperties = {
  color: "#19B17B",
  fontSize: 16,
  fontWeight: 600,
};

const createBtnStyle: React.CSSProperties = {
  background: "#19B17B",
  color: "#0a0a0a",
  border: "none",
  borderRadius: 6,
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

const emptyStyle: React.CSSProperties = {
  color: "#666",
  fontSize: 13,
  textAlign: "center",
  padding: 20,
};

const listStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const cardStyle: React.CSSProperties = {
  background: "#1a1a1a",
  border: "1px solid #333",
  borderRadius: 6,
  padding: 16,
};

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginBottom: 12,
};

const walletIdStyle: React.CSSProperties = {
  color: "#19B17B",
  fontWeight: 700,
  fontSize: 14,
};

const addressStyle: React.CSSProperties = {
  color: "#e0e0e0",
  fontSize: 12,
};

const cardBodyStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const infoRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 24,
  flexWrap: "wrap",
};

const infoItemStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const labelStyle: React.CSSProperties = {
  color: "#888",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: 1,
};

const balanceStyle: React.CSSProperties = {
  color: "#e0e0e0",
  fontSize: 16,
  fontWeight: 700,
};

const credStyle: React.CSSProperties = {
  color: "#aaa",
  fontSize: 12,
};

const statusStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
};

const poolInputRowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const poolSelectStyle: React.CSSProperties = {
  background: "#0a0a0a",
  color: "#e0e0e0",
  border: "1px solid #444",
  borderRadius: 4,
  padding: "6px 10px",
  fontSize: 12,
  fontFamily: "inherit",
  width: "100%",
  cursor: "pointer",
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const actionBtnStyle: React.CSSProperties = {
  background: "#2a2a2a",
  color: "#e0e0e0",
  border: "1px solid #444",
  borderRadius: 4,
  padding: "6px 14px",
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
};

const delegateBtnStyle: React.CSSProperties = {
  background: "#19B17B22",
  borderColor: "#19B17B",
  color: "#19B17B",
};

const checkBtnStyle: React.CSSProperties = {
  background: "#3b82f622",
  borderColor: "#3b82f6",
  color: "#3b82f6",
};

const historyStyle: React.CSSProperties = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: 4,
  padding: "8px 12px",
};

const historyLabelStyle: React.CSSProperties = {
  color: "#3b82f6",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: 1,
  fontWeight: 600,
};

const historyTableStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 6,
  borderCollapse: "collapse",
  fontSize: 12,
};

const thStyle: React.CSSProperties = {
  color: "#888",
  textAlign: "left",
  padding: "4px 8px",
  borderBottom: "1px solid #334155",
  fontSize: 10,
  textTransform: "uppercase",
};

const tdStyle: React.CSSProperties = {
  color: "#e0e0e0",
  padding: "4px 8px",
  borderBottom: "1px solid #1e293b",
};
