import React from "react";
import { useLog, type LogType } from "./LogContext.tsx";

const TYPE_COLORS: Record<LogType, string> = {
  info: "#58a6ff",
  success: "#19B17B",
  error: "#f85149",
  pending: "#d29922",
  chain: "#bc8cff",
};

const TYPE_LABELS: Record<LogType, string> = {
  info: "INFO",
  success: "OK",
  error: "ERR",
  pending: "...",
  chain: "TX",
};

export function ActivityLog() {
  const { logs } = useLog();

  return (
    <div style={{
      height: "100%", background: "#ffffff", borderLeft: "1px solid #e0e0e0",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid #e0e0e0",
        fontSize: 11, fontWeight: 700, color: "#666",
        textTransform: "uppercase", letterSpacing: "0.5px",
      }}>
        Activity Log
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {logs.length === 0 && (
          <div style={{ padding: "24px 16px", color: "#999", fontSize: 12, textAlign: "center" }}>
            No activity yet
          </div>
        )}
        {logs.map((entry) => (
          <div key={entry.id} style={{
            padding: "6px 16px", fontSize: 11, lineHeight: 1.5,
            borderBottom: "1px solid #f0f0f0",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "1px 4px", borderRadius: 3,
                background: TYPE_COLORS[entry.type] + "1a",
                color: TYPE_COLORS[entry.type],
                fontFamily: "monospace",
              }}>
                {TYPE_LABELS[entry.type]}
              </span>
              <span style={{ color: "#333", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {entry.title}
              </span>
              <span style={{ color: "#999", fontSize: 9, fontFamily: "monospace", flexShrink: 0 }}>
                {new Date(entry.ts).toLocaleTimeString()}
              </span>
            </div>
            {entry.detail && (
              <div style={{
                color: "#888", fontSize: 10, marginTop: 2, fontFamily: "monospace",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {entry.detail}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
