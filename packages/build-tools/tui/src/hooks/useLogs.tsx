import React from "react";
import { useStdout } from "ink";
import type { TsLogExported } from "@paima/collector";

export const useLogs = () => {
  const { write } = useStdout();

  React.useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await fetch("http://localhost:11033/v1/data");
        if (response.ok) {
          const logs: TsLogExported[] = await response.json();

          for (const log of logs) {
            const timestamp = new Date(log._meta.date).toISOString().replace(
              "T",
              " ",
            )
              .substring(0, 19);
            const levelName = getSeverityName(log._meta.logLevelId);

            const grey = (m: string) => `\x1b[90m${m}\x1b[0m`;
            write(
              `${grey(timestamp)} [${levelName}] ${log[0]}\n`,
            );
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
};

// Helper function to convert severity numbers to readable names
function getSeverityName(severity: number): string {
  switch (severity) {
    case 0:
      return "SILLY";
    case 1:
      return "TRACE";
    case 2:
      return "DEBUG";
    case 3:
      return "INFO";
    case 4:
      return "WARN";
    case 5:
      return "ERROR";
    case 6:
      return "FATAL";
    default:
      return severity.toString();
  }
}
