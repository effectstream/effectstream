#!/bin/bash
# Link local @effectstream packages from the monorepo into this template.
#
# Usage: ./link.sh         # clears hoisted node_modules/@effectstream (prior symlinks) then bun install + symlink
#        ./link.sh --repair # corrupt/partial installs: deletes bun.lock and node_modules, then reinstalls + symlink
#
# Runs `bun install`, symlinks workspace + monorepo @effectstream packages, then verifies
# and hoists external transitive deps required by linked monorepo sources
# (verify-linked-deps.ts --install). The npm-published @effectstream/* packages declared
# in this template's package.json pull in some transitives, but `bun install` alone is
# not enough when monorepo source has deps the published versions don't declare yet —
# the verifier's --install path installs those at template root with `--no-save`.
#
# Why clear node_modules/@effectstream before install:
# A finished ./link.sh replaces that tree with symlinks. The next `bun install` can hit EEXIST
# if @effectstream is left in place. Removing hoisted @effectstream first avoids that.
#
# If bun reports "failed to parse lockfile" / missing prod deps under @night-bitcoin/... paths, run ./link.sh --repair once.

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
    echo "Repair: removing bun.lock and node_modules (fixes corrupt locks and partial installs)..."
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
# After --repair node_modules may be absent; rm is a no-op. Otherwise drop prior symlinked @effectstream (EEXIST fix).
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

# Workspace packages (Bun doesn't always create node_modules symlinks for these)
echo "Linking workspace packages..."
link_pkg "night-bitcoin" "contracts-bitcoin"                "$SCRIPT_DIR/packages/contracts-bitcoin"
link_pkg "night-bitcoin" "contracts-midnight"               "$SCRIPT_DIR/packages/contracts-midnight"
link_pkg "night-bitcoin" "midnight-contract-erc7683"        "$SCRIPT_DIR/packages/contracts-midnight/erc7683"
link_pkg "night-bitcoin" "midnight-contract-unshielded-erc20" "$SCRIPT_DIR/packages/contracts-midnight/unshielded-erc20"
link_pkg "night-bitcoin" "database"                         "$SCRIPT_DIR/packages/database"
link_pkg "night-bitcoin" "node"                             "$SCRIPT_DIR/packages/node"
link_pkg "night-bitcoin" "batcher"                          "$SCRIPT_DIR/packages/batcher"
link_pkg "night-bitcoin" "filler"                           "$SCRIPT_DIR/packages/filler"
link_pkg "night-bitcoin" "frontend"                         "$SCRIPT_DIR/packages/frontend"
link_pkg "night-bitcoin" "tests"                            "$SCRIPT_DIR/packages/tests"

echo ""
echo "Linking @effectstream packages from monorepo..."
link_pkg "effectstream" "batcher-sdk"               "$P/batcher"
link_pkg "effectstream" "crypto"                    "$P/effectstream-sdk/crypto"
link_pkg "effectstream" "concise"                   "$P/effectstream-sdk/concise"
link_pkg "effectstream" "config"                    "$P/effectstream-sdk/config"
link_pkg "effectstream" "coroutine"                 "$P/effectstream-sdk/coroutine"
link_pkg "effectstream" "db"                        "$P/node-sdk/db"
link_pkg "effectstream" "event-client"              "$P/effectstream-sdk/events"
link_pkg "effectstream" "explorer"                  "$P/build-tools/explorer"
link_pkg "effectstream" "log"                       "$P/effectstream-sdk/log"
link_pkg "effectstream" "midnight-contracts"        "$P/chains/midnight-contracts"
link_pkg "effectstream" "bitcoin-core"              "$P/binaries/bitcoin-core"
link_pkg "effectstream" "npm-midnight-indexer"      "$P/binaries/midnight-indexer"
link_pkg "effectstream" "npm-midnight-node"         "$P/binaries/midnight-node"
link_pkg "effectstream" "npm-midnight-proof-server" "$P/binaries/midnight-proof-server"
link_pkg "effectstream" "orchestrator"              "$P/build-tools/orchestrator"
link_pkg "effectstream" "orchestrator-v2"           "$P/build-tools/orchestrator-v2"
link_pkg "effectstream" "runtime"                   "$P/node-sdk/runtime"
link_pkg "effectstream" "sm"                        "$P/node-sdk/sm"
link_pkg "effectstream" "utils"                     "$P/effectstream-sdk/utils"
link_pkg "effectstream" "wallets"                   "$P/effectstream-sdk/wallets"

# Linked templates keep their own bun.lock, but the Midnight WASM packages must be a
# single copy. Only symlink WASM packages (not a whole scope — that would overwrite
# e.g. wallet-sdk-address-format with an older transitive copy).
# WASM modules: instanceof checks fail if Bun loads two physical copies (CostModel, etc.).
#
# Ledger v9 split the scope: ledger-v9 and onchain-runtime-v4 publish under
# @midnightntwrk (no hyphen); compact-* stayed on @midnight-ntwrk. Entries are
# therefore fully scoped rather than bare names.
MIDNIGHT_WASM_PKGS="@midnight-ntwrk/compact-runtime @midnight-ntwrk/compact-js @midnightntwrk/onchain-runtime-v4 @midnightntwrk/ledger-v9"

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
  # npm alias: @midnight-ntwrk/onchain-runtime → v4 (absolute path; do not chain symlinks)
  for bun_pkg in "$MONOREPO_ROOT/node_modules/.bun/@midnightntwrk+onchain-runtime-v4"@*; do
    pkg_path="$bun_pkg/node_modules/@midnightntwrk/onchain-runtime-v4"
    [ -e "$pkg_path" ] || continue
    rm -rf "$dest_nm/@midnight-ntwrk/onchain-runtime"
    ln -sf "$pkg_path" "$dest_nm/@midnight-ntwrk/onchain-runtime"
    break
  done
}

# Bun's isolated linker prefers template/node_modules/.bun over hoisted @midnight-ntwrk.
# Drop WASM-related template copies so imports use the monorepo symlinks above.
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
# versions in this template's package.json don't pull in (because the monorepo
# source has been ahead of publish, or because a linked package isn't even
# declared at top-level here). `--install` hoists those into the template root
# with `bun install --no-save`. Also reports version skew for visibility.
bun run "$MONOREPO_ROOT/packages/build-tools/verify-linked-deps.ts" \
  --template "$SCRIPT_DIR" \
  --link-sh "$SCRIPT_DIR/link.sh" \
  --install

# After verify-linked-deps: one WASM tree from monorepo root (not template .bun).
# Bun resolves from many node_modules trees (hoisted, workspace, .bun/node_modules,
# .bun/@scope+pkg@ver/node_modules). Walk all of them — do not maintain a package list.
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
redirect_template_wasm_to_monorepo
echo "Re-linking WASM after redirecting template .bun copies..."
link_all_midnight_wasm_trees

echo "Refreshing monorepo + @effectstream/midnight-contracts deps (fix stale symlinks)..."
(cd "$MONOREPO_ROOT" && bun install)
rm -rf "$P/chains/midnight-contracts/node_modules/@midnight-ntwrk"
(cd "$P/chains/midnight-contracts" && bun install)

echo ""
echo "Done. You can now run: bun run dev"
