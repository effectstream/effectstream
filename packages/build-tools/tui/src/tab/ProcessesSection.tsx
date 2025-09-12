import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { ENV } from "@paima/utils/node-env";

interface Process {
  name?: string;
  pid: number;
  alive: boolean;
  args: string[];
  date: string;
  link?: string;
}

interface ProcessResponse {
  processes: Process[];
}

export const ProcessesSection = () => {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [restartStatus, setRestartStatus] = useState<string>("");
  const [processToRestart, setProcessToRestart] = useState<Process | null>(
    null,
  );
  const [processLogStates, setProcessLogStates] = useState<
    Record<string, boolean>
  >({});

  // API call to set log display for a specific process
  const setLogDisplayEnabled = async (
    processName: string,
    enabled: boolean,
  ): Promise<boolean> => {
    try {
      const response = await fetch(
        `${ENV.TUI_LOG_URL}:${ENV.TUI_LOG_PORT}/v1/display-control`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ processName, enabled }),
        },
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      return data.enabled;
    } catch (error) {
      console.error(
        `Failed to set log display for ${processName}: ${
          error instanceof Error ? error.message : error
        }`,
      );
      return false;
    }
  };

  // API call to get all log display states
  const getAllLogDisplayStates = async (): Promise<Record<string, boolean>> => {
    try {
      const response = await fetch(
        `${ENV.TUI_LOG_URL}:${ENV.TUI_LOG_PORT}/v1/display-control`,
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(
        `Failed to get all log display states: ${
          error instanceof Error ? error.message : error
        }`,
      );
      return {}; // Default to empty object on error
    }
  };

  useInput((input, key) => {
    if (input === "r" || input === "R") {
      const syncProcess = processes.find((p) => p.name === "sync" && p.alive);
      if (syncProcess) {
        setRestartStatus("Restarting sync process...");
        fetch(`${ENV.ORCHESTRATOR_URL}:${ENV.ORCHESTRATOR_PORT}/restart-sync`)
          .then(() => {
            setRestartStatus("Sync process restarted successfully.");
            setTimeout(() => setRestartStatus(""), 3000);
          })
          .catch((error) => {
            setRestartStatus("Failed to restart sync process.");
            console.error("Failed to restart sync process:", error);
            setTimeout(() => setRestartStatus(""), 3000);
          });
      } else {
        setRestartStatus("Sync process is not active, cannot restart.");
        setTimeout(() => setRestartStatus(""), 3000);
      }
      return;
    }
    // Handle individual process log display toggle with space
    if (input === " ") {
      if (processes.length > 0 && selectedIndex < processes.length) {
        const selectedProcess = processes[selectedIndex];
        const processName = selectedProcess.name ||
          `pid-${selectedProcess.pid}`;
        const currentState = processLogStates[processName] ?? true; // Default enabled
        const newState = !currentState;

        setLogDisplayEnabled(processName, newState).then((result) => {
          setProcessLogStates((prev) => ({
            ...prev,
            [processName]: result,
          }));
        }).catch((error) => {
          console.error(
            `Failed to toggle log display for ${processName}:`,
            error,
          );
        });
      }
      return;
    }

    // Handle all processes log display toggle with L
    if (input === "l" || input === "L") {
      if (processes.length > 0) {
        const allDisabled = areAllProcessesDisabled();
        const newState = allDisabled; // If all disabled, enable all; if any enabled, disable all

        // Toggle all processes
        const togglePromises = processes.map((process) => {
          const processName = process.name || `pid-${process.pid}`;
          return setLogDisplayEnabled(processName, newState);
        });

        Promise.all(togglePromises).then(() => {
          // Update state for all processes
          const newStates: Record<string, boolean> = {};
          processes.forEach((process) => {
            const processName = process.name || `pid-${process.pid}`;
            newStates[processName] = newState;
          });
          setProcessLogStates((prev) => ({
            ...prev,
            ...newStates,
          }));
        }).catch((error) => {
          console.error("Failed to toggle all processes:", error);
        });
      }
      return;
    }

    // Handle normal navigation
    if (key.upArrow && processes.length > 0) {
      setSelectedIndex((
        prev,
      ) => (prev > 0 ? prev - 1 : processes.length - 1));
    } else if (key.downArrow && processes.length > 0) {
      setSelectedIndex((
        prev,
      ) => (prev < processes.length - 1 ? prev + 1 : 0));
    }
  });

  useEffect(() => {
    // Get initial log display states for all processes
    getAllLogDisplayStates().then((states) => {
      setProcessLogStates(states);
    }).catch((error) => {
      console.error("Failed to get initial log display states:", error);
    });

    const fetchProcesses = async () => {
      try {
        const response = await fetch(
          `${ENV.ORCHESTRATOR_URL}:${ENV.ORCHESTRATOR_PORT}/processes`,
        );
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

  const getProcessLogStatus = (process: Process): boolean => {
    const processName = process.name || `pid-${process.pid}`;
    return processLogStates[processName] ?? true; // Default enabled
  };

  const getSelectedProcessLogStatus = (): string => {
    if (processes.length === 0 || selectedIndex >= processes.length) {
      return "No process selected";
    }
    const selectedProcess = processes[selectedIndex];
    const isEnabled = getProcessLogStatus(selectedProcess);
    const processName = selectedProcess.name || `pid-${selectedProcess.pid}`;
    return `${processName}: ${isEnabled ? "ENABLED" : "DISABLED"}`;
  };

  const areAllProcessesDisabled = (): boolean => {
    if (processes.length === 0) return true;
    return processes.every((process) => {
      const processName = process.name || `pid-${process.pid}`;
      return !(processLogStates[processName] ?? true); // Default enabled, so negate to check if disabled
    });
  };

  const getAllProcessesStatus = (): string => {
    if (processes.length === 0) return "No processes";
    const allDisabled = areAllProcessesDisabled();
    return allDisabled ? "All DISABLED" : "Some/All ENABLED";
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text color="cyan">=== Running Processes ===</Text>
      <Text></Text>
      {error && <Text color="red">Error: {error}</Text>}
      <Text color="gray">Last updated: {lastUpdated}</Text>
      <Text
        color={processes.length > 0 && selectedIndex < processes.length &&
            getProcessLogStatus(processes[selectedIndex])
          ? "green"
          : "red"}
      >
        Selected: {getSelectedProcessLogStatus()} (Press SPACE to toggle)
      </Text>
      <Text color={areAllProcessesDisabled() ? "red" : "green"}>
        All Processes: {getAllProcessesStatus()} (Press L to toggle all)
      </Text>
      {restartStatus ? <Text color="yellow">{restartStatus}</Text> : null}
      <Text></Text>

      <Text color="white" bold>
        [Log] PID Name Args
      </Text>
      <Text color="white" bold>
        {"─".repeat(80)}
      </Text>
      {processes.map((process: Process, index: number) => {
        const logEnabled = getProcessLogStatus(process);
        const logStatus = logEnabled ? "✓" : "✗";
        const logColor = logEnabled ? "green" : "red";

        return (
          <Text
            wrap="truncate"
            key={index}
            color={!process.alive ? "red" : !process.name ? "yellow" : "green"}
            backgroundColor={index === selectedIndex ? "blue" : undefined}
            bold={index === selectedIndex}
          >
            <Text color={logColor}>[{logStatus}]</Text>
            {` ${process.pid.toString().padEnd(8)} ${
              (process.name ?? "noname").padEnd(21)
            }`}
            {process.link && ` [ ${process.link} ]`}
            {` ${process.args.join(" ")}`}
          </Text>
        );
      })}
      {processes.length === 0 && !error && (
        <Text color="yellow">No processes found</Text>
      )}
      {processes.length > 0 && (
        <Text color="gray">
          Use ↑↓ arrows to navigate, SPACE to toggle selected, L to toggle all,
          R to restart sync
        </Text>
      )}
    </Box>
  );
};
