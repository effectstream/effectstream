import React from "react";

type PackageItem = { id: number; quantity: number };

type CuratedPackage = {
  name: string;
  description?: string;
  items: PackageItem[];
};

type ItemInfo = {
  id: number;
  name: string;
  prices?: Record<string, string>;
};

interface Props {
  pkg: CuratedPackage;
  activeToken: string;
  items: ItemInfo[];
  formatPrice: (raw: string) => string;
  currencySymbol: string;
  isActive?: boolean;
  onToggle: () => void;
}

export function CuratedPackageCard({ pkg, activeToken, items, formatPrice, currencySymbol, isActive, onToggle }: Props) {
  const totalRaw = pkg.items.reduce((sum, pi) => {
    const item = items.find((i) => i.id === pi.id);
    const price = BigInt(item?.prices?.[activeToken] || "0");
    return sum + price * BigInt(pi.quantity);
  }, 0n);

  return (
    <div
      data-testid={`package-${pkg.name.toLowerCase().replace(/\s+/g, "-")}`}
      style={{
        border: `1px solid ${isActive ? "#19B17B" : "#2a2a2a"}`,
        borderRadius: 12, padding: 16,
        background: isActive ? "#0a1a15" : "#111",
        position: "relative", cursor: "pointer",
        transition: "all 0.2s",
        boxShadow: isActive ? "0 0 12px rgba(25, 177, 123, 0.15)" : "none",
      }}
      onClick={onToggle}
      onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLDivElement).style.borderColor = "#19B17B"; }}
      onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLDivElement).style.borderColor = "#2a2a2a"; }}
    >
      {/* Price label — matches FreeRewardsTimeline style */}
      <div style={{
        fontSize: 11, fontWeight: 600, color: "#19B17B", marginBottom: 8,
      }}>
        {formatPrice(totalRaw.toString())} {currencySymbol}
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 600, color: "#e6edf3", marginBottom: 6 }}>
        {pkg.name}
      </h3>
      {pkg.description && (
        <p style={{ fontSize: 12, color: "#6e7681", marginBottom: 10, lineHeight: 1.4 }}>
          {pkg.description}
        </p>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {pkg.items.map((pi) => {
          const item = items.find((i) => i.id === pi.id);
          return (
            <span key={pi.id} style={{
              fontSize: 11, padding: "2px 8px", borderRadius: 4,
              background: isActive ? "#19B17B1a" : "#1a1a1a",
              color: isActive ? "#19B17B" : "#8b949e",
              transition: "all 0.2s",
            }}>
              {item?.name || `#${pi.id}`}{pi.quantity > 1 ? ` x${pi.quantity}` : ""}
            </span>
          );
        })}
      </div>
      {isActive && (
        <div style={{
          marginTop: 10, fontSize: 10, fontWeight: 700, color: "#19B17B",
          background: "#19B17B1a", padding: "3px 8px", borderRadius: 4,
          textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "center",
        }}>
          Added to cart
        </div>
      )}
    </div>
  );
}
