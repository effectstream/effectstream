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

function truncate(s: string | null, len = 16): string {
  if (!s) return "—";
  if (s.length <= len) return s;
  return s.slice(0, len / 2) + "..." + s.slice(-len / 2);
}

function chainColor(chain: string): string {
  return chain === "evm" ? "#5b9bd5" : "#b57bdb";
}

function typeLabel(event_type: string): string {
  switch (event_type) {
    case "nft_mint": return "NFT Mint";
    case "nft_transfer": return "NFT Transfer";
    case "nft_burn": return "NFT Burn";
    case "ada_transfer": return "ADA Transfer";
    default: return event_type;
  }
}

export function EventFeed({ events, firstUserBlock }: { events: EventRow[]; firstUserBlock: number }) {
  if (events.length === 0) {
    return (
      <div style={{ color: "#666", padding: 24, textAlign: "center", fontSize: 13 }}>
        Waiting for events...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {events.map((ev) => {
        const isInfra = ev.block_height < firstUserBlock;
        return (
          <div key={ev.id} data-testid="event-item" style={{ ...rowStyle, opacity: isInfra ? 0.5 : 1 }}>
            <span style={{ ...badge, background: chainColor(ev.chain) }}>
              {ev.chain.toUpperCase()}
            </span>
            <span style={typeStyle}>{typeLabel(ev.event_type)}</span>
            <span style={addrStyle}>
              {ev.event_type === "ada_transfer"
                ? `${Number(ev.amount || 0) / 1_000_000} ADA → ${truncate(ev.to_address)}`
                : ev.event_type === "nft_mint"
                  ? `#${ev.amount} → ${truncate(ev.to_address)}`
                  : `${truncate(ev.from_address)} → ${truncate(ev.to_address)}`}
            </span>
            {isInfra && <span style={infraBadge}>SETUP</span>}
            <span style={blockStyle}>block {ev.block_height}</span>
          </div>
        );
      })}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 12px",
  background: "#111",
  borderBottom: "1px solid #1a1a1a",
  fontSize: 13,
};

const badge: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: 4,
  fontSize: 10,
  fontWeight: 700,
  color: "#fff",
  minWidth: 48,
  textAlign: "center",
};

const typeStyle: React.CSSProperties = {
  color: "#ccc",
  fontWeight: 500,
  minWidth: 100,
};

const addrStyle: React.CSSProperties = {
  color: "#888",
  flex: 1,
};

const infraBadge: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: "#666",
  background: "#1a1a1a",
  borderRadius: 3,
  padding: "1px 5px",
};

const blockStyle: React.CSSProperties = {
  color: "#555",
  fontSize: 11,
};
