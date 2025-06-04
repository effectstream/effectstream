import { Box, Text } from "ink";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";

// Define available sections
export type Section = "processes" | "setup" | "logs" | "status";

export interface SectionOption {
  key: string;
  label: string;
  section: Section;
  displayKey: string; // For display in bottom bar
}

export const SECTIONS: SectionOption[] = [
  { key: "l", label: "Logs", section: "logs", displayKey: "[L]" },
  { key: "p", label: "Processes", section: "processes", displayKey: "[P]" },
  { key: "s", label: "Setup", section: "setup", displayKey: "[S]" },
  { key: "e", label: "Status", section: "status", displayKey: "[E]" },
];

// Define section order for arrow key navigation
export const SECTION_ORDER: Section[] = [
  "logs",
  "processes",
  "setup",
  "status",
];

// Bottom Navigation Bar
export const BottomBar = ({ currentSection }: { currentSection: Section }) => {
  return _jsx(Box, {
    borderStyle: "single",
    borderTop: true,
    paddingX: 1,
    children: _jsx(Box, {
      flexDirection: "row",
      gap: 2,
      children: SECTIONS.map((info, index) =>
        _jsx(Text, {
          children: `${info.displayKey} ${info.label}`,
          color: currentSection === info.section ? "black" : "white",
          backgroundColor: currentSection === info.section ? "cyan" : undefined,
          bold: currentSection === info.section,
        }, index)
      ),
    }),
  });
};
