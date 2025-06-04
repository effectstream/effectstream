import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";

export const SetupSection = () => {
  const [setupData, setSetupData] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  useEffect(() => {
    const fetchSetup = async () => {
      try {
        const response = await fetch("http://localhost:3000/setup");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: Record<string, string> = await response.json();
        setSetupData(data);
        setError(null);
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    };

    // Initial fetch
    fetchSetup();

    // Set up interval to fetch every 5 seconds (less frequent than processes)
    const interval = setInterval(fetchSetup, 5000);

    return () => clearInterval(interval);
  }, []);

  return _jsxs(Box, {
    flexDirection: "column",
    padding: 1,
    children: [
      _jsx(Text, { color: "green", children: "=== Setup Configuration ===" }),
      _jsx(Text, { children: "" }),
      error ? _jsx(Text, { color: "red", children: `Error: ${error}` }) : null,
      _jsx(Text, { color: "gray", children: `Last updated: ${lastUpdated}` }),
      _jsx(Text, { children: "" }),
      _jsx(Text, { color: "yellow", children: "Environment Variables:" }),
      _jsx(Text, { children: "" }),
      ...Object.entries(setupData).map(([key, value]) =>
        _jsx(Text, {
          children: `${key.padEnd(20)}: ${value}`,
          color: value === "undefined" ? "red" : "white",
        }, key)
      ),
      Object.keys(setupData).length === 0 && !error
        ? _jsx(Text, { color: "yellow", children: "No setup data available" })
        : null,
      _jsx(Text, { children: "" }),
      // _jsx(Text, { color: "cyan", children: "Static Configuration:" }),
      // _jsx(Text, { children: "🔧 Environment: Development" }),
      // _jsx(Text, { children: "📦 Package Manager: npm" }),
      // _jsx(Text, { children: "🗄️  Database: PostgreSQL" }),
      // _jsx(Text, { children: "🌐 Network: Local" }),
      // _jsx(Text, { children: "⚙️  Config File: paima.config.js" }),
    ],
  });
};
