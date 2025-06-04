import { useState } from "react";
import { Box, render, Text, useInput, useStdin } from "ink";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
        return _jsx(ProcessesSection, {});
      case "setup":
        return _jsx(SetupSection, {});
      case "logs":
        return _jsx(LogsSection, {});
      case "status":
        return _jsx(StatusSection, {});
      default:
        return _jsx(ProcessesSection, {});
    }
  };

  return _jsxs(Box, {
    flexDirection: "column",
    height: "100%",
    children: [
      // Header
      _jsx(Box, {
        flexDirection: "column",
        alignItems: "center",
        borderStyle: "single",
        borderBottom: true,
        paddingX: 0,
        paddingY: 0,
        justifyContent: "center",
        children: [
          _jsx(BigText, {
            text: "Paima Engine",
            font: "tiny",
            colors: ["green"],
          }, "header0"),
          _jsx(Text, {
            color: "gray",
            children: "Terminal UI - Version 0.1.0",
          }, "header1"),
        ],
      }),

      // Main Content Area
      _jsx(Box, {
        flexGrow: 1,
        children: renderCurrentSection(),
      }),

      // Bottom Navigation Bar
      _jsx(BottomBar, { currentSection }),

      // Help text
      _jsx(Box, {
        paddingX: 1,
        children: _jsx(Text, {
          color: "gray",
          children: "Press ←→ arrows to navigate tabs, ESC to exit",
        }),
      }),
    ],
  });
};

export function start(): void {
  render(_jsx(App, {}));
}

start();
