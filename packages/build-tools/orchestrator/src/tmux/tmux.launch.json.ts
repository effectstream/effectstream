export default {
  "panes": [
    {
      "name": "LOGS",
      "command": "deno -A ${packageName}/tui/logs",
    },
    {
      "name": "TUI",
      "command": "deno -A ${packageName}/tui/tui",
      "split_horizontal": true,
    },
  ],
};
