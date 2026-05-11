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
link_pkg "projected-nft-preorder" "contracts-cardano"  "$SCRIPT_DIR/packages/contracts-cardano"
link_pkg "projected-nft-preorder" "database"           "$SCRIPT_DIR/packages/database"
link_pkg "projected-nft-preorder" "node"               "$SCRIPT_DIR/packages/node"
link_pkg "projected-nft-preorder" "frontend"           "$SCRIPT_DIR/packages/frontend"
link_pkg "projected-nft-preorder" "tests"              "$SCRIPT_DIR/packages/tests"

echo ""
echo "Linking @effectstream packages..."
link_pkg "effectstream" "concise"                  "$P/effectstream-sdk/concise"
link_pkg "effectstream" "config"                   "$P/effectstream-sdk/config"
link_pkg "effectstream" "coroutine"                "$P/effectstream-sdk/coroutine"
link_pkg "effectstream" "crypto"                   "$P/effectstream-sdk/crypto"
link_pkg "effectstream" "chain-types"              "$P/effectstream-sdk/chain-types"
link_pkg "effectstream" "db"                       "$P/node-sdk/db"
link_pkg "effectstream" "event-client"             "$P/effectstream-sdk/events"
link_pkg "effectstream" "log"                      "$P/effectstream-sdk/log"
link_pkg "effectstream" "midnight-contracts"       "$P/chains/midnight-contracts"
link_pkg "effectstream" "cardano-contracts"        "$P/chains/cardano-contracts"
link_pkg "effectstream" "orchestrator"             "$P/build-tools/orchestrator"
link_pkg "effectstream" "runtime"                  "$P/node-sdk/runtime"
link_pkg "effectstream" "sm"                       "$P/node-sdk/sm"
link_pkg "effectstream" "sync"                     "$P/node-sdk/sync"
link_pkg "effectstream" "utils"                    "$P/effectstream-sdk/utils"
link_pkg "effectstream" "wallets"                  "$P/effectstream-sdk/wallets"

# Fix @midnight-ntwrk WASM resolution for linked midnight-contracts
echo ""
echo "Fixing @midnight-ntwrk WASM resolution..."
LINKED_MC="$P/chains/midnight-contracts/node_modules/@midnight-ntwrk"
if [ -d "$LINKED_MC" ]; then
  for pkg_path in "$LINKED_MC"/*/; do
    pkg=$(basename "$pkg_path")
    src=$(find "$NM/.bun" -maxdepth 1 -type d -name "@midnight-ntwrk+${pkg}@*" | sort -V | tail -1)
    if [ -n "$src" ] && [ -d "$src/node_modules/@midnight-ntwrk/$pkg" ]; then
      rm -rf "$LINKED_MC/$pkg"
      ln -sf "$src/node_modules/@midnight-ntwrk/$pkg" "$LINKED_MC/$pkg"
      echo "  RELINK @midnight-ntwrk/$pkg"
    fi
  done
fi

echo ""
echo "Done. You can now run: bun run dev"
