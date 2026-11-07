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
rm -rf "$SCRIPT_DIR/node_modules/@effectstream"
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

# Single Midnight WASM tree from monorepo root (see ../../package.json overrides).
# Ledger v9 split the scope: ledger-v9 and onchain-runtime-v4 publish under
# @midnightntwrk (no hyphen), while compact-* stayed on @midnight-ntwrk. Entries
# are therefore fully scoped rather than bare names.
#
# midnight-js 5 carries the same single-copy requirement for its own classes:
# transaction handles (`LedgerTransaction`) built by one copy of
# midnight-js-types are refused by another ("not-a-handle"). A template script
# that pairs this template's midnight-js-contracts with providers from the
# linked @effectstream/midnight-contracts therefore needs the midnight-js
# packages collapsed onto the monorepo's copies as well.
MIDNIGHT_WASM_PKGS="@midnight-ntwrk/compact-runtime @midnight-ntwrk/compact-js @midnightntwrk/onchain-runtime-v4 @midnightntwrk/ledger-v9 @midnight-ntwrk/platform-js @midnight-ntwrk/midnight-js-types @midnight-ntwrk/midnight-js-protocol @midnight-ntwrk/midnight-js-contracts @midnight-ntwrk/midnight-js-utils @midnight-ntwrk/midnight-js-indexer-public-data-provider @midnight-ntwrk/midnight-js-http-client-proof-provider @midnight-ntwrk/midnight-js-level-private-state-provider @midnight-ntwrk/midnight-js-node-zk-config-provider @midnight-ntwrk/midnight-js-fetch-zk-config-provider"

link_midnight_wasm_from_monorepo() {
  local dest_nm="$1"
  local spec scope pkg bun_pkg pkg_path
  mkdir -p "$dest_nm/@midnight-ntwrk" "$dest_nm/@midnightntwrk"
  for spec in $MIDNIGHT_WASM_PKGS; do
    scope="${spec%%/*}"
    pkg="${spec#*/}"
    for bun_pkg in "$MONOREPO_ROOT/node_modules/.bun/${scope}+${pkg}"@*; do
      pkg_path="$bun_pkg/node_modules/${scope}/${pkg}"
      [ -e "$pkg_path" ] || continue
      rm -rf "$dest_nm/${scope}/${pkg}"
      ln -sf "$pkg_path" "$dest_nm/${scope}/${pkg}"
    done
  done
  # package.json aliases `@midnight-ntwrk/onchain-runtime` to
  # npm:@midnightntwrk/onchain-runtime-v4, so the alias must resolve to the v4 tree.
  for bun_pkg in "$MONOREPO_ROOT/node_modules/.bun/@midnightntwrk+onchain-runtime-v4"@*; do
    pkg_path="$bun_pkg/node_modules/@midnightntwrk/onchain-runtime-v4"
    [ -e "$pkg_path" ] || continue
    rm -rf "$dest_nm/@midnight-ntwrk/onchain-runtime"
    ln -sf "$pkg_path" "$dest_nm/@midnight-ntwrk/onchain-runtime"
    break
  done
}

# Point the template's own .bun copies AT the monorepo's, instead of deleting them.
#
# Bun's isolated linker gives every dependent its own relative symlink
# `.bun/<dependent>@<ver>/node_modules/<scope>/<pkg>` pointing into
# `.bun/<scope>+<pkg>@<ver>/`. Deleting that directory -- what this step used to
# do -- leaves every one of those dangling. Under Ledger v9 that is ~15 links for
# ledger-v9 alone, because each wallet-sdk-* package depends on it, and the first
# import dies with `ENOENT reading ".../@midnightntwrk/ledger-v9"`. Under v8 far
# fewer packages nested a ledger copy, so deleting happened to be survivable.
#
# Replacing the physical package directory with a symlink to the monorepo copy
# keeps every one of those references resolvable AND still leaves exactly one
# physical copy, which is what the WASM `instanceof` checks require.
redirect_template_wasm_to_monorepo() {
  local bun_dir="$NM/.bun"
  [ -d "$bun_dir" ] || return 0
  local spec scope pkg mono entry inner candidate
  for spec in $MIDNIGHT_WASM_PKGS "@midnight-ntwrk/onchain-runtime"; do
    scope="${spec%%/*}"
    pkg="${spec#*/}"
    # The npm alias `@midnight-ntwrk/onchain-runtime` resolves to the v4 package.
    if [ "$pkg" = "onchain-runtime" ]; then
      mono=""
      for candidate in "$MONOREPO_ROOT"/node_modules/.bun/@midnightntwrk+onchain-runtime-v4@*/node_modules/@midnightntwrk/onchain-runtime-v4; do
        [ -d "$candidate" ] || continue
        mono="$candidate"; break
      done
    else
      mono=""
      for candidate in "$MONOREPO_ROOT"/node_modules/.bun/"${scope}+${pkg}"@*/node_modules/"${scope}"/"${pkg}"; do
        [ -d "$candidate" ] || continue
        mono="$candidate"; break
      done
    fi
    [ -n "$mono" ] || continue
    for entry in "$bun_dir"/"${scope}+${pkg}"@*; do
      inner="$entry/node_modules/${scope}/${pkg}"
      [ -e "$inner" ] || continue
      [ -L "$inner" ] && continue
      rm -rf "$inner"
      ln -sfn "$mono" "$inner"
      echo "  REDIRECT .bun/$(basename "$entry") ${scope}/${pkg} -> monorepo"
    done
  done
}

echo ""
echo "Verifying + hoisting transitive deps for linked @effectstream packages..."
# Linked monorepo packages may have deps that the npm-published @effectstream/*
# versions in this template's package.json don't pull in. `--install` hoists
# those into the template root with `bun install --no-save`.
bun run "$MONOREPO_ROOT/packages/build-tools/verify-linked-deps.ts" \
  --template "$SCRIPT_DIR" \
  --link-sh "$SCRIPT_DIR/link.sh" \
  --install

echo ""
link_all_midnight_wasm_trees() {
  local midnight_dir
  while IFS= read -r midnight_dir; do
    link_midnight_wasm_from_monorepo "$(dirname "$midnight_dir")"
  done < <(
    find "$SCRIPT_DIR" "$P/chains/midnight-contracts" \
      -path '*/node_modules/@midnight-ntwrk' -type d 2>/dev/null
  )
}

echo "Linking @midnight-ntwrk WASM packages to monorepo root..."
link_all_midnight_wasm_trees
redirect_template_wasm_to_monorepo
echo "Re-linking WASM after redirecting template .bun copies..."
link_all_midnight_wasm_trees

echo "Refreshing monorepo + @effectstream/midnight-contracts deps (fix stale symlinks)..."
(cd "$MONOREPO_ROOT" && bun install)
rm -rf "$P/chains/midnight-contracts/node_modules/@midnight-ntwrk"
(cd "$P/chains/midnight-contracts" && bun install)

echo ""
echo "Done. You can now run: bun run dev"
