import React from "react";
import { AVAILABLE_POOLS } from "../config.ts";

interface PoolStat {
  pool: string;
  total_delegators: number;
  latest_epoch: string;
  latest_block: number;
}

interface PoolInfoProps {
  allPoolStats: PoolStat[];
}

export function PoolInfo({ allPoolStats }: PoolInfoProps) {
  return (
    <div data-testid="pool-info" style={containerStyle}>
      <h2 style={headerStyle}>Available Pools</h2>
      <div style={poolListStyle}>
        {AVAILABLE_POOLS.map((pool) => {
          const stats = allPoolStats.find((s) => s.pool === pool.hash);
          return (
            <div key={pool.hash} style={poolCardStyle}>
              <div style={poolNameStyle}>{pool.name}</div>
              <div style={fieldStyle}>
                <span style={labelStyle}>Pool Hash</span>
                <span data-testid="pool-hash" style={valueStyle}>
                  {pool.hash}
                </span>
              </div>
              <div style={fieldStyle}>
                <span style={labelStyle}>Bech32</span>
                <span style={valueStyle}>{pool.bech32}</span>
              </div>
              <div style={statsRowStyle}>
                <div style={statStyle}>
                  <span style={labelStyle}>Delegators</span>
                  <span data-testid="pool-delegators" style={statValueStyle}>
                    {stats?.total_delegators ?? 0}
                  </span>
                </div>
                <div style={statStyle}>
                  <span style={labelStyle}>Latest Epoch</span>
                  <span style={statValueStyle}>
                    {stats?.latest_epoch ?? "—"}
                  </span>
                </div>
                <div style={statStyle}>
                  <span style={labelStyle}>Latest Block</span>
                  <span data-testid="block-height" style={statValueStyle}>
                    {stats?.latest_block ?? "—"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
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

const headerStyle: React.CSSProperties = {
  color: "#19B17B",
  fontSize: 16,
  marginBottom: 16,
  fontWeight: 600,
};

const poolListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const poolCardStyle: React.CSSProperties = {
  background: "#1a1a1a",
  border: "1px solid #333",
  borderRadius: 6,
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const poolNameStyle: React.CSSProperties = {
  color: "#19B17B",
  fontSize: 14,
  fontWeight: 700,
};

const fieldStyle: React.CSSProperties = {
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

const valueStyle: React.CSSProperties = {
  color: "#e0e0e0",
  fontSize: 12,
  wordBreak: "break-all",
};

const statsRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 24,
  marginTop: 4,
  flexWrap: "wrap",
};

const statStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const statValueStyle: React.CSSProperties = {
  color: "#19B17B",
  fontSize: 18,
  fontWeight: 700,
};
