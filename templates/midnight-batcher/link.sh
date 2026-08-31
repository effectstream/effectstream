#!/bin/bash
# Link local @effectstream packages from the monorepo into this template, and
# write the .env consumed by docker-compose (MONOREPO_ROOT bind-mount path).
#
# This template is Docker-first: the `app` container bind-mounts the monorepo
# at the same absolute path as the host, so the symlinks created here resolve
# identically inside the container. Run this once before `docker compose up`,
# and re-run after `bun install` in either the template or the monorepo.
#
# Usage: ./link.sh           # bun install + symlink monorepo packages
#        ./link.sh --repair  # delete bun.lock + node_modules first

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
P="$MONOREPO_ROOT/packages"

echo "Linking @effectstream packages from monorepo..."
echo "  Monorepo: $MONOREPO_ROOT"
echo ""

case "${1:-}" in
  "")
    ;;
  --repair)
    echo "Repair: removing bun.lock and node_modules..."
    rm -f "$SCRIPT_DIR/bun.lock"
    rm -rf "$SCRIPT_DIR/node_modules"
    ;;
  *)
    echo "Unknown option: $1"
    echo "Usage: ./link.sh [--repair]"
    exit 1
    ;;
esac

cd "$SCRIPT_DIR"
rm -rf "$SCRIPT_DIR/node_modules/@effectstream"

echo "Running bun install..."
bun install

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

  # Bun resolves bins via node_modules/.bun/@scope+name@ver/, not hoisted symlinks.
  if [ "$scope" = "effectstream" ]; then
    for bun_dir in "$NM/.bun/@effectstream+${short_name}@"*/; do
      [ -d "$bun_dir" ] || continue
      cached="$bun_dir/node_modules/@effectstream/$short_name"
      mkdir -p "$(dirname "$cached")"
      rm -rf "$cached"
      ln -sf "$local_path" "$cached"
      echo "  RELINK .bun/@effectstream/$short_name"
    done
  fi
}

echo "Linking workspace packages..."
link_pkg "midnight-batcher" "batcher"            "$SCRIPT_DIR/packages/batcher"
link_pkg "midnight-batcher" "contracts-midnight" "$SCRIPT_DIR/packages/contracts-midnight"
link_pkg "midnight-batcher" "midnight-contract"  "$SCRIPT_DIR/packages/contracts-midnight/contract-counter"
link_pkg "midnight-batcher" "scripts"            "$SCRIPT_DIR/packages/scripts"
link_pkg "midnight-batcher" "tests"              "$SCRIPT_DIR/packages/tests"

echo ""
echo "Linking @effectstream packages from monorepo..."
link_pkg "effectstream" "batcher-sdk"        "$P/batcher"
link_pkg "effectstream" "crypto"             "$P/effectstream-sdk/crypto"
link_pkg "effectstream" "concise"            "$P/effectstream-sdk/concise"
link_pkg "effectstream" "config"             "$P/effectstream-sdk/config"
link_pkg "effectstream" "coroutine"          "$P/effectstream-sdk/coroutine"
link_pkg "effectstream" "log"                "$P/effectstream-sdk/log"
link_pkg "effectstream" "event-client"       "$P/effectstream-sdk/events"
link_pkg "effectstream" "midnight-contracts" "$P/chains/midnight-contracts"
link_pkg "effectstream" "utils"              "$P/effectstream-sdk/utils"

# Linked templates keep their own bun.lock, but @midnight-ntwrk WASM must be a
# single physical copy — instanceof checks fail if Bun loads two copies.
MIDNIGHT_WASM_PKGS="compact-runtime compact-js onchain-runtime-v3 onchain-runtime-v2 ledger-v8"

link_midnight_wasm_from_monorepo() {
  local dest_nm="$1"
  local pkg bun_pkg pkg_path
  mkdir -p "$dest_nm/@midnight-ntwrk"
  for pkg in $MIDNIGHT_WASM_PKGS; do
    for bun_pkg in "$MONOREPO_ROOT/node_modules/.bun/@midnight-ntwrk+${pkg}"@*; do
      pkg_path="$bun_pkg/node_modules/@midnight-ntwrk/$pkg"
      [ -e "$pkg_path" ] || continue
      rm -rf "$dest_nm/@midnight-ntwrk/$pkg"
      ln -sf "$pkg_path" "$dest_nm/@midnight-ntwrk/$pkg"
    done
  done
  # npm alias: @midnight-ntwrk/onchain-runtime → v3 (absolute path; no chained symlinks)
  for bun_pkg in "$MONOREPO_ROOT/node_modules/.bun/@midnight-ntwrk+onchain-runtime-v3"@*; do
    pkg_path="$bun_pkg/node_modules/@midnight-ntwrk/onchain-runtime-v3"
    [ -e "$pkg_path" ] || continue
    rm -rf "$dest_nm/@midnight-ntwrk/onchain-runtime"
    ln -sf "$pkg_path" "$dest_nm/@midnight-ntwrk/onchain-runtime"
    break
  done
}

drop_template_wasm_bun_copies() {
  local bun_dir="$NM/.bun"
  [ -d "$bun_dir" ] || return 0
  for prefix in \
    "@midnight-ntwrk+compact-runtime@" \
    "@midnight-ntwrk+compact-js@" \
    "@midnight-ntwrk+onchain-runtime-v3@" \
    "@midnight-ntwrk+onchain-runtime-v2@" \
    "@midnight-ntwrk+onchain-runtime@" \
    "@midnight-ntwrk+ledger-v8@"; do
    for entry in "$bun_dir"/${prefix}*; do
      [ -e "$entry" ] || continue
      rm -rf "$entry"
    done
  done
}

echo ""
echo "Verifying + hoisting transitive deps for linked @effectstream packages..."
bun run "$MONOREPO_ROOT/packages/build-tools/verify-linked-deps.ts" \
  --template "$SCRIPT_DIR" \
  --link-sh "$SCRIPT_DIR/link.sh" \
  --install

link_all_midnight_wasm_trees() {
  local midnight_dir
  while IFS= read -r midnight_dir; do
    link_midnight_wasm_from_monorepo "$(dirname "$midnight_dir")"
  done < <(
    find "$SCRIPT_DIR" "$P/chains/midnight-contracts" \
      -path '*/node_modules/@midnight-ntwrk' -type d 2>/dev/null
  )
}

echo ""
echo "Linking @midnight-ntwrk WASM packages to monorepo root..."
link_all_midnight_wasm_trees
drop_template_wasm_bun_copies
echo "Re-linking WASM after dropping template .bun copies..."
link_all_midnight_wasm_trees

echo "Refreshing monorepo + @effectstream/midnight-contracts deps (fix stale symlinks)..."
(cd "$MONOREPO_ROOT" && bun install)
rm -rf "$P/chains/midnight-contracts/node_modules/@midnight-ntwrk"
(cd "$P/chains/midnight-contracts" && bun install)

echo ""
echo "Writing .env (MONOREPO_ROOT for docker-compose bind mount)..."
if [ -f "$SCRIPT_DIR/.env" ] && grep -q "^MONOREPO_ROOT=" "$SCRIPT_DIR/.env"; then
  sed -i "s|^MONOREPO_ROOT=.*|MONOREPO_ROOT=$MONOREPO_ROOT|" "$SCRIPT_DIR/.env"
else
  echo "MONOREPO_ROOT=$MONOREPO_ROOT" >> "$SCRIPT_DIR/.env"
fi

echo ""
echo "Done. Next: bun run compile:contract && docker compose up -d"
