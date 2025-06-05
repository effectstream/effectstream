import { useState } from "react";
import { Box, render, Text, useInput, useStdin } from "ink";
import { ProcessesSection } from "./tab/ProcessesSection.tsx";
import { SetupSection } from "./tab/SetupSection.tsx";
import { StatusSection } from "./tab/StatusSection.tsx";
import { LogsSection } from "./tab/LogsSection.tsx";
import {
  BottomBar,
  type Section,
  SECTION_ORDER,
  SECTIONS,
} from "./tab/BottomBar.tsx";

// Main App Component
const App = () => {
  const [currentSection, setCurrentSection] = useState<Section>("status");

  const { setRawMode } = useStdin();
  setRawMode(true);

  useInput((input, key) => {
    // Handle left/right arrow keys for tab navigation
    if (key.leftArrow) {
      const currentIndex = SECTION_ORDER.indexOf(currentSection);
      const prevIndex = currentIndex > 0
        ? currentIndex - 1
        : SECTION_ORDER.length - 1;
      setCurrentSection(SECTION_ORDER[prevIndex]);
      return;
    }

    if (key.rightArrow) {
      const currentIndex = SECTION_ORDER.indexOf(currentSection);
      const nextIndex = currentIndex < SECTION_ORDER.length - 1
        ? currentIndex + 1
        : 0;
      setCurrentSection(SECTION_ORDER[nextIndex]);
      return;
    }

    // Handle section switching via letter keys
    const section = SECTIONS.find((s) => s.key === input.toLowerCase());
    if (section) {
      setCurrentSection(section.section);
    }
  });

  const renderCurrentSection = () => {
    switch (currentSection) {
      case "processes":
        return <ProcessesSection />;
      case "setup":
        return <SetupSection />;
      case "status":
        return <StatusSection />;
      case "logs":
        return <LogsSection />;
      default:
        return <ProcessesSection />;
    }
  };

  return (
    <Box
      flexDirection="column"
      height="100%"
    >
      {/* Header */}
      <Box
        flexDirection="column"
        alignItems="center"
        borderStyle="single"
        borderBottom={true}
        paddingX={0}
        paddingY={0}
        justifyContent="center"
      >
        <Text
          color="green"
          bold={true}
        >
          Paima Engine
        </Text>
        <Text color="gray">
          Terminal UI - Version 0.1.0
        </Text>
      </Box>

      {/* Help text */}
      <Box paddingX={1}>
        <Text color="gray">
          Press ←→ arrows to navigate tabs, Ctrl+C to exit
        </Text>
      </Box>

      {/* Main Content Area */}
      <Box flexGrow={1}>
        {renderCurrentSection()}
      </Box>

      {/* Bottom Navigation Bar */}
      <BottomBar currentSection={currentSection} />
    </Box>
  );
};

export function start(): void {
  render(<App />);
}

start();
