#!/bin/bash
# Link local @effectstream packages from the monorepo into this template.
# Usage: ./link.sh
# Run this instead of `bun install` when developing inside the monorepo — it
# points the template at monorepo SOURCE, so SDK changes can be exercised here
# before anything is published to npm.
#
# This template is frontend-only, so it links far fewer packages than the
# full-stack templates: it depends on just @effectstream/wallets and
# @effectstream/midnight-contracts from the monorepo. (@effectstream/
# mip-zswap-offer lives in its own repo and is always consumed from npm.)
#
# The @midnight-ntwrk WASM dedupe below is not optional. Those packages are
# wasm-bindgen modules whose exported classes carry per-instance type identity,
# so two copies in one bundle make every cross-copy value fail an instanceof
# check — the symptom is errors like "expected instance of _DustParameters" at
# wallet connect. Linking every tree to the monorepo's single copy is what keeps
# that from coming back once symlinked sources drag in their own deps.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
P="$MONOREPO_ROOT/packages"

echo "Linking @effectstream packages from monorepo..."
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

  mkdir -p "$NM/@$scope"
  rm -rf "$NM/@$scope/$short_name"
  ln -sf "$local_path" "$NM/@$scope/$short_name"
  echo "  LINK @$scope/$short_name -> $(echo "$local_path" | sed "s|$MONOREPO_ROOT/||")"

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

link_pkg "effectstream" "wallets"            "$P/effectstream-sdk/wallets"
link_pkg "effectstream" "utils"              "$P/effectstream-sdk/utils"
# concise + crypto sit in the browser graph via the wallets barrel. Linked so
# their `@effectstream/utils/types` subpath imports (instead of the root
# barrel, which runs dotenv at import time) actually take effect — published
# copies still carry the root import until the next release.
link_pkg "effectstream" "concise"            "$P/effectstream-sdk/concise"
link_pkg "effectstream" "crypto"             "$P/effectstream-sdk/crypto"
# midnight-contracts is linked for its `./wallet-info` subpath, which
# MidnightLocal.connectFromSeed imports to build the wallet facade in the
# BROWSER. That entry point must stay free of module-scope node built-in
# dereferences — see the namespace-import note on `node:fs` in
# src/get-wallet-info.ts.
link_pkg "effectstream" "midnight-contracts" "$P/chains/midnight-contracts"

# ── Single-instance rule ────────────────────────────────────────────────────
#
# Two families must resolve to exactly ONE physical copy across the template
# AND every linked monorepo package, because both brand values with
# module-scoped identity:
#
#   @midnight-ntwrk/*   wasm-bindgen classes — a value from copy A fails
#                       `instanceof` against copy B's class
#                       ("expected instance of _DustParameters")
#   @midnightntwrk/*    wallet-sdk. address-format brands objects with a
#                       module-level `Symbol('MidnightBech32m')`, and
#                       MidnightBech32m.encode does `item[Bech32mSymbol].encode`
#                       — so a dust address branded by copy A reads as undefined
#                       through copy B ("Cannot read properties of undefined
#                       (reading 'encode')")
#
# Linking a monorepo package makes this materially worse: the linked package
# resolves its deps from the MONOREPO's store while the template resolves its
# own, guaranteeing two copies unless we collapse them here.
MIDNIGHT_WASM_PKGS="compact-runtime compact-js onchain-runtime-v3 onchain-runtime-v2 ledger-v8"

# Collapse the whole @midnightntwrk (unhyphenated) wallet-sdk family onto the
# monorepo's copies. Enumerated from the store rather than hardcoded, so a new
# wallet-sdk package is covered automatically.
link_midnightntwrk_sdk_from_monorepo() {
  local dest_nm="$1"
  local bun_pkg pkg pkg_path
  [ -d "$MONOREPO_ROOT/node_modules/.bun" ] || return 0
  mkdir -p "$dest_nm/@midnightntwrk"
  for bun_pkg in "$MONOREPO_ROOT/node_modules/.bun/@midnightntwrk+"*; do
    [ -d "$bun_pkg" ] || continue
    for pkg_path in "$bun_pkg/node_modules/@midnightntwrk/"*; do
      [ -d "$pkg_path" ] || continue
      pkg="$(basename "$pkg_path")"
      rm -rf "$dest_nm/@midnightntwrk/$pkg"
      ln -sf "$pkg_path" "$dest_nm/@midnightntwrk/$pkg"
    done
  done
}

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

SCAN_ROOTS="$SCRIPT_DIR $P/effectstream-sdk/wallets $P/chains/midnight-contracts"

link_all_midnight_wasm_trees() {
  local midnight_dir
  while IFS= read -r midnight_dir; do
    link_midnight_wasm_from_monorepo "$(dirname "$midnight_dir")"
  done < <(
    find $SCAN_ROOTS -path '*/node_modules/@midnight-ntwrk' -type d 2>/dev/null
  )
}

link_all_midnightntwrk_sdk_trees() {
  local dir
  # Every node_modules that already carries an @midnightntwrk tree, plus the
  # template root itself (which may hold the only real copy).
  link_midnightntwrk_sdk_from_monorepo "$NM"
  while IFS= read -r dir; do
    link_midnightntwrk_sdk_from_monorepo "$(dirname "$dir")"
  done < <(
    find $SCAN_ROOTS -path '*/node_modules/@midnightntwrk' -type d 2>/dev/null
  )
}

echo ""
echo "Verifying + hoisting transitive deps for linked @effectstream packages..."
bun run "$MONOREPO_ROOT/packages/build-tools/verify-linked-deps.ts" \
  --template "$SCRIPT_DIR" \
  --link-sh "$SCRIPT_DIR/link.sh" \
  --install

echo ""
echo "Linking @midnight-ntwrk WASM packages to monorepo root..."
link_all_midnight_wasm_trees
drop_template_wasm_bun_copies
echo "Re-linking WASM after dropping template .bun copies..."
link_all_midnight_wasm_trees

echo "Linking @midnightntwrk wallet-sdk to monorepo root (single Bech32m symbol)..."
link_all_midnightntwrk_sdk_trees

# Fail loudly rather than leaving a duplicate to surface later as an opaque
# "undefined (reading 'encode')" or "expected instance of _X" at runtime.
echo ""
echo "Verifying single-instance rule..."
dupe_check() {
  local scope="$1" pkg="$2" n
  n=$(find $SCAN_ROOTS -path "*/node_modules/$scope/$pkg" 2>/dev/null \
        | while read -r p; do (cd "$p" 2>/dev/null && pwd -P); done | sort -u | wc -l | tr -d ' ')
  if [ "$n" -gt 1 ]; then
    echo "  FAIL $scope/$pkg resolves to $n distinct copies — module-scoped identity will break."
    return 1
  fi
  echo "  ok   $scope/$pkg ($n copy)"
}
rc=0
dupe_check "@midnightntwrk" "wallet-sdk-address-format" || rc=1
dupe_check "@midnight-ntwrk" "ledger-v8" || rc=1
[ "$rc" -eq 0 ] || { echo "Single-instance check failed."; exit 1; }

echo ""
echo "Done. Now run: bun run dev"
echo "(The contract is compiled + verified by the predev hook.)"
