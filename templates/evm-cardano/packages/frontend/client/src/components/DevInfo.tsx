import React from "react";

const services = [
  { name: "Hardhat (EVM)", port: 8545 },
  { name: "YACI DevKit", port: 10000 },
  { name: "Dolos gRPC", port: 50051 },
  { name: "Dolos MiniBF", port: 3000 },
  { name: "Sync Node API", port: 9999 },
  { name: "Frontend", port: 10599 },
];

export function DevInfo() {
  return (
    <div data-testid="dev-info" style={cardStyle}>
      <h3 style={headerStyle}>Dev Info</h3>
      {services.map((s) => (
        <div key={s.name} style={rowStyle}>
          <span style={labelStyle}>{s.name}</span>
          <span style={portStyle}>:{s.port}</span>
        </div>
      ))}
      <div style={{ ...rowStyle, marginTop: 8, borderTop: "1px solid #1a1a1a", paddingTop: 8 }}>
        <span style={labelStyle}>PGLite</span>
        <span style={{ color: "#19B17B", fontSize: 12 }}>embedded</span>
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
  color: "#e0e0e0",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 12,
  padding: "3px 0",
};

const labelStyle: React.CSSProperties = { color: "#888" };
const portStyle: React.CSSProperties = { color: "#19B17B", fontFamily: "inherit" };
