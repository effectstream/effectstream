import React from "react";

type RewardItem = {
  id: number;
  name: string;
  description: string;
  freeAt: Record<string, string>;
};

interface Props {
  rewards: RewardItem[];
  activeToken: string;
  currentSpend: bigint;
  formatPrice: (raw: string) => string;
  currencySymbol: string;
}

export function FreeRewardsTimeline({ rewards, activeToken, currentSpend, formatPrice, currencySymbol }: Props) {
  if (rewards.length === 0) return null;

  const sorted = [...rewards].sort((a, b) => {
    const aVal = BigInt(a.freeAt[activeToken] || "0");
    const bVal = BigInt(b.freeAt[activeToken] || "0");
    return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
  });

  return (
    <div style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 18, marginBottom: 20, color: "#c9d1d9" }}>Spend and get free rewards</h2>

      <div style={{ position: "relative", padding: "0 24px" }}>
        {/* Connecting line */}
        <div style={{
          position: "absolute", top: 20, left: 48, right: 48, height: 2,
          background: "#2a2a2a", zIndex: 0,
        }} />

        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${sorted.length}, 1fr)`,
          gap: 16, position: "relative", zIndex: 1,
        }}>
          {sorted.map((reward) => {
            const threshold = BigInt(reward.freeAt[activeToken] || "0");
            const unlocked = currentSpend >= threshold;
            return (
              <div key={reward.id} style={{ textAlign: "center" }}>
                {/* Node */}
                <div style={{
                  width: 40, height: 40, borderRadius: "50%", margin: "0 auto 12px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: unlocked ? "#19B17B" : "#1a1a1a",
                  border: `2px solid ${unlocked ? "#19B17B" : "#2a2a2a"}`,
                  fontSize: 18, transition: "all 0.3s",
                }}>
                  {unlocked ? "✓" : "🎁"}
                </div>
                <div style={{
                  fontSize: 11, color: unlocked ? "#19B17B" : "#6e7681",
                  fontWeight: 600, marginBottom: 8,
                }}>
                  Per {formatPrice(reward.freeAt[activeToken] || "0")} {currencySymbol}
                </div>

                {/* Card */}
                <div style={{
                  border: `1px solid ${unlocked ? "#19B17B33" : "#2a2a2a"}`,
                  borderRadius: 10, padding: 14, background: unlocked ? "#0a1a15" : "#111",
                  transition: "all 0.3s",
                }}>
                  <p style={{
                    fontSize: 13, fontWeight: 600, marginBottom: 4,
                    color: unlocked ? "#19B17B" : "#c9d1d9",
                  }}>
                    {reward.name}
                  </p>
                  <p style={{ fontSize: 11, color: "#6e7681", lineHeight: 1.4 }}>
                    {reward.description}
                  </p>
                  {unlocked && (
                    <span style={{
                      display: "inline-block", marginTop: 8, fontSize: 10, fontWeight: 700,
                      color: "#19B17B", background: "#19B17B1a", padding: "2px 8px", borderRadius: 4,
                      textTransform: "uppercase", letterSpacing: "0.5px",
                    }}>
                      Unlocked
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
