export default `
# Our own global configuration.
set -g mouse on

# Spawn our children.
new-session -d -- bun run packages/build-tools/tui/src/logs-standalone.ts
split-window -h -- bun run packages/build-tools/tui/src/mod.ts
`;
