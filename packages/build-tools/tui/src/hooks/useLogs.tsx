import React from "react";
import { useStdout } from "ink";
import type { TsLogExported } from "@paima/collector";
import { DefaultLogLevels } from "@paima/log";

// Singleton to store namespaces and their enabled state globally
class NamespaceStore {
  private static instance: NamespaceStore;
  private namespaces: Set<string> = new Set();
  private enabledNamespaces: Map<string, boolean> = new Map();
  private listeners: Set<() => void> = new Set();

  public static getInstance(): NamespaceStore {
    if (!NamespaceStore.instance) {
      NamespaceStore.instance = new NamespaceStore();
    }
    return NamespaceStore.instance;
  }

  public addNamespace(namespace: string): void {
    if (namespace && namespace.trim()) {
      const hadNamespace = this.namespaces.has(namespace);
      this.namespaces.add(namespace);

      // Default new namespaces to enabled
      if (!this.enabledNamespaces.has(namespace)) {
        this.enabledNamespaces.set(namespace, true);
      }

      if (!hadNamespace) {
        this.notifyListeners();
      }
    }
  }

  public getNamespaces(): string[] {
    return Array.from(this.namespaces).sort();
  }

  public isNamespaceEnabled(namespace: string): boolean {
    return this.enabledNamespaces.get(namespace) ?? true;
  }

  public setNamespaceEnabled(namespace: string, enabled: boolean): void {
    this.enabledNamespaces.set(namespace, enabled);
    this.notifyListeners();
  }

  public getEnabledNamespaces(): Map<string, boolean> {
    return new Map(this.enabledNamespaces);
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }
}

// Hook to get namespaces from the singleton
export const useNamespaces = () => {
  const [namespaces, setNamespaces] = React.useState<string[]>([]);

  React.useEffect(() => {
    const store = NamespaceStore.getInstance();

    // Set initial namespaces
    setNamespaces(store.getNamespaces());

    // Subscribe to updates
    const unsubscribe = store.subscribe(() => {
      setNamespaces(store.getNamespaces());
    });

    return unsubscribe;
  }, []);

  return namespaces;
};

// Hook to get namespace enabled states
export const useNamespaceStates = () => {
  const [enabledStates, setEnabledStates] = React.useState<
    Map<string, boolean>
  >(new Map());

  React.useEffect(() => {
    const store = NamespaceStore.getInstance();

    // Set initial states
    setEnabledStates(store.getEnabledNamespaces());

    // Subscribe to updates
    const unsubscribe = store.subscribe(() => {
      setEnabledStates(store.getEnabledNamespaces());
    });

    return unsubscribe;
  }, []);

  return enabledStates;
};

// Hook to toggle namespace enabled state
export const useToggleNamespace = () => {
  const store = NamespaceStore.getInstance();

  return React.useCallback((namespace: string, enabled: boolean) => {
    store.setNamespaceEnabled(namespace, enabled);
  }, [store]);
};

export const useLogs = () => {
  const { write } = useStdout();
  const [hasShownConnectionError, setHasShownConnectionError] = React.useState(
    false,
  );

  React.useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await fetch("http://localhost:11033/v1/data");
        if (response.ok) {
          const logs: TsLogExported[] = await response.json();
          const store = NamespaceStore.getInstance();

          for (const log of logs) {
            const timestamp = new Date(log._meta.date).toISOString().replace(
              "T",
              " ",
            )
              .substring(0, 19);
            const levelName = getSeverityName(log._meta.logLevelId);

            const grey = (m: string) => `\x1b[90m${m}\x1b[0m`;
            const cleanedMessage = log[0].replace(
              /\x1B[[(?);]{0,2}(;?\d)*./g,
              "",
            );
            const nameSpace = cleanedMessage.split(" ")[0].replace(/:$/, "");

            // Always track namespaces in singleton
            store.addNamespace(nameSpace);

            // Only write logs if the namespace is enabled
            if (store.isNamespaceEnabled(nameSpace)) {
              write(
                `${grey(timestamp)} [${levelName}] ${log[0]}\n`,
              );
            }
          }

          setHasShownConnectionError(false); // Reset error flag on successful connection
        }
      } catch (error) {
        // Only show connection error once to avoid spam
        if (!hasShownConnectionError) {
          const timestamp = new Date().toISOString().replace("T", " ")
            .substring(
              0,
              19,
            );
          write(
            `${timestamp} [ERROR] Failed to connect to log server (will retry silently)\n`,
          );
          setHasShownConnectionError(true);
        }
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
  }, [write, hasShownConnectionError]);
};

// Helper function to convert severity numbers to readable names
function getSeverityName(severity: number): string {
  switch (severity) {
    case DefaultLogLevels.SILLY:
      return "SILLY";
    case DefaultLogLevels.TRACE:
      return "TRACE";
    case DefaultLogLevels.DEBUG:
      return "DEBUG";
    case DefaultLogLevels.INFO:
      return "INFO";
    case DefaultLogLevels.WARN:
      return "WARN";
    case DefaultLogLevels.ERROR:
      return "ERROR";
    case DefaultLogLevels.FATAL:
      return "FATAL";
    default:
      return severity.toString();
  }
}
