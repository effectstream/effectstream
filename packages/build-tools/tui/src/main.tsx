import { useState } from "react";
import { Box, render, Text, useInput, useStdin } from "ink";
import BigText from "ink-big-text";
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
  const [currentSection, setCurrentSection] = useState<Section>("logs");

  const { setRawMode } = useStdin();
  setRawMode(true);

  useInput((input, key) => {
    if (key.escape) {
      Deno.exit();
    }

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
      case "logs":
        return <LogsSection />;
      case "status":
        return <StatusSection />;
      default:
        return <ProcessesSection />;
    }
  };

  return (
    <Box flexDirection="column" height="100%">
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
        <BigText
          text="Paima Engine"
          font="tiny"
          colors={["green"]}
        />
        <Text color="gray">
          Terminal UI - Version 0.1.0
        </Text>
      </Box>

      {/* Main Content Area */}
      <Box flexGrow={1}>
        {renderCurrentSection()}
      </Box>

      {/* Bottom Navigation Bar */}
      <BottomBar currentSection={currentSection} />

      {/* Help text */}
      <Box paddingX={1}>
        <Text color="gray">
          Press ←→ arrows to navigate tabs, ESC to exit
        </Text>
      </Box>
    </Box>
  );
};

export function start(): void {
  render(<App />);
}

start();
