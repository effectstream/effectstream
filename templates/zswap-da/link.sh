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

# Workspace packages (Bun doesn't always create node_modules symlinks for these)
echo "Linking workspace packages..."
link_pkg "zswap-da" "batcher"             "$SCRIPT_DIR/packages/batcher"
link_pkg "zswap-da" "contracts-celestia"  "$SCRIPT_DIR/packages/contracts-celestia"
link_pkg "zswap-da" "contracts-midnight"  "$SCRIPT_DIR/packages/contracts-midnight"
link_pkg "zswap-da" "contract-offer-files" "$SCRIPT_DIR/packages/contracts-midnight/contract-offer-files"
link_pkg "zswap-da" "database"            "$SCRIPT_DIR/packages/database"
link_pkg "zswap-da" "frontend"            "$SCRIPT_DIR/packages/frontend"
link_pkg "zswap-da" "node"                "$SCRIPT_DIR/packages/node"
link_pkg "zswap-da" "tests"               "$SCRIPT_DIR/packages/tests"

echo ""
echo "Linking @effectstream packages from monorepo..."
link_pkg "effectstream" "batcher-sdk"               "$P/batcher"
link_pkg "effectstream" "celestia"                  "$P/binaries/celestia"
link_pkg "effectstream" "concise"                   "$P/effectstream-sdk/concise"
link_pkg "effectstream" "config"                    "$P/effectstream-sdk/config"
link_pkg "effectstream" "coroutine"                 "$P/effectstream-sdk/coroutine"
link_pkg "effectstream" "db"                        "$P/node-sdk/db"
link_pkg "effectstream" "log"                       "$P/effectstream-sdk/log"
link_pkg "effectstream" "midnight-contracts"        "$P/chains/midnight-contracts"
link_pkg "effectstream" "npm-midnight-indexer"      "$P/binaries/midnight-indexer"
link_pkg "effectstream" "npm-midnight-node"         "$P/binaries/midnight-node"
link_pkg "effectstream" "npm-midnight-proof-server" "$P/binaries/midnight-proof-server"
link_pkg "effectstream" "orchestrator"              "$P/build-tools/orchestrator"
link_pkg "effectstream" "runtime"                   "$P/node-sdk/runtime"
link_pkg "effectstream" "sm"                        "$P/node-sdk/sm"
link_pkg "effectstream" "utils"                     "$P/effectstream-sdk/utils"

# link.sh historically omitted @zswap-da/validator (a hoisted workspace pkg) — link it.
link_pkg "zswap-da"      "validator" "$SCRIPT_DIR/packages/validator"
# @effectstream/sync is a TRANSITIVE dep (only @effectstream/runtime imports it), so Bun
# resolves it INSIDE the isolated .bun store — a top-level node_modules symlink has NO
# effect on it. Overwrite the .bun copy's TS source with the monorepo source so this script
# alone is enough to run monorepo sync (e.g. PR #794 concurrent Celestia fetcher).
echo ""
echo "Patching @effectstream/sync (transitive dep) .bun source -> monorepo..."
shopt -s nullglob
for SYNC_BUN in "$NM"/.bun/@effectstream+sync@*/node_modules/@effectstream/sync; do
  if [ -d "$P/node-sdk/sync/src" ] && [ -d "$SYNC_BUN" ]; then
    rm -rf "$SYNC_BUN/src"
    cp -r "$P/node-sdk/sync/src" "$SYNC_BUN/src"
    echo "  SRC-SWAP @effectstream/sync -> packages/node-sdk/sync/src"
  fi
done

# When @effectstream/midnight-contracts is linked to monorepo source, its
# node_modules/@midnight-ntwrk/* symlinks point to the monorepo root's .bun/ copies.
# The template has its own copies in its .bun/ cache. Two WASM copies = instanceof failure.
# Fix: redirect ALL @midnight-ntwrk symlinks to the template's .bun/ copies.
echo ""
echo "Fixing @midnight-ntwrk WASM resolution for linked packages..."
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
