import React, { useEffect, useRef } from "react";
import { colors, fonts, glass } from "../styles.ts";

export interface LogEntry {
  time: string;
  message: string;
  type?: "info" | "success" | "error" | "warn";
}

interface LogPanelProps {
  entries: LogEntry[];
}

const typeColor: Record<string, string> = {
  info: colors.logText,
  success: "#4ade80",
  error: "#f87171",
  warn: "#fbbf24",
};

export function createLogEntry(
  message: string,
  type: LogEntry["type"] = "info",
): LogEntry {
  const now = new Date();
  const time = now.toLocaleTimeString("en-US", { hour12: false });
  return { time, message, type };
}

export default function LogPanel({ entries }: LogPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  return (
    <div
      data-testid="log-panel"
      style={{
        ...glass,
        borderRadius: 0,
        borderTop: "none", borderRight: "none", borderBottom: "none",
        borderLeft: `1px solid ${colors.glassBorder}`,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      <div
        style={{
          padding: "0.75rem 1rem",
          borderBottom: `1px solid ${colors.glassBorder}`,
          fontFamily: fonts.mono,
          fontSize: "0.7rem",
          fontWeight: 600,
          color: colors.logTimestamp,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        Activity Log
      </div>
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "0.5rem 0",
          fontFamily: fonts.mono,
          fontSize: "0.78rem",
          lineHeight: 1.7,
        }}
      >
        {entries.length === 0 && (
          <div style={{ padding: "1rem", color: colors.logTimestamp }}>
            Waiting for activity...
          </div>
        )}
        {entries.map((entry, i) => (
          <div
            key={i}
            style={{
              padding: "0.1rem 1rem",
              wordBreak: "break-all",
            }}
          >
            <span style={{ color: colors.logTimestamp }}>[{entry.time}]</span>{" "}
            <span style={{ color: typeColor[entry.type || "info"] }}>
              {entry.message}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
