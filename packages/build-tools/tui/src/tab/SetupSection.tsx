import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { ENV } from "@paima/utils/node-env";

interface DocumentationItem {
  defaultValue?: any;
  description: string;
}

interface SetupSectionProps {
  width: number;
}

export const SetupSection = ({ width }: SetupSectionProps) => {
  const [setupData, setSetupData] = useState<Record<string, string>>({});
  const [documentation, setDocumentation] = useState<
    Record<string, DocumentationItem>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [hasNavigated, setHasNavigated] = useState<boolean>(false);
  const showDocumentation = width >= 120;

  useInput((_, key) => {
    const setupKeys = Object.keys(setupData);
    if (setupKeys.length === 0) return;

    if (key.upArrow) {
      setHasNavigated(true);
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : setupKeys.length - 1));
    } else if (key.downArrow) {
      setHasNavigated(true);
      setSelectedIndex((prev) => (prev < setupKeys.length - 1 ? prev + 1 : 0));
    }
  });

  useEffect(() => {
    const fetchSetup = async () => {
      try {
        const response = await fetch(
          `${ENV.ORCHESTRATOR_URL}:${ENV.ORCHESTRATOR_PORT}/setup`,
        );
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

    const fetchDocumentation = async () => {
      try {
        const response = await fetch(
          `${ENV.ORCHESTRATOR_URL}:${ENV.ORCHESTRATOR_PORT}/documentation`,
        );
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: Record<string, DocumentationItem> = await response.json();
        setDocumentation(data);
      } catch (err) {
        // Documentation fetch failure shouldn't show as error in main UI
        console.error("Failed to fetch documentation:", err);
      }
    };

    // Initial fetch
    fetchSetup();
    fetchDocumentation();

    // Set up interval to fetch every 5 seconds (less frequent than processes)
    const interval = setInterval(fetchSetup, 5000);
    const docInterval = setInterval(fetchDocumentation, 30000); // Less frequent for documentation

    return () => {
      clearInterval(interval);
      clearInterval(docInterval);
    };
  }, []);

  // Reset selectedIndex if it's out of bounds when setupData changes
  useEffect(() => {
    const setupKeys = Object.keys(setupData);
    if (selectedIndex >= setupKeys.length && setupKeys.length > 0) {
      setSelectedIndex(Math.max(0, setupKeys.length - 1));
    }
  }, [setupData, selectedIndex]);

  const setupKeys = Object.keys(setupData);
  const selectedKey = setupKeys[selectedIndex];
  const selectedDoc = selectedKey ? documentation[selectedKey] : null;

  return (
    <Box flexDirection="row" padding={1}>
      {/* Left column - Environment Variables */}
      <Box
        flexDirection="column"
        width={showDocumentation ? 80 : "100%"}
        minWidth={showDocumentation ? 80 : undefined}
      >
        <Text color="green">=== Setup Configuration ===</Text>
        <Text></Text>
        {error && <Text color="red">Error: {error}</Text>}
        <Text color="gray">Last updated: {lastUpdated}</Text>
        <Text></Text>
        <Text color="yellow">Environment Variables:</Text>
        <Text></Text>
        {setupKeys.map((key, index) => (
          <Box key={key} flexDirection="row">
            <Box width={40}>
              <Text
                color="cyan"
                backgroundColor={index === selectedIndex && showDocumentation
                  ? "blue"
                  : undefined}
                bold={index === selectedIndex && showDocumentation}
              >
                {key}:
              </Text>
            </Box>
            <Box width={40}>
              <Text
                color={setupData[key] === "undefined" ? "red" : "white"}
                backgroundColor={index === selectedIndex && showDocumentation
                  ? "blue"
                  : undefined}
                bold={index === selectedIndex && showDocumentation}
              >
                {setupData[key]}
              </Text>
            </Box>
          </Box>
        ))}
        {setupKeys.length === 0 && !error && (
          <Text color="yellow">No setup data available</Text>
        )}
        {setupKeys.length > 0 && showDocumentation && (
          <>
            <Text></Text>
            <Text color="gray">
              Use ↑↓ arrows to navigate ({selectedIndex + 1}/{setupKeys.length})
            </Text>
          </>
        )}
      </Box>

      {/* Right column - Documentation (only show if terminal is wide enough) */}
      {showDocumentation && (
        <Box flexDirection="column" paddingLeft={2}>
          <Text color="magenta">=== Documentation ===</Text>
          <Text></Text>
          {!hasNavigated
            ? (
              <Text color="gray">
                Use arrow keys to select a variable and view its documentation
              </Text>
            )
            : selectedDoc
            ? (
              <Box flexDirection="column">
                <Text color="cyan" bold={true}>{selectedKey}</Text>
                <Text></Text>
                <Text color="yellow">Description:</Text>
                <Text wrap="wrap">{selectedDoc.description}</Text>
                <Text></Text>
                {selectedDoc.defaultValue !== undefined && (
                  <>
                    <Text color="yellow">Default Value:</Text>
                    <Text color="white">
                      {String(selectedDoc.defaultValue)}
                    </Text>
                  </>
                )}
              </Box>
            )
            : (
              <Text color="red">
                No documentation available for {selectedKey}
              </Text>
            )}
        </Box>
      )}
    </Box>
  );
};
