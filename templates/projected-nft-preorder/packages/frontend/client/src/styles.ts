export const colors = {
  bg: "#0a0e1a",
  cardBg: "#141a2e",
  cardBorder: "#1e2a45",
  logBg: "#f5f7fa",
  logBorder: "#dde1e8",
  primary: "#3b82f6",
  primaryHover: "#2563eb",
  success: "#22c55e",
  successBg: "rgba(34,197,94,0.12)",
  warning: "#f59e0b",
  warningBg: "rgba(245,158,11,0.12)",
  danger: "#ef4444",
  dangerBg: "rgba(239,68,68,0.12)",
  muted: "#8892a8",
  mutedLight: "#64748b",
  text: "#e8ecf4",
  textDim: "#94a3b8",
  accent: "#7c3aed",
  logText: "#1e293b",
  logTimestamp: "#94a3b8",
  modalOverlay: "rgba(0,0,0,0.6)",
  cardBgNew: "#1c2540",
  cardBorderNew: "#2a3a5c",
} as const;

export const fonts = {
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', Menlo, monospace",
} as const;

export const card: React.CSSProperties = {
  background: colors.cardBg,
  border: `1px solid ${colors.cardBorder}`,
  borderRadius: 8,
  padding: "1rem",
};

export const badge = (
  color: string,
  bg: string,
): React.CSSProperties => ({
  display: "inline-block",
  fontSize: "0.75rem",
  fontWeight: 600,
  padding: "0.15rem 0.6rem",
  borderRadius: 999,
  color,
  background: bg,
});

export const btn = (
  bg: string,
  hover?: string,
): React.CSSProperties => ({
  background: bg,
  color: "#fff",
  border: "none",
  padding: "0.5rem 1rem",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: "0.875rem",
  fontWeight: 500,
  transition: "background 0.15s",
});

export const input: React.CSSProperties = {
  background: "#0c1021",
  border: `1px solid ${colors.cardBorder}`,
  color: colors.text,
  padding: "0.5rem 0.75rem",
  borderRadius: 6,
  fontSize: "0.875rem",
  outline: "none",
  width: "100%",
};

export const sectionHeader: React.CSSProperties = {
  fontSize: "1.15rem",
  fontWeight: 600,
  color: colors.text,
  marginBottom: "0.5rem",
};

export const sectionDesc: React.CSSProperties = {
  fontSize: "0.85rem",
  color: colors.muted,
  lineHeight: 1.6,
  marginBottom: "1.25rem",
};
