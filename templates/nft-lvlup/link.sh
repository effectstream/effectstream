#!/bin/bash
# Link local @effectstream packages from the monorepo into this template.
# Usage: ./link.sh
# Run this instead of `bun install` when developing inside the monorepo.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
P="$MONOREPO_ROOT/packages"

echo "Linking @effectstream packages from monorepo..."
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

  mkdir -p "$NM/@$scope"
  rm -rf "$NM/@$scope/$short_name"
  ln -sf "$local_path" "$NM/@$scope/$short_name"
  echo "  LINK @$scope/$short_name -> $(echo "$local_path" | sed "s|$MONOREPO_ROOT/||")"
}

echo "Linking workspace packages..."
link_pkg "nft-lvlup" "contracts-evm"   "$SCRIPT_DIR/packages/contracts-evm"
link_pkg "nft-lvlup" "database"        "$SCRIPT_DIR/packages/database"
link_pkg "nft-lvlup" "node"            "$SCRIPT_DIR/packages/node"
link_pkg "nft-lvlup" "frontend"        "$SCRIPT_DIR/packages/frontend"
link_pkg "nft-lvlup" "tests"           "$SCRIPT_DIR/packages/tests"

echo ""
echo "Linking @effectstream packages from monorepo..."
link_pkg "effectstream" "concise"           "$P/effectstream-sdk/concise"
link_pkg "effectstream" "config"            "$P/effectstream-sdk/config"
link_pkg "effectstream" "coroutine"         "$P/effectstream-sdk/coroutine"
link_pkg "effectstream" "crypto"            "$P/effectstream-sdk/crypto"
link_pkg "effectstream" "db"                "$P/node-sdk/db"
link_pkg "effectstream" "evm-contracts"     "$P/chains/evm-contracts"
link_pkg "effectstream" "evm-hardhat"       "$P/chains/evm-hardhat"
link_pkg "effectstream" "log"               "$P/effectstream-sdk/log"
link_pkg "effectstream" "orchestrator"      "$P/build-tools/orchestrator"
link_pkg "effectstream" "runtime"           "$P/node-sdk/runtime"
link_pkg "effectstream" "sm"                "$P/node-sdk/sm"
link_pkg "effectstream" "utils"             "$P/effectstream-sdk/utils"
link_pkg "effectstream" "wallets"           "$P/effectstream-sdk/wallets"

echo ""
echo "Done. You can now run: bun run dev"
