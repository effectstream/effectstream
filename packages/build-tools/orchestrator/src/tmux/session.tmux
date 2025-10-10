# Our own global configuration.
set -g mouse on

# Spawn our children.
new-session -d -- deno -A @paima/tui/logs
split-window -h -- deno -A @paima/tui/tui
