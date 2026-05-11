import React from "react";

interface DelegationRow {
  id: number;
  block_height: number;
  address: string;
  pool: string;
  epoch: string;
  tx_hash: string | null;
  created_at: string;
}

interface DelegationsTableProps {
  delegations: DelegationRow[];
}

export function DelegationsTable({ delegations }: DelegationsTableProps) {
  return (
    <div style={containerStyle}>
      <h2 style={headerStyle}>Blockchain Delegations</h2>
      <p style={subtitleStyle}>
        Indexed by the sync node from on-chain delegation certificates
      </p>

      {delegations.length === 0 ? (
        <p style={emptyStyle}>
          No delegations indexed yet. Create a wallet, fund it, and delegate to
          see entries appear here.
        </p>
      ) : (
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>#</th>
                <th style={thStyle}>Staking Credential</th>
                <th style={thStyle}>Pool Hash</th>
                <th style={thStyle}>Epoch</th>
                <th style={thStyle}>Block</th>
              </tr>
            </thead>
            <tbody>
              {delegations.map((d) => (
                <tr key={d.id} data-testid="delegation-row" style={trStyle}>
                  <td style={tdStyle}>{d.id}</td>
                  <td style={tdStyle} title={d.address}>
                    {d.address.slice(0, 16)}...
                  </td>
                  <td style={tdStyle} title={d.pool}>
                    {d.pool.slice(0, 16)}...
                  </td>
                  <td style={tdStyle}>{d.epoch}</td>
                  <td style={tdStyle}>{d.block_height}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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

const headerStyle: React.CSSProperties = {
  color: "#19B17B",
  fontSize: 16,
  fontWeight: 600,
  marginBottom: 4,
};

const subtitleStyle: React.CSSProperties = {
  color: "#666",
  fontSize: 11,
  marginBottom: 16,
};

const emptyStyle: React.CSSProperties = {
  color: "#666",
  fontSize: 13,
  textAlign: "center",
  padding: 20,
};

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  borderBottom: "1px solid #333",
  color: "#888",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: 1,
};

const trStyle: React.CSSProperties = {
  borderBottom: "1px solid #1e1e1e",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  color: "#e0e0e0",
};
