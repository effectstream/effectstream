export default `
# Our own global configuration.
set -g mouse on

# Spawn our children.
new-session -d -- bun -A @effectstream/tui # /logs
split-window -h -- bun -A @effectstream/tui # /tui
`;
