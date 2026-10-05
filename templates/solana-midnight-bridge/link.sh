#!/bin/bash
# Link local @effectstream packages from the monorepo into this template.
#
# Usage: ./link.sh          # bun install, then symlink workspace + monorepo packages
#        ./link.sh --repair # corrupt/partial installs: delete bun.lock + node_modules first
#
# `LINK_LOCAL=1 bun run templates/run-template-tests.ts solana-midnight-bridge`
# runs this after `bun install`, so the template exercises the working-tree
# engine with no publish step.
#
# It merges two existing recipes:
# - templates/solana-starter/link.sh: the Solana-side @effectstream packages and
#   the @effectstream/solana-node provisioning (validator + cargo-build-sbf);
# - templates/evm-midnight-v2/link.sh: the Midnight-side packages, the single
#   Midnight WASM copy, and verify-linked-deps.ts --install.
# Plus one rule of its own: the bridge contract's runtime alias
# `@midnight-ntwrk/compact-runtime-0.20` is a different package from the
# engine's compact-runtime and must survive the single-copy step (see
# is_contract_runtime_alias_dir below). The last step proves it.

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
# A finished ./link.sh leaves symlinks in node_modules/@effectstream; drop them
# first or the next `bun install` can fail with EEXIST.
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

  mkdir -p "$NM/@$scope"
  rm -rf "$NM/@$scope/$short_name"
  ln -sf "$local_path" "$NM/@$scope/$short_name"
  echo "  LINK @$scope/$short_name -> $(echo "$local_path" | sed "s|$MONOREPO_ROOT/||")"

  # Bun's isolated linker resolves through node_modules/.bun/<scope>+<name>@<ver>/,
  # not the hoisted symlink: redirect those cached copies to the monorepo too.
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
link_pkg "solana-midnight-bridge" "contracts-solana"   "$SCRIPT_DIR/packages/contracts-solana"
link_pkg "solana-midnight-bridge" "contracts-midnight" "$SCRIPT_DIR/packages/contracts-midnight"
link_pkg "solana-midnight-bridge" "node"               "$SCRIPT_DIR/packages/node"
link_pkg "solana-midnight-bridge" "database"           "$SCRIPT_DIR/packages/database"
link_pkg "solana-midnight-bridge" "cli"                "$SCRIPT_DIR/packages/cli"
link_pkg "solana-midnight-bridge" "tests"              "$SCRIPT_DIR/packages/tests"
link_pkg "solana-midnight-bridge" "delivery"           "$SCRIPT_DIR/packages/delivery"
link_pkg "solana-midnight-bridge" "delivery-passport"  "$SCRIPT_DIR/packages/delivery-passport"

echo ""
echo "Linking @effectstream packages from monorepo..."
# Called twice: here, and again after verify-linked-deps.ts --install below,
# whose `bun install --no-save` re-creates npm copies (new
# .bun/@effectstream+<name>@<ver>+<hash>/ store entries and the hoisted
# node_modules/@effectstream/<name> links). Without the second pass the
# workspace packages (packages/node, contracts-midnight, cli, tests) silently
# resolve the PUBLISHED engine instead of this working tree.
link_effectstream_packages() {
  link_pkg "effectstream" "batcher-sdk"               "$P/batcher"
  link_pkg "effectstream" "chain-types"               "$P/effectstream-sdk/chain-types"
  link_pkg "effectstream" "concise"                   "$P/effectstream-sdk/concise"
  link_pkg "effectstream" "config"                    "$P/effectstream-sdk/config"
  link_pkg "effectstream" "coroutine"                 "$P/effectstream-sdk/coroutine"
  link_pkg "effectstream" "crypto"                    "$P/effectstream-sdk/crypto"
  link_pkg "effectstream" "db"                        "$P/node-sdk/db"
  link_pkg "effectstream" "event-client"              "$P/effectstream-sdk/events"
  link_pkg "effectstream" "explorer"                  "$P/build-tools/explorer"
  link_pkg "effectstream" "log"                       "$P/effectstream-sdk/log"
  link_pkg "effectstream" "midnight-contracts"        "$P/chains/midnight-contracts"
  link_pkg "effectstream" "npm-midnight-indexer"      "$P/binaries/midnight-indexer"
  link_pkg "effectstream" "npm-midnight-node"         "$P/binaries/midnight-node"
  link_pkg "effectstream" "npm-midnight-proof-server" "$P/binaries/midnight-proof-server"
  link_pkg "effectstream" "orchestrator"              "$P/build-tools/orchestrator"
  link_pkg "effectstream" "runtime"                   "$P/node-sdk/runtime"
  link_pkg "effectstream" "sm"                        "$P/node-sdk/sm"
  link_pkg "effectstream" "solana-node"               "$P/binaries/solana-node"
  link_pkg "effectstream" "sync"                      "$P/node-sdk/sync"
  link_pkg "effectstream" "utils"                     "$P/effectstream-sdk/utils"
  link_pkg "effectstream" "wallets"                   "$P/effectstream-sdk/wallets"
}
link_effectstream_packages

# @effectstream/solana-node provides the Solana binaries (solana-test-validator,
# cargo-build-sbf, the solana CLI). Provision the monorepo wrapper directly into
# every workspace package that runs one, mirroring the e2e layout (package dir +
# .bin symlink), so all of them share the monorepo's vendored download:
#   - packages/contracts-solana  chain:start, build-program.ts, deploy-devnet.ts
#   - packages/tests             solana-program.test.ts's throwaway validator
echo ""
echo "Linking @effectstream/solana-node into the packages that run Solana binaries..."
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
  link_solana_node "$SCRIPT_DIR/packages/contracts-solana"
  link_solana_node "$SCRIPT_DIR/packages/tests"
  echo "  LINK @effectstream/solana-node -> packages/contracts-solana, packages/tests"
else
  echo "  SKIP @effectstream/solana-node (not found at $SOLANA_NODE_SRC)"
fi

# ── Single Midnight WASM tree from the monorepo root ─────────────────────────
# WASM modules: `instanceof` checks fail if Bun loads two physical copies.
# Ledger v9 split the scope: ledger-v9 and onchain-runtime-v4 publish under
# @midnightntwrk (no hyphen); compact-* stayed on @midnight-ntwrk. Entries are
# therefore fully scoped rather than bare names.
MIDNIGHT_WASM_PKGS="@midnight-ntwrk/compact-runtime @midnight-ntwrk/compact-js @midnightntwrk/onchain-runtime-v4 @midnightntwrk/ledger-v9"

# The bridge contract (compactc 0.35.0) is compiled against compact-runtime
# 0.20, which the template installs under the npm alias
# `@midnight-ntwrk/compact-runtime-0.20` (packages/contracts-midnight). Bun
# stores an alias under its REAL name, i.e. as
#   node_modules/.bun/@midnight-ntwrk+compact-runtime@0.20.x/node_modules/@midnight-ntwrk/compact-runtime
# so the single-copy steps below, which replace every `compact-runtime` they
# find with the engine's (0.18), would silently collapse the alias. Never
# replace or redirect a compact-runtime 0.20.x directory. Its own dependencies
# (onchain-runtime-v4) are still collapsed to the monorepo copy, which keeps
# ONE onchain-runtime instance for both runtimes.
CONTRACT_RUNTIME_ALIAS_VERSION_PREFIX="0.20."

is_contract_runtime_alias_dir() {
  local pj="$1/package.json" version
  [ -f "$pj" ] || return 1
  grep -q '"name": *"@midnight-ntwrk/compact-runtime"' "$pj" || return 1
  version="$(sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$pj" | head -n 1)"
  case "$version" in
    "$CONTRACT_RUNTIME_ALIAS_VERSION_PREFIX"*) return 0 ;;
  esac
  return 1
}

# The monorepo's copy of <scope>/<pkg>, never a 0.20 contract-runtime copy.
# The monorepo can hold several versions (e.g. compact-runtime 0.16.0 for an
# old e2e fixture next to the engine's 0.18.0-rc.1); like evm-midnight-v2's
# loop, the LAST match in glob (version) order wins.
monorepo_wasm_pkg() {
  local scope="$1" pkg="$2" candidate found=""
  for candidate in "$MONOREPO_ROOT"/node_modules/.bun/"${scope}+${pkg}"@*/node_modules/"${scope}"/"${pkg}"; do
    [ -d "$candidate" ] || continue
    is_contract_runtime_alias_dir "$candidate" && continue
    found="$candidate"
  done
  [ -n "$found" ] || return 1
  echo "$found"
}

link_midnight_wasm_from_monorepo() {
  local dest_nm="$1"
  local spec scope pkg pkg_path
  mkdir -p "$dest_nm/@midnight-ntwrk" "$dest_nm/@midnightntwrk"
  for spec in $MIDNIGHT_WASM_PKGS; do
    scope="${spec%%/*}"
    pkg="${spec#*/}"
    pkg_path="$(monorepo_wasm_pkg "$scope" "$pkg")" || continue
    # Keep only the alias's own PHYSICAL store directory. A symlink named plain
    # `compact-runtime` is a plain-name resolution (e.g. Bun's hoisted fallback
    # in .bun/node_modules, which may point at 0.20) and must become the engine's.
    if [ ! -L "$dest_nm/${scope}/${pkg}" ] && is_contract_runtime_alias_dir "$dest_nm/${scope}/${pkg}"; then
      echo "  KEEP $(echo "$dest_nm" | sed "s|$SCRIPT_DIR/||")/${scope}/${pkg} (contract runtime alias 0.20)"
      continue
    fi
    rm -rf "$dest_nm/${scope}/${pkg}"
    ln -sf "$pkg_path" "$dest_nm/${scope}/${pkg}"
  done
  # The engine aliases `@midnight-ntwrk/onchain-runtime` to
  # npm:@midnightntwrk/onchain-runtime-v4, so the alias must resolve to the v4 tree.
  if pkg_path="$(monorepo_wasm_pkg "@midnightntwrk" "onchain-runtime-v4")"; then
    rm -rf "$dest_nm/@midnight-ntwrk/onchain-runtime"
    ln -sf "$pkg_path" "$dest_nm/@midnight-ntwrk/onchain-runtime"
  fi
}

# Point the template's own .bun copies AT the monorepo's, instead of deleting
# them: every dependent's relative symlink into .bun/<scope>+<pkg>@<ver>/ stays
# resolvable AND exactly one physical copy remains (see evm-midnight-v2/link.sh).
redirect_template_wasm_to_monorepo() {
  local bun_dir="$NM/.bun"
  [ -d "$bun_dir" ] || return 0
  local spec scope pkg mono entry inner
  for spec in $MIDNIGHT_WASM_PKGS "@midnight-ntwrk/onchain-runtime"; do
    scope="${spec%%/*}"
    pkg="${spec#*/}"
    if [ "$pkg" = "onchain-runtime" ]; then
      mono="$(monorepo_wasm_pkg "@midnightntwrk" "onchain-runtime-v4")" || continue
    else
      mono="$(monorepo_wasm_pkg "$scope" "$pkg")" || continue
    fi
    for entry in "$bun_dir"/"${scope}+${pkg}"@*; do
      inner="$entry/node_modules/${scope}/${pkg}"
      [ -e "$inner" ] || continue
      [ -L "$inner" ] && continue
      if is_contract_runtime_alias_dir "$inner"; then
        echo "  KEEP .bun/$(basename "$entry") (contract runtime alias 0.20)"
        continue
      fi
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
echo "Re-linking @effectstream packages after the --no-save install..."
link_effectstream_packages

echo ""
# The single-copy step links INTO the monorepo root's node_modules. Without it
# (a fresh clone or worktree; run-template-tests.ts installs it first under
# LINK_LOCAL=1) every step below would silently do nothing.
if [ ! -d "$MONOREPO_ROOT/node_modules/.bun" ]; then
  echo "Monorepo root is not installed yet; running bun install there first..."
  (cd "$MONOREPO_ROOT" && bun install)
fi

# Bun resolves from many node_modules trees (hoisted, workspace, .bun/node_modules,
# .bun/@scope+pkg@ver/node_modules). Walk all of them — do not maintain a list.
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
echo "Checking the contract runtime alias survived (compact-runtime-0.20 vs the engine's)..."
bun run "$SCRIPT_DIR/packages/contracts-midnight/scripts/check-runtime-alias.ts" --linked "$MONOREPO_ROOT"
# 00058: the Passport bundle's compiled account module lives in packages/delivery-passport/bundle/
# and imports the same alias, which must resolve there too (finding F-G1).
bun run "$SCRIPT_DIR/packages/contracts-midnight/scripts/check-runtime-alias.ts" --linked "$MONOREPO_ROOT" --from "$SCRIPT_DIR/packages/delivery-passport"

echo ""
echo "Done. You can now run: bun run dev"
