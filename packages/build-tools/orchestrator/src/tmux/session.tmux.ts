export default `
# Our own global configuration.
set -g remain-on-exit on
set -g mouse on
bind -n C-c kill-session

# Spawn our children.
new-session -d -- deno -A @paima/tui/logs
split-window -h -- deno -A @paima/tui/tui
`;
