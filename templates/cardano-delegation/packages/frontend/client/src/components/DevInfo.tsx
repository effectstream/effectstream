import React from "react";

interface BlockHeight {
  protocol_name: string;
  synced_page: number;
}

interface DevInfoProps {
  blockHeights: BlockHeight[];
}

export function DevInfo({ blockHeights }: DevInfoProps) {
  return (
    <div data-testid="dev-info" style={containerStyle}>
      <h2 style={headerStyle}>Dev Info</h2>
      <div style={gridStyle}>
        <div style={itemStyle}>
          <span style={labelStyle}>YACI DevKit</span>
          <span style={valueStyle}>:10000</span>
        </div>
        <div style={itemStyle}>
          <span style={labelStyle}>Dolos gRPC</span>
          <span style={valueStyle}>:50051</span>
        </div>
        <div style={itemStyle}>
          <span style={labelStyle}>Dolos MiniBF</span>
          <span style={valueStyle}>:3000</span>
        </div>
        <div style={itemStyle}>
          <span style={labelStyle}>Sync Node API</span>
          <span style={valueStyle}>:9999</span>
        </div>
        <div style={itemStyle}>
          <span style={labelStyle}>Frontend</span>
          <span style={valueStyle}>:10599</span>
        </div>
        <div style={itemStyle}>
          <span style={labelStyle}>Database</span>
          <span style={valueStyle}>PGLite (embedded)</span>
        </div>
      </div>

      {blockHeights.length > 0 && (
        <div style={syncSectionStyle}>
          <span style={labelStyle}>Sync Status</span>
          <div style={syncGridStyle}>
            {blockHeights.map((bh) => (
              <div key={bh.protocol_name} style={syncItemStyle}>
                <span style={syncNameStyle}>{bh.protocol_name}</span>
                <span style={syncValueStyle}>page {bh.synced_page}</span>
              </div>
            ))}
          </div>
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
};

const headerStyle: React.CSSProperties = {
  color: "#19B17B",
  fontSize: 16,
  fontWeight: 600,
  marginBottom: 16,
};

const gridStyle: React.CSSProperties = {
  display: "flex",
  gap: 20,
  flexWrap: "wrap",
};

const itemStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const labelStyle: React.CSSProperties = {
  color: "#888",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: 1,
};

const valueStyle: React.CSSProperties = {
  color: "#e0e0e0",
  fontSize: 13,
};

const syncSectionStyle: React.CSSProperties = {
  marginTop: 16,
  paddingTop: 16,
  borderTop: "1px solid #2a2a2a",
};

const syncGridStyle: React.CSSProperties = {
  display: "flex",
  gap: 16,
  marginTop: 8,
  flexWrap: "wrap",
};

const syncItemStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const syncNameStyle: React.CSSProperties = {
  color: "#aaa",
  fontSize: 12,
};

const syncValueStyle: React.CSSProperties = {
  color: "#19B17B",
  fontSize: 12,
  fontWeight: 600,
};
