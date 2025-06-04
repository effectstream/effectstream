import React from "react";
import { Box, Text, useStdout } from "ink";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";

type LogData = {
  component: string;
  namespace: string[];
  level: number;
  message: string[];
};

export const LogsSection = () => {
  const { stdout, write } = useStdout();

  React.useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await fetch("http://localhost:11033/v1/data");
        if (response.ok) {
          const logs: LogData[] = await response.json();

          for (const log of logs) {
            const timestamp = new Date().toISOString().replace("T", " ")
              .substring(0, 19);
            const levelName = getSeverityName(log.level);
            const namespace = log.namespace.length > 0
              ? `[${log.namespace.join(":")}]`
              : "";
            const message = Array.isArray(log.message)
              ? log.message.join(" ")
              : String(log.message);

            const logLine =
              `${timestamp} [${levelName}] ${log.component}${namespace} ${message}\n`;
            write(logLine);
          }
        }
      } catch (error) {
        const timestamp = new Date().toISOString().replace("T", " ").substring(
          0,
          19,
        );
        write(`${timestamp} [ERROR] Failed to fetch logs: ${error}\n`);
      }
    };

    // Initial fetch
    fetchLogs();

    // Poll for new logs every 500ms
    const timer = setInterval(() => {
      fetchLogs();
    }, 500);

    return () => {
      clearInterval(timer);
    };
  }, [write]);

  return _jsxs(Box, {
    flexDirection: "column",
    padding: 1,
    children: [
      _jsx(Text, { color: "magenta", children: "=== System Logs ===" }),
      _jsx(Text, { children: "" }),
      _jsx(Text, {
        color: "gray",
        children: "Real-time logs from collector...",
      }),
    ],
  });
};

// Helper function to convert severity numbers to readable names
function getSeverityName(severity: number): string {
  switch (severity) {
    case 1:
      return "TRACE";
    case 5:
      return "DEBUG";
    case 9:
      return "INFO";
    case 13:
      return "WARN";
    case 17:
      return "ERROR";
    case 21:
      return "FATAL";
    default:
      return "UNKNOWN";
  }
}
