export const colors = {
  bg: "#06080f",
  cardBg: "rgba(14,18,32,0.65)",
  cardBorder: "rgba(40,56,100,0.35)",
  logBg: "rgba(8,12,22,0.8)",
  logBorder: "rgba(40,56,100,0.3)",
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
  logText: "#c4cee0",
  logTimestamp: "#5a6a88",
  modalOverlay: "rgba(2,4,10,0.7)",
  cardBgNew: "rgba(22,30,56,0.7)",
  cardBorderNew: "rgba(50,70,120,0.45)",
  glass: "rgba(12,16,30,0.55)",
  glassBorder: "rgba(60,80,140,0.25)",
  glassHighlight: "rgba(100,140,255,0.06)",
} as const;

export const fonts = {
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', Menlo, monospace",
} as const;

export const card: React.CSSProperties = {
  background: colors.cardBg,
  border: `1px solid ${colors.cardBorder}`,
  borderRadius: 10,
  padding: "1rem",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
};

export const glass: React.CSSProperties = {
  background: colors.glass,
  border: `1px solid ${colors.glassBorder}`,
  borderRadius: 12,
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  boxShadow: `inset 0 1px 0 0 ${colors.glassHighlight}, 0 4px 24px rgba(0,0,0,0.3)`,
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
  background: "rgba(6,8,18,0.6)",
  border: `1px solid ${colors.glassBorder}`,
  color: colors.text,
  padding: "0.5rem 0.75rem",
  borderRadius: 8,
  fontSize: "0.875rem",
  outline: "none",
  width: "100%",
  backdropFilter: "blur(8px)",
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
