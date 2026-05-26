import React from "react";

interface EventRow {
  id: number;
  chain: string;
  event_type: string;
  from_address: string | null;
  to_address: string | null;
  amount: string | null;
  tx_hash: string;
  block_height: number;
}

function truncateHash(s: string | null, len = 20): string {
  if (!s) return "—";
  if (s.length <= len) return s;
  return s.slice(0, 8) + "…" + s.slice(-6);
}

function formatAmount(chain: string, amount: string | null, eventType: string): string {
  if (!amount) return "—";
  if (chain === "cardano") return `${(Number(amount) / 1_000_000).toFixed(2)} ADA`;
  if (eventType.startsWith("nft_")) return `#${amount}`;
  return amount;
}

export function EventsTable({ events }: { events: EventRow[] }) {
  return (
    <div style={wrapperStyle}>
      <h3 style={titleStyle}>Events Table</h3>
      <div style={scrollStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              {["ID", "Chain", "Type", "From", "To", "Amount", "Tx Hash", "Block"].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr>
                <td colSpan={8} style={{ ...tdStyle, textAlign: "center", color: "#555" }}>
                  No events yet
                </td>
              </tr>
            )}
            {events.map((ev) => (
              <tr key={ev.id} data-testid="table-row">
                <td style={tdStyle}>{ev.id}</td>
                <td style={tdStyle}>
                  <span style={{ color: ev.chain === "evm" ? "#5b9bd5" : "#b57bdb" }}>
                    {ev.chain}
                  </span>
                </td>
                <td style={tdStyle}>{ev.event_type}</td>
                <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11 }}>
                  {truncateHash(ev.from_address)}
                </td>
                <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11 }}>
                  {truncateHash(ev.to_address)}
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  {formatAmount(ev.chain, ev.amount, ev.event_type)}
                </td>
                <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11 }}>
                  {truncateHash(ev.tx_hash)}
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{ev.block_height}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const wrapperStyle: React.CSSProperties = {
  border: "1px solid #1a1a1a",
  borderRadius: 8,
  overflow: "hidden",
};

const titleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  padding: "12px 16px",
  margin: 0,
  borderBottom: "1px solid #1a1a1a",
  color: "#e0e0e0",
};

const scrollStyle: React.CSSProperties = {
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
  color: "#888",
  fontWeight: 600,
  borderBottom: "1px solid #1a1a1a",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderBottom: "1px solid #111",
  color: "#ccc",
  whiteSpace: "nowrap",
};
