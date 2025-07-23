export const json = {
  "panes": [
    {
      "name": "LOGS",
      "command": "deno task -f @paima/tui logs",
    },
    {
      "name": "TUI",
      "command": "deno task -f @paima/tui dev",
      "split_horizontal": true,
    },
  ],
};
