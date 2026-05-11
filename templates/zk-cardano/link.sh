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
link_pkg "zk-cardano" "contracts-cardano"     "$SCRIPT_DIR/packages/contracts-cardano"
link_pkg "zk-cardano" "contracts-midnight"    "$SCRIPT_DIR/packages/contracts-midnight"
link_pkg "zk-cardano" "midnight-contract"     "$SCRIPT_DIR/packages/contracts-midnight/contract-ballot"
link_pkg "zk-cardano" "database"              "$SCRIPT_DIR/packages/database"
link_pkg "zk-cardano" "node"                  "$SCRIPT_DIR/packages/node"
link_pkg "zk-cardano" "batcher"               "$SCRIPT_DIR/packages/batcher"
link_pkg "zk-cardano" "frontend"              "$SCRIPT_DIR/packages/frontend"
link_pkg "zk-cardano" "tests"                 "$SCRIPT_DIR/packages/tests"

echo ""
echo "Linking @effectstream packages..."
link_pkg "effectstream" "batcher-sdk"              "$P/batcher"
link_pkg "effectstream" "concise"                  "$P/effectstream-sdk/concise"
link_pkg "effectstream" "config"                   "$P/effectstream-sdk/config"
link_pkg "effectstream" "coroutine"                "$P/effectstream-sdk/coroutine"
link_pkg "effectstream" "db"                       "$P/node-sdk/db"
link_pkg "effectstream" "event-client"             "$P/effectstream-sdk/events"
link_pkg "effectstream" "explorer"                 "$P/build-tools/explorer"
link_pkg "effectstream" "log"                      "$P/effectstream-sdk/log"
link_pkg "effectstream" "midnight-contracts"       "$P/chains/midnight-contracts"
link_pkg "effectstream" "cardano-contracts"        "$P/chains/cardano-contracts"
link_pkg "effectstream" "npm-midnight-indexer"     "$P/binaries/midnight-indexer"
link_pkg "effectstream" "npm-midnight-node"        "$P/binaries/midnight-node"
link_pkg "effectstream" "npm-midnight-proof-server" "$P/binaries/midnight-proof-server"
link_pkg "effectstream" "orchestrator"             "$P/build-tools/orchestrator"
link_pkg "effectstream" "runtime"                  "$P/node-sdk/runtime"
link_pkg "effectstream" "sm"                       "$P/node-sdk/sm"
link_pkg "effectstream" "sync"                     "$P/node-sdk/sync"
link_pkg "effectstream" "utils"                    "$P/effectstream-sdk/utils"
link_pkg "effectstream" "wallets"                  "$P/effectstream-sdk/wallets"
link_pkg "effectstream" "crypto"                   "$P/effectstream-sdk/crypto"
link_pkg "effectstream" "chain-types"              "$P/effectstream-sdk/chain-types"

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

# Fix WASM module duplication for @midnight-ntwrk/onchain-runtime
# The monorepo's .bun/ cache has its own onchain-runtime-v3 WASM instantiation.
# Packages like compact-js and midnight-js-contracts resolve onchain-runtime-v3
# through the monorepo's hoisted .bun/node_modules/ — creating objects with the
# MONOREPO's WASM classes. The template's code then checks instanceof against the
# TEMPLATE's WASM classes. Two instantiations → instanceof fails
# ("expected instance of ContractMaintenanceAuthority" / "ChargedState").
# Fix: redirect ALL onchain-runtime-v3 references to the template's single copy.
echo ""
echo "Fixing WASM module duplication (onchain-runtime)..."
TEMPLATE_ORT="$NM/.bun/@midnight-ntwrk+onchain-runtime-v3@3.0.0/node_modules/@midnight-ntwrk/onchain-runtime-v3"
if [ -d "$TEMPLATE_ORT" ]; then
  # 1. Redirect the monorepo root's hoisted onchain-runtime-v3 (used by compact-js,
  #    midnight-js-contracts, midnight-js-types, etc.)
  MONOREPO_HOISTED="$MONOREPO_ROOT/node_modules/.bun/node_modules/@midnight-ntwrk/onchain-runtime-v3"
  if [ -L "$MONOREPO_HOISTED" ]; then
    rm -f "$MONOREPO_HOISTED"
    ln -sf "$TEMPLATE_ORT" "$MONOREPO_HOISTED"
    echo "  RELINK monorepo .bun hoisted onchain-runtime-v3 → template"
  fi

  # 2. Redirect per-package copies in monorepo sync/sm
  for monorepo_pkg in "$P/node-sdk/sync" "$P/node-sdk/sm"; do
    ORT_LINK="$monorepo_pkg/node_modules/@midnight-ntwrk/onchain-runtime"
    if [ -L "$ORT_LINK" ]; then
      rm -f "$ORT_LINK"
      ln -sf "$TEMPLATE_ORT" "$ORT_LINK"
      echo "  RELINK $(basename "$monorepo_pkg")/@midnight-ntwrk/onchain-runtime → template"
    fi
    ORT3_LINK="$monorepo_pkg/node_modules/@midnight-ntwrk/onchain-runtime-v3"
    if [ -L "$ORT3_LINK" ]; then
      rm -f "$ORT3_LINK"
      ln -sf "$TEMPLATE_ORT" "$ORT3_LINK"
      echo "  RELINK $(basename "$monorepo_pkg")/@midnight-ntwrk/onchain-runtime-v3 → template"
    fi
  done
fi

echo ""
echo "Done. You can now run: bun run dev"
