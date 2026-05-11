import React from "react";

type Currency = {
  address: string;
  symbol: string;
};

interface Props {
  currencies: Currency[];
  active: string;
  onChange: (address: string) => void;
}

export function CurrencyToggle({ currencies, active, onChange }: Props) {
  return (
    <div style={{
      display: "inline-flex", borderRadius: 8, overflow: "hidden",
      border: "1px solid #2a2a2a", background: "#111",
    }}>
      {currencies.map((c) => {
        const isActive = c.address === active;
        return (
          <button
            key={c.address}
            data-testid={`currency-${c.symbol.toLowerCase()}`}
            onClick={() => onChange(c.address)}
            style={{
              padding: "8px 20px", cursor: "pointer", fontSize: 13, fontWeight: 600,
              border: "none", transition: "background 0.15s, color 0.15s",
              background: isActive ? "#19B17B" : "transparent",
              color: isActive ? "#fff" : "#8b949e",
            }}
          >
            {c.symbol}
          </button>
        );
      })}
    </div>
  );
}
