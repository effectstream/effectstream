#!/bin/bash
# Link local @effectstream packages from the monorepo into this template.
# Usage: ./link.sh
# Run this instead of `bun install` when developing inside the monorepo.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
P="$MONOREPO_ROOT/packages"

echo "Linking packages from monorepo..."
echo "  Monorepo: $MONOREPO_ROOT"
echo ""

cd "$SCRIPT_DIR"
bun install 2>/dev/null || bun install --no-save 2>/dev/null || true

NM="$SCRIPT_DIR/node_modules"

link_pkg() {
  local scope="$1"
  local short_name="$2"
  local local_path="$3"

  if [ ! -d "$local_path" ]; then
    echo "  SKIP @$scope/$short_name (not found at $local_path)"
    return
  fi

  # 1. Top-level symlink in node_modules/@scope/name
  mkdir -p "$NM/@$scope"
  rm -rf "$NM/@$scope/$short_name"
  ln -sf "$local_path" "$NM/@$scope/$short_name"

  # 2. Redirect .bun/ cached copies so Bun's internal resolver also uses monorepo source
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

# Workspace packages
echo "Linking workspace packages..."
link_pkg "solana-starter" "node"              "$SCRIPT_DIR/packages/node"
link_pkg "solana-starter" "contracts-solana"  "$SCRIPT_DIR/packages/contracts-solana"
link_pkg "solana-starter" "database"          "$SCRIPT_DIR/packages/database"
link_pkg "solana-starter" "batcher"           "$SCRIPT_DIR/packages/batcher"
link_pkg "solana-starter" "frontend"          "$SCRIPT_DIR/packages/frontend"
link_pkg "solana-starter" "tests"             "$SCRIPT_DIR/packages/tests"

echo ""
echo "Linking @effectstream packages..."
link_pkg "effectstream" "concise"                  "$P/effectstream-sdk/concise"
link_pkg "effectstream" "config"                   "$P/effectstream-sdk/config"
link_pkg "effectstream" "coroutine"                "$P/effectstream-sdk/coroutine"
link_pkg "effectstream" "log"                      "$P/effectstream-sdk/log"
link_pkg "effectstream" "runtime"                  "$P/node-sdk/runtime"
link_pkg "effectstream" "sm"                       "$P/node-sdk/sm"
link_pkg "effectstream" "sync"                     "$P/node-sdk/sync"
link_pkg "effectstream" "db"                       "$P/node-sdk/db"
link_pkg "effectstream" "utils"                    "$P/effectstream-sdk/utils"
link_pkg "effectstream" "crypto"                   "$P/effectstream-sdk/crypto"
link_pkg "effectstream" "wallets"                  "$P/effectstream-sdk/wallets"
link_pkg "effectstream" "chain-types"              "$P/effectstream-sdk/chain-types"
link_pkg "effectstream" "event-client"             "$P/effectstream-sdk/events"
link_pkg "effectstream" "batcher-sdk"              "$P/batcher"
link_pkg "effectstream" "orchestrator"             "$P/build-tools/orchestrator"

# @effectstream/solana-node is not published to npm, so bun install can't
# fetch it. Provision it directly into the node_modules of the packages that
# need it, mirroring the e2e layout: the package dir + the .bin symlink.
#   - packages/node            runs the chain:start script (solana-test-validator)
#   - packages/contracts-solana runs build-program.ts (cargo-build-sbf)
echo ""
echo "Linking @effectstream/solana-node (unpublished; provides solana binaries)..."
SOLANA_NODE_SRC="$P/binaries/solana-node"

link_solana_node() {
  local pkg_nm="$1/node_modules"
  mkdir -p "$pkg_nm/@effectstream" "$pkg_nm/.bin"
  rm -rf "$pkg_nm/@effectstream/solana-node"
  ln -sf "$SOLANA_NODE_SRC" "$pkg_nm/@effectstream/solana-node"
  rm -rf "$pkg_nm/.bin/solana-node"
  ln -sf "../@effectstream/solana-node/index.js" "$pkg_nm/.bin/solana-node"
}

if [ -d "$SOLANA_NODE_SRC" ]; then
  link_solana_node "$SCRIPT_DIR/packages/node"
  link_solana_node "$SCRIPT_DIR/packages/contracts-solana"
  echo "  LINK @effectstream/solana-node → packages/node, packages/contracts-solana"
else
  echo "  SKIP @effectstream/solana-node (not found at $SOLANA_NODE_SRC)"
fi

echo ""
echo "Done. You can now run: bun run dev"
