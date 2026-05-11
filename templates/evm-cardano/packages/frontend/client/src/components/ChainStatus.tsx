import React from "react";

interface ChainStat {
  chain: string;
  latest_block: number;
  total_events: number;
}

interface BlockHeight {
  protocol_name: string;
  synced_page: number;
}

interface ChainStatusProps {
  stats: ChainStat[];
  blockHeights: BlockHeight[];
}

export function ChainStatus({ stats, blockHeights }: ChainStatusProps) {
  const evm = stats.find((s) => s.chain === "evm");
  const cardano = stats.find((s) => s.chain === "cardano");
  const ntp = blockHeights.find((b) => b.protocol_name === "mainNtp");
  const evmSync = blockHeights.find((b) => b.protocol_name === "mainEvmRPC");
  const cardanoSync = blockHeights.find((b) => b.protocol_name === "parallelUtxoRpc");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div data-testid="chain-status-l2" style={{ ...cardStyle, borderColor: "#19B17B33" }}>
        <h3 style={headerStyle}>
          <span style={{ ...dot, background: ntp && ntp.synced_page > 0 ? "#19B17B" : "#666" }} />
          L2 Main Chain (NTP)
        </h3>
        <div style={rowStyle}>
          <span style={labelStyle}>Block</span>
          <span data-testid="l2-block-height" style={valueStyle}>
            {ntp?.synced_page ?? 0}
          </span>
        </div>
        <div style={subtextStyle}>EVM + Cardano blocks merge here</div>
      </div>

      <div data-testid="chain-status-evm" style={cardStyle}>
        <h3 style={headerStyle}>
          <span style={{ ...dot, background: evm && evm.latest_block > 0 ? "#5b9bd5" : "#666" }} />
          EVM (Hardhat)
        </h3>
        <div style={rowStyle}>
          <span style={labelStyle}>Synced Block</span>
          <span style={valueStyle}>{evmSync?.synced_page ?? 0}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Latest Event Block</span>
          <span data-testid="evm-block-height" style={valueStyle}>
            {evm?.latest_block ?? 0}
          </span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Events</span>
          <span style={valueStyle}>{evm?.total_events ?? 0}</span>
        </div>
      </div>

      <div data-testid="chain-status-cardano" style={cardStyle}>
        <h3 style={headerStyle}>
          <span style={{ ...dot, background: cardano && cardano.latest_block > 0 ? "#b57bdb" : "#666" }} />
          Cardano (YACI)
        </h3>
        <div style={rowStyle}>
          <span style={labelStyle}>Synced Block</span>
          <span style={valueStyle}>{cardanoSync?.synced_page ?? 0}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Latest Event Block</span>
          <span style={valueStyle}>{cardano?.latest_block ?? 0}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Events</span>
          <span style={valueStyle}>{cardano?.total_events ?? 0}</span>
        </div>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#111",
  border: "1px solid #1a1a1a",
  borderRadius: 8,
  padding: 16,
};

const headerStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 12,
  display: "flex",
  alignItems: "center",
  gap: 8,
  color: "#e0e0e0",
};

const dot: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  display: "inline-block",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 13,
  padding: "4px 0",
};

const subtextStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#555",
  marginTop: 4,
  fontStyle: "italic",
};

const labelStyle: React.CSSProperties = { color: "#888" };
const valueStyle: React.CSSProperties = { color: "#19B17B", fontWeight: 500 };
