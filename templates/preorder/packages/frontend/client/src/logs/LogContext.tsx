import React, { createContext, useCallback, useContext, useState } from "react";

export type LogType = "info" | "success" | "error" | "pending" | "chain";

export interface LogEntry {
  id: number;
  type: LogType;
  title: string;
  detail?: string;
  ts: number;
}

interface LogContextValue {
  logs: LogEntry[];
  addLog: (type: LogType, title: string, detail?: string) => void;
}

const Ctx = createContext<LogContextValue>({ logs: [], addLog: () => {} });

let nextId = 1;

export function LogProvider({ children }: { children: React.ReactNode }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback((type: LogType, title: string, detail?: string) => {
    setLogs((prev) => [{ id: nextId++, type, title, detail, ts: Date.now() }, ...prev].slice(0, 200));
  }, []);

  return <Ctx.Provider value={{ logs, addLog }}>{children}</Ctx.Provider>;
}

export function useLog() {
  return useContext(Ctx);
}
