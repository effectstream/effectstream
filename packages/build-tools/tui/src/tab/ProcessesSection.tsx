import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";

interface Process {
  name: string;
  pid: number;
  alive: boolean;
  args: string[];
}

interface ProcessResponse {
  processes: Process[];
}

export const ProcessesSection = () => {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [showConfirmation, setShowConfirmation] = useState<boolean>(false);
  const [processToRestart, setProcessToRestart] = useState<Process | null>(
    null,
  );

  useInput((input, key) => {
    if (showConfirmation) {
      // Handle confirmation input
      if (input.toLowerCase() === "y") {
        handleRestart();
      } else if (input.toLowerCase() === "n" || key.escape) {
        setShowConfirmation(false);
        setProcessToRestart(null);
      }
    } else {
      // Handle normal navigation
      if (key.upArrow && processes.length > 0) {
        setSelectedIndex((
          prev,
        ) => (prev > 0 ? prev - 1 : processes.length - 1));
      } else if (key.downArrow && processes.length > 0) {
        setSelectedIndex((
          prev,
        ) => (prev < processes.length - 1 ? prev + 1 : 0));
      } else if (key.return && processes.length > 0) {
        // Enter key pressed - show confirmation
        const selectedProcess = processes[selectedIndex];
        setProcessToRestart(selectedProcess);
        setShowConfirmation(true);
      }
    }
  });

  const handleRestart = async () => {
    if (!processToRestart) return;

    try {
      const response = await fetch("http://localhost:3000/restart", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pid: processToRestart.pid }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      if (!result.success) {
        setError(`Restart failed: ${result.error}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown restart error");
    } finally {
      setShowConfirmation(false);
      setProcessToRestart(null);
    }
  };

  useEffect(() => {
    const fetchProcesses = async () => {
      try {
        const response = await fetch("http://localhost:3000/processes");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: ProcessResponse = await response.json();
        setProcesses(data.processes);
        setError(null);
        setLastUpdated(new Date().toLocaleTimeString());

        // Reset selected index if it's out of bounds
        if (selectedIndex >= data.processes.length) {
          setSelectedIndex(Math.max(0, data.processes.length - 1));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    };

    // Initial fetch
    fetchProcesses();

    // Set up interval to fetch every second
    const interval = setInterval(fetchProcesses, 1000);

    return () => clearInterval(interval);
  }, [selectedIndex]);

  return (
    <Box flexDirection="column" padding={1}>
      <Text color="cyan">=== Running Processes ===</Text>
      <Text></Text>
      {error && <Text color="red">Error: {error}</Text>}
      <Text color="gray">Last updated: {lastUpdated}</Text>
      <Text></Text>
      {showConfirmation
        ? (
          <Box flexDirection="column" borderStyle="single" padding={1}>
            <Text color="yellow">
              Restart process: {processToRestart?.name} (PID:{" "}
              {processToRestart?.pid})?
            </Text>
            <Text color="white">
              Press 'y' to confirm, 'n' or ESC to cancel
            </Text>
          </Box>
        )
        : (
          <>
            <Text color="white" bold={true}>
              PID Name Args
            </Text>
            <Text color="white" bold={true}>
              {"─".repeat(80)}
            </Text>
            {processes.map((process: Process, index: number) => (
              <Text
                key={index}
                color={!process.alive
                  ? "red"
                  : process.name === "unknown"
                  ? "yellow"
                  : "green"}
                backgroundColor={index === selectedIndex ? "blue" : undefined}
                bold={index === selectedIndex}
              >
                {`${process.pid.toString().padEnd(8)} ${
                  process.name.padEnd(20)
                } ${process.args.join(" ")}`}
              </Text>
            ))}
            {processes.length === 0 && !error && (
              <Text color="yellow">No processes found</Text>
            )}
            {processes.length > 0 && (
              <Text color="gray">
                Use ↑↓ arrows to navigate, ENTER to restart ({selectedIndex +
                  1}/{processes.length})
              </Text>
            )}
          </>
        )}
    </Box>
  );
};
