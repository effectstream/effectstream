# Our own global configuration.
set -g mouse on

# Spawn our children.
new-session -d -- deno -A @effectstream/tui # /logs
split-window -h -- deno -A @effectstream/tui # /tui
