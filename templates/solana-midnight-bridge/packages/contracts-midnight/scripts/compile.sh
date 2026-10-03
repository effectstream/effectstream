#!/usr/bin/env bash
# Compile contract-bridge/src/bridge.compact with the pinned compactc 0.35.0
# (--feature-zkir-v3, proving keys included), then pin the module to the
# compact-runtime 0.20 alias (scripts/pin-contract-runtime.mjs).
#
#   scripts/compile.sh            compile unless the output is up to date
#   FORCE_COMPILE=1 scripts/compile.sh
#   scripts/compile.sh --skip-zk  TypeScript only, no keys (cannot deploy)
#
# Output: contract-bridge/src/managed/ (gitignored, as in every Midnight
# template). The build is written to a temporary directory and swapped in only
# after the pin step succeeded, so a failed build never leaves a half-written
# managed/ behind. `managed/.build-stamp` records the source sha256, the
# compiler version line and whether keys were built; an identical stamp skips
# the compile (about 30 s natively, mostly the k17 proving key).
#
# Proving keys need the BLS SRS (`bls_midnight_2p14`, `2p17`) from
# $MIDNIGHT_PP or ~/.cache/midnight/zk-params. The two large ones are checked
# against the digests effectstream/binaries 0.3.120 publishes when present.
#
# Keep the contract as proven in 00050 P0 S1 (source sha256 b6150529…): the
# mint circuit is k17 with only about 1.8k table rows of headroom, so any
# growth (a longer signed message, more logic) moves it to k18 and roughly
# doubles proving time and memory.
set -euo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$PKG_DIR/contract-bridge/src/bridge.compact"
OUT="$PKG_DIR/contract-bridge/src/managed"
SKIP_ZK=""
for arg in "$@"; do
  case "$arg" in
    --skip-zk) SKIP_ZK="--skip-zk" ;;
    *) echo "usage: scripts/compile.sh [--skip-zk]" >&2; exit 64 ;;
  esac
done

sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }

COMPACTC="$(bash "$PKG_DIR/scripts/fetch-compactc.sh")"
VERSION_LINE="$("$COMPACTC" --version)"
SRC_SHA="$(sha256 "$SRC")"
KEYS="keys"; [[ -n "$SKIP_ZK" ]] && KEYS="no-keys"
STAMP="source=$SRC_SHA compiler=$VERSION_LINE $KEYS"

if [[ -z "${FORCE_COMPILE:-}" ]] && [[ -f "$OUT/.build-stamp" ]] && [[ "$(cat "$OUT/.build-stamp")" == "$STAMP" ]] \
  && [[ -f "$OUT/contract/index.js" ]]; then
  echo "compile: $OUT is up to date ($STAMP); FORCE_COMPILE=1 rebuilds" >&2
  exit 0
fi

# SRS pins (effectstream/binaries 0.3.120). Checked only when present: the
# compiler fetches what it needs otherwise.
PARAMS="${MIDNIGHT_PP:-$HOME/.cache/midnight/zk-params}"
srs_pin() { case "$1" in
  bls_midnight_2p17) echo 4a9ef6c7c0619aab74eede44b13e753e3ba54508a02dd3b7106a949aabb73b74 ;;
  bls_midnight_2p18) echo e8436dc5d8b598f169c127c745135d889744007e6d384ff126df8d1332522f86 ;;
esac; }
if [[ -z "$SKIP_ZK" ]]; then
  for f in bls_midnight_2p17 bls_midnight_2p18; do
    if [[ -f "$PARAMS/$f" ]] && [[ "$(sha256 "$PARAMS/$f")" != "$(srs_pin "$f")" ]]; then
      echo "compile: SRS $PARAMS/$f does not match its pinned sha256; refusing to build keys with it" >&2
      exit 70
    fi
  done
fi

TMP="$OUT.tmp.$$"
rm -rf "$TMP"
trap 'rm -rf "$TMP"' EXIT
echo "compile: $VERSION_LINE --feature-zkir-v3 ${SKIP_ZK:-(with keys)} $SRC" >&2
t0=$(date +%s)
"$COMPACTC" --feature-zkir-v3 $SKIP_ZK "$SRC" "$TMP"
t1=$(date +%s)
node "$PKG_DIR/scripts/pin-contract-runtime.mjs" "$TMP"
if grep -q "from '@midnight-ntwrk/compact-runtime'" "$TMP/contract/index.js"; then
  echo "compile: the pinned module still imports the plain compact-runtime" >&2
  exit 70
fi
echo "$STAMP" > "$TMP/.build-stamp"
rm -rf "$OUT"
mv "$TMP" "$OUT"
trap - EXIT
echo "compile: done in $((t1 - t0)) s -> $OUT" >&2
{
  echo "COMPILER $VERSION_LINE SECONDS $((t1 - t0)) $KEYS"
  echo "SOURCE $SRC_SHA bridge.compact"
  find "$OUT" -type f ! -name .build-stamp | sort | while read -r f; do
    echo "OUT ${f#"$OUT"/} $(wc -c < "$f" | tr -d ' ') $(sha256 "$f")"
  done
} >&2
