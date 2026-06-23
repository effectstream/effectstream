#!/bin/bash
# Link the monorepo source over the published @effectstream/* deps (which don't
# yet have Solana support) and provide the unpublished validator binary.
# Usage: bun install && ./link.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
P="$MONOREPO_ROOT/packages"
NM="$SCRIPT_DIR/node_modules"

if [ ! -d "$MONOREPO_ROOT/node_modules" ] || \
   [ ! -e "$P/node-sdk/runtime/node_modules/@effectstream/sync" ]; then
  echo "ERROR: run 'bun install' at the monorepo root first:"
  echo "  cd $MONOREPO_ROOT && bun install"
  exit 1
fi

link_pkg() {
  local scope="$1"; local short="$2"; local path="$3"
  if [ ! -d "$path" ]; then echo "  SKIP @$scope/$short (not found)"; return; fi
  mkdir -p "$NM/@$scope"; rm -rf "$NM/@$scope/$short"; ln -sf "$path" "$NM/@$scope/$short"
  for bun_dir in "$NM/.bun/@${scope}+${short}@"*/; do
    [ -d "$bun_dir" ] || continue
    local inner="$bun_dir/node_modules/@$scope/$short"
    [ -e "$inner" ] && { rm -rf "$inner"; ln -sf "$path" "$inner"; }
  done
  echo "  LINK @$scope/$short"
}

echo "Linking unpublished/dev packages for solana-starter..."
# Workspace self-link (the orchestrator resolves @solana-starter/node by name).
mkdir -p "$NM/@solana-starter"
rm -rf "$NM/@solana-starter/node"
ln -sf "$SCRIPT_DIR/packages/node" "$NM/@solana-starter/node"
echo "  LINK @solana-starter/node"
link_pkg effectstream orchestrator "$P/build-tools/orchestrator"
link_pkg effectstream config       "$P/effectstream-sdk/config"
link_pkg effectstream concise      "$P/effectstream-sdk/concise"
link_pkg effectstream coroutine    "$P/effectstream-sdk/coroutine"
link_pkg effectstream utils        "$P/effectstream-sdk/utils"
link_pkg effectstream log          "$P/effectstream-sdk/log"
link_pkg effectstream event-client "$P/effectstream-sdk/events"
link_pkg effectstream runtime      "$P/node-sdk/runtime"
link_pkg effectstream sm           "$P/node-sdk/sm"
link_pkg effectstream db           "$P/node-sdk/db"
link_pkg effectstream event-server "$P/node-sdk/events"
link_pkg effectstream batcher-sdk  "$P/batcher"
link_pkg effectstream crypto       "$P/effectstream-sdk/crypto"

# Unpublished validator binary. `chain:start` runs `./node_modules/.bin/solana-node`
# from the node package dir (the orchestrator resolves @solana-starter/node there).
SOLANA_NODE="$P/binaries/solana-node"
for target in "$NM" "$SCRIPT_DIR/packages/node/node_modules"; do
  mkdir -p "$target/@effectstream" "$target/.bin"
  rm -rf "$target/@effectstream/solana-node"
  ln -sf "$SOLANA_NODE" "$target/@effectstream/solana-node"
  ln -sf "../@effectstream/solana-node/index.js" "$target/.bin/solana-node"
done
echo "  LINK @effectstream/solana-node (+ .bin)"

echo ""
echo "Done."
