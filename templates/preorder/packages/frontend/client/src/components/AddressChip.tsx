import React, { useState } from "react";

/**
 * Compact address/hash display: shows `head…tail` (default 6+6 chars) and copies the full value
 * to the clipboard on click. Used wherever an address would otherwise overflow its container.
 */
export function AddressChip({
  value,
  head = 6,
  tail = 6,
  color,
}: {
  value?: string | null;
  head?: number;
  tail?: number;
  color?: string;
}) {
  const [copied, setCopied] = useState(false);

  if (!value) return <span style={{ color: "#6e7681", fontFamily: "monospace" }}>—</span>;

  const short =
    value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;

  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {});
  };

  return (
    <span
      onClick={copy}
      title={`${value}\n(click to copy)`}
      data-testid="address-chip"
      style={{
        fontFamily: "monospace",
        cursor: "pointer",
        userSelect: "none",
        color: copied ? "#19B17B" : color ?? "#c9d1d9",
        whiteSpace: "nowrap",
      }}
    >
      {copied ? "✓ copied" : short}
    </span>
  );
}
