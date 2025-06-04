import { Box, Text } from "ink";

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
  return (
    <Box borderStyle="single" borderTop={true} paddingX={1}>
      <Box flexDirection="row" gap={2}>
        {SECTIONS.map((info, index) => (
          <Text
            key={index}
            color={currentSection === info.section ? "black" : "white"}
            backgroundColor={currentSection === info.section
              ? "cyan"
              : undefined}
            bold={currentSection === info.section}
          >
            {`${info.displayKey} ${info.label}`}
          </Text>
        ))}
      </Box>
    </Box>
  );
};
