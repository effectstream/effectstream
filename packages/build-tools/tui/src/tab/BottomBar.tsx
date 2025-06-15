import { Box, Text } from "ink";

// Define available sections
export type Section = "processes" | "setup" | "help";

export interface SectionOption {
  key: string;
  label: string;
  section: Section;
  displayKey: string; // For display in bottom bar
}

export const SECTIONS: SectionOption[] = [
  { key: "p", label: "Processes", section: "processes", displayKey: "[P]" },
  { key: "e", label: "Environment", section: "setup", displayKey: "[E]" },
  { key: "h", label: "Help", section: "help", displayKey: "[H]" },
];

// Define section order for arrow key navigation
export const SECTION_ORDER: Section[] = [
  "processes",
  "setup",
  "help",
];

// Bottom Navigation Bar
export const BottomBar = ({ currentSection }: { currentSection: Section }) => {
  return (
    <Box borderStyle="single" borderTop={true} paddingX={1}>
      <Box
        flexDirection="row"
        alignItems="center"
        justifyContent="center"
        gap={2}
      >
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
