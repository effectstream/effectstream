import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { useLogs } from "../hooks/useLogs.tsx";

export const SetupSection = () => {
  // Enable logs in this section
  useLogs();

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

  return (
    <Box flexDirection="column" padding={1}>
      <Text color="green">=== Setup Configuration ===</Text>
      <Text></Text>
      {error && <Text color="red">Error: {error}</Text>}
      <Text color="gray">Last updated: {lastUpdated}</Text>
      <Text></Text>
      <Text color="yellow">Environment Variables:</Text>
      <Text></Text>
      {Object.entries(setupData).map(([key, value]) => (
        <Text
          key={key}
          color={value === "undefined" ? "red" : "white"}
        >
          {`${key.padEnd(20)}: ${value}`}
        </Text>
      ))}
      {Object.keys(setupData).length === 0 && !error && (
        <Text color="yellow">No setup data available</Text>
      )}
      <Text></Text>
    </Box>
  );
};
