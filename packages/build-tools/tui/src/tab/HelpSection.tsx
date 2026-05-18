import { Box, Text } from "ink";

export const HelpSection = () => {
  return (
    <Box flexDirection="column" padding={1}>
      <Text color="cyan">=== Help & Resources ===</Text>
      <Text></Text>

      <Box flexDirection="column" gap={1}>
        <Text color="white" bold={true}>Documentation</Text>
        <Text color="blue">🔗 https://effectstream.github.io/docs/</Text>
        <Text color="gray">Complete guides, API reference, and tutorials</Text>
        <Text></Text>

        <Text color="white" bold={true}>Community Support</Text>
        <Text color="blue">🔗 https://discord.com/invite/jZ59ArVaxv</Text>
        <Text color="gray">
          Join our Discord server for help and discussions
        </Text>
        <Text></Text>

        <Text color="white" bold={true}>Navigation</Text>
        <Text color="gray">• Use ←→ arrow keys to navigate between tabs</Text>
        <Text color="gray">
          • Use ↑↓ arrow keys to navigate within sections
        </Text>
        <Text color="gray">
          • Press letter keys ([P], [E], [H]) to jump to sections
        </Text>
        <Text color="gray">• Press Ctrl+C to exit the application</Text>
        <Text></Text>

        <Text color="white" bold={true}>Log Control</Text>
        <Text color="gray">
          • Press [SPACE] in the Processes tab to toggle log display for
          selected process
        </Text>
        <Text color="gray">
          • Press [L] in the Processes tab to toggle all processes (disable all
          if any enabled, enable all if all disabled)
        </Text>
        <Text color="gray">
          • Each process can have logs enabled/disabled individually
        </Text>
        <Text color="gray">
          • All processes start with logs enabled by default
        </Text>
        <Text color="gray">
          • Log status shown as [✓] enabled or [✗] disabled per process
        </Text>
        <Text></Text>

        <Text color="white" bold={true}>Sections</Text>
        <Text color="gray">
          • [P] Processes: View and manage running processes
        </Text>
        <Text color="gray">
          • [E] Environment: Configure environment settings
        </Text>
        <Text color="gray">• [H] Help: This help page</Text>
      </Box>
    </Box>
  );
};
