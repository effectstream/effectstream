#!/bin/bash
# Link local packages and apply patches for this template.
# Usage: ./link.sh
# - Links packages not published to npm (cardano-contracts)
# - Patches published runtime to skip MQTT broker under Bun

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
P="$MONOREPO_ROOT/packages"
NM="$SCRIPT_DIR/node_modules"

echo "Linking unpublished packages..."

link_pkg() {
  local scope="$1"
  local short_name="$2"
  local local_path="$3"

  if [ ! -d "$local_path" ]; then
    echo "  SKIP @$scope/$short_name (not found at $local_path)"
    return
  fi

  mkdir -p "$NM/@$scope"
  rm -rf "$NM/@$scope/$short_name"
  ln -sf "$local_path" "$NM/@$scope/$short_name"

  for bun_dir in "$NM/.bun/@${scope}+${short_name}@"*/; do
    [ -d "$bun_dir" ] || continue
    local inner="$bun_dir/node_modules/@$scope/$short_name"
    if [ -e "$inner" ]; then
      rm -rf "$inner"
      ln -sf "$local_path" "$inner"
    fi
  done

  echo "  LINK @$scope/$short_name"
}

link_pkg "effectstream" "cardano-contracts"  "$P/chains/cardano-contracts"

# Patch: published @effectstream/runtime@0.100.12 unconditionally creates the MQTT
# broker, which crashes in Bun (ws.createWebSocketStream is unimplemented).
# Wrap in typeof Bun guard to skip it under Bun.
echo ""
echo "Patching runtime MQTT broker for Bun..."
for main_ts in "$NM/.bun/@effectstream+runtime@"*/node_modules/@effectstream/runtime/src/main.ts; do
  [ -f "$main_ts" ] || continue
  if grep -q 'new EventBroker("effectstream-engine").createServer();' "$main_ts" && \
     ! grep -q 'typeof Bun' "$main_ts"; then
    sed -i 's|new EventBroker("effectstream-engine").createServer();|if (typeof Bun === "undefined") { new EventBroker("effectstream-engine").createServer(); }|' "$main_ts"
    echo "  PATCHED $main_ts"
  else
    echo "  OK (already patched or different version)"
  fi
done

echo ""
echo "Done."
