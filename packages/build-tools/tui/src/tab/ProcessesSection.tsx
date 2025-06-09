import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { API_BASE_URL } from "../config.ts";

interface Process {
  name?: string;
  pid: number;
  alive: boolean;
  args: string[];
  date: string;
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
        // Hide confirmation immediately and restart in background
        setShowConfirmation(false);
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
        // const selectedProcess = processes[selectedIndex];
        // setProcessToRestart(selectedProcess);
        // setShowConfirmation(true);
      }
    }
  });

  const handleRestart = async () => {
    if (!processToRestart) return;

    try {
      const response = await fetch(`${API_BASE_URL}/restart`, {
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
      setProcessToRestart(null);
    }
  };

  useEffect(() => {
    const fetchProcesses = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/processes`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: ProcessResponse = await response.json();

        // Filter processes: show alive processes immediately, and finished processes for 10 seconds before disappearing
        const now = new Date().getTime();
        const filteredProcesses = data.processes.filter((process: Process) => {
          if (process.alive) {
            return true; // Show alive processes immediately
          }

          // For finished processes, show for 10 seconds after they finish
          // Only use date for dead processes (it should represent termination time)
          if (process.date) {
            const processDate = new Date(process.date).getTime();
            const timeSinceFinished = now - processDate;
            return timeSinceFinished < 10000; // 10 seconds in milliseconds
          }

          // If no date for dead process, don't show it
          return false;
        });

        setProcesses(filteredProcesses);
        setError(null);
        setLastUpdated(new Date().toLocaleTimeString());

        // Reset selected index if it's out of bounds
        if (selectedIndex >= filteredProcesses.length) {
          setSelectedIndex(Math.max(0, filteredProcesses.length - 1));
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
                wrap="truncate"
                key={index}
                color={!process.alive
                  ? "red"
                  : !process.name
                  ? "yellow"
                  : "green"}
                backgroundColor={index === selectedIndex ? "blue" : undefined}
                bold={index === selectedIndex}
              >
                {`${process.pid.toString().padEnd(8)} ${
                  (process.name ?? "noname").padEnd(20)
                } ${process.args.join(" ")}`}
              </Text>
            ))}
            {processes.length === 0 && !error && (
              <Text color="yellow">No processes found</Text>
            )}
            {processes.length > 0 && (
              <Text color="gray">
                Use ↑↓ arrows to navigate ({selectedIndex +
                  1}/{processes.length})
              </Text>
            )}
          </>
        )}
    </Box>
  );
};
