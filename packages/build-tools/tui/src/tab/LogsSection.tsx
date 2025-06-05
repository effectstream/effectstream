import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import {
  useLogs,
  useNamespaces,
  useNamespaceStates,
  useToggleNamespace,
} from "../hooks/useLogs.tsx";

interface LogStream {
  namespace: string;
  enabled: boolean;
}

export const LogsSection = () => {
  // Enable logs in this section
  useLogs();

  const namespaces = useNamespaces();
  const namespaceStates = useNamespaceStates();
  const toggleNamespace = useToggleNamespace();
  const [logStreams, setLogStreams] = useState<LogStream[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Update log streams when namespaces or their states change
  useEffect(() => {
    const newStreams = namespaces.map((namespace: string) => ({
      namespace,
      enabled: namespaceStates.get(namespace) ?? true,
    }));
    setLogStreams(newStreams);
  }, [namespaces, namespaceStates]);

  // Handle keyboard input for navigation and toggling
  useInput((input, key) => {
    if (key.upArrow) {
      if (selectedIndex > 0) {
        setSelectedIndex(selectedIndex - 1);
      } else {
        // Overflow to end when at the beginning
        setSelectedIndex(logStreams.length - 1);
      }
    } else if (key.downArrow) {
      if (selectedIndex < logStreams.length - 1) {
        setSelectedIndex(selectedIndex + 1);
      } else {
        // Overflow to start when at the end
        setSelectedIndex(0);
      }
    } else if (input === " " || key.return) {
      // Toggle the selected stream in global state
      if (logStreams[selectedIndex]) {
        const stream = logStreams[selectedIndex];
        toggleNamespace(stream.namespace, !stream.enabled);
      }
    } else if (input === "x" || input === "X") {
      // Disable all streams
      logStreams.forEach((stream) => {
        if (stream.enabled) {
          toggleNamespace(stream.namespace, false);
        }
      });
    } else if (input === "z" || input === "Z") {
      // Enable all streams
      logStreams.forEach((stream) => {
        if (!stream.enabled) {
          toggleNamespace(stream.namespace, true);
        }
      });
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text color="blue" bold>
        === Log Streams ===
      </Text>
      <Text></Text>
      <Text color="gray">
        Use ↑↓ to navigate [ENTER] toggle [X] disable all [Z] enable all
      </Text>
      <Text></Text>

      {logStreams.length === 0
        ? <Text color="yellow">No log streams available</Text>
        : (
          <Box flexDirection="column">
            {logStreams.map((stream, index) => (
              <Box key={stream.namespace} flexDirection="row" gap={1}>
                <Text
                  color={index === selectedIndex ? "cyan" : "white"}
                  backgroundColor={index === selectedIndex ? "blue" : undefined}
                >
                  {index === selectedIndex ? ">" : " "}
                </Text>
                <Text color={stream.enabled ? "green" : "red"}>
                  [{stream.enabled ? "✓" : " "}]
                </Text>
                <Text
                  color={index === selectedIndex ? "cyan" : "white"}
                  backgroundColor={index === selectedIndex ? "blue" : undefined}
                >
                  {stream.namespace}
                </Text>
              </Box>
            ))}
          </Box>
        )}

      {logStreams.length > 0 && (
        <>
          <Text></Text>
          <Text color="gray">
            Enabled: {logStreams.filter((s) => s.enabled).length} /{" "}
            {logStreams.length}
          </Text>
        </>
      )}
    </Box>
  );
};
