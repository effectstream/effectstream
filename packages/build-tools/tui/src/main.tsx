import { useEffect, useState } from "react";
import { Box, render, Text, useInput, useStdin, useStdout } from "ink";
import { ProcessesSection } from "./tab/ProcessesSection.tsx";
import { SetupSection } from "./tab/SetupSection.tsx";
import { HelpSection } from "./tab/HelpSection.tsx";
import {
  BottomBar,
  type Section,
  SECTION_ORDER,
  SECTIONS,
} from "./tab/BottomBar.tsx";
import { spawn, exit } from "@effectstream/utils/runtime";
import { ENV } from "@effectstream/utils/node-env";

// Main App Component
const App = () => {
  const [currentSection, setCurrentSection] = useState<Section>("processes");
  const { stdout } = useStdout();
  const [width, setWidth] = useState(() => stdout.columns);
  const [height, setHeight] = useState(() => stdout.rows);

  const { setRawMode } = useStdin();
  setRawMode(true);
  useEffect(() => {
    const handleTerminalResize = () => {
      setWidth(stdout.columns);
      setHeight(stdout.rows);
    };
    // Ink's stdout is a TTY in Node; listen for resize events where supported.
    // deno-lint-ignore no-explicit-any
    (stdout as any).on?.("resize", handleTerminalResize);
    return () => {
      // deno-lint-ignore no-explicit-any
      (stdout as any).off?.("resize", handleTerminalResize);
    };
  }, [stdout]);
  useInput((input, key) => {
    if (input === "c" && key.ctrl) {
      if (ENV.TMUX) {
        spawn("tmux", { args: ["kill-session"], stdout: "inherit", stderr: "inherit" });
      }
      exit(0);
      return;
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
        return <SetupSection width={width} />;
      case "help":
        return <HelpSection />;
      default:
        return <ProcessesSection />;
    }
  };

  return (
    <Box
      flexDirection="column"
      height={height}
      width={width}
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
  render(<App />, { exitOnCtrlC: false });
}

start();
