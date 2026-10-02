#!/usr/bin/env bash
# Install the pinned Compact compiler 0.35.0 into packages/contracts-midnight/.tools/.
#
#   scripts/fetch-compactc.sh                 install (or re-verify) and print the compactc path
#   scripts/fetch-compactc.sh --verify <dir>  verify an installed toolchain dir: exit 0, or 65
#
# Why a pinned 0.35.0 and not the `compact` CLI: the bridge's mint circuit
# verifies the operator's Solana Ed25519 signature in-circuit with
# `ed25519Verify`, which exists only in the 0.35.0 standard library (built with
# --feature-zkir-v3). The engine's own contracts still use `compact compile
# +0.33.0-rc.2`; this template does not touch them.
#
# The LFDT-Minokawa `compactc-v0.35.0` release publishes no checksum file. The
# digests below are GitHub's per-asset sha256 values, each re-checked against a
# download (00050 P0 S1, evidence p0/s1/s1.1-compactc-pins.txt; Night Market
# scripts/fetch-compactc.sh @ 10b29b1 pins the same values). P0 re-checked the
# two linux-musl archives and darwin-arm64; the darwin-x86_64 pin is Night
# Market's and was not re-downloaded in P0.
#
# The archive is verified BEFORE it is unpacked, every unpacked file is compared
# with the archive's copy, and `compactc --version` must print the pinned line.
# A cached install is re-verified on every run, never trusted by a stamp.
#
# COMPACTC_ZIP_0_35_0=<path> uses an archive you already have (verified the same
# way); otherwise the archive for this platform is downloaded. COMPACTC_DIR
# overrides the install directory. Prints the compactc path on stdout; all other
# output goes to stderr.
set -euo pipefail

VERSION=0.35.0
VERSION_LINE="0.35.0 (debb05f94 2026-09-29)"
BASE_URL="https://github.com/LFDT-Minokawa/compact/releases/download/compactc-v${VERSION}"
PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${COMPACTC_DIR:-$PKG_DIR/.tools/compactc-$VERSION}"
PLATFORM="$(uname -s)-$(uname -m)"

case "$PLATFORM" in
  Linux-x86_64) ASSET="compactc_v${VERSION}_x86_64-unknown-linux-musl.zip"
    SHA=70f22fb8209cc5a8504b2b3d91796cfdab2d71d88807ceef12fab87fed03bae2 ;;
  Linux-aarch64 | Linux-arm64) ASSET="compactc_v${VERSION}_aarch64-unknown-linux-musl.zip"
    SHA=3f74ec6fc98ccca7365c5c915f6015d8893db4527faafe04a90bc36effc40a3a ;;
  Darwin-arm64) ASSET="compactc_v${VERSION}_aarch64-darwin.zip"
    SHA=5898b3d916b2b26f2c110b55a4a4121c22c88eefbd076994e8c3dd3e56c571fc ;;
  Darwin-x86_64) ASSET="compactc_v${VERSION}_x86_64-darwin.zip"
    SHA=adfd3738965d758897d8038b86a5c32e5bd20fb437fc0f1cbc01c8d816b0e212 ;;
  *)
    echo "fetch-compactc: no pinned compactc $VERSION archive for $PLATFORM" >&2
    exit 64 ;;
esac

sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
sha256_stdin() { if command -v sha256sum >/dev/null; then sha256sum | cut -d' ' -f1; else shasum -a 256 | cut -d' ' -f1; fi; }
zip_files() {
  if command -v unzip >/dev/null; then
    unzip -Z1 "$1" | grep -v '/$' || true
  else
    python3 -c 'import sys,zipfile; [print(n) for n in zipfile.ZipFile(sys.argv[1]).namelist() if not n.endswith("/")]' "$1"
  fi
}
zip_file_sha() {
  if command -v unzip >/dev/null; then
    unzip -p "$1" "$2" | sha256_stdin
  else
    python3 -c 'import sys,zipfile,hashlib; print(hashlib.sha256(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2])).hexdigest())' "$1" "$2"
  fi
}

# verify_dir <dir>: 0 when <dir> holds the pinned archive, every one of its files
# unchanged, and a compactc that prints the pinned version line; 1 otherwise.
verify_dir() {
  local dir="$1" zip="$1/artifact.zip" got n=0 f
  if [[ ! -f "$zip" ]]; then
    echo "fetch-compactc: $dir has no verified archive (artifact.zip)" >&2
    return 1
  fi
  got="$(sha256 "$zip")"
  if [[ "$got" != "$SHA" ]]; then
    echo "fetch-compactc: $zip sha256 $got, expected $SHA ($PLATFORM)" >&2
    return 1
  fi
  while IFS= read -r f; do
    [[ -n "$f" ]] || continue
    n=$((n + 1))
    if [[ ! -f "$dir/$f" ]] || [[ "$(sha256 "$dir/$f")" != "$(zip_file_sha "$zip" "$f")" ]]; then
      echo "fetch-compactc: $dir/$f is missing or differs from the verified archive" >&2
      return 1
    fi
  done < <(zip_files "$zip")
  if [[ "$n" -eq 0 ]]; then
    echo "fetch-compactc: $zip lists no files" >&2
    return 1
  fi
  if [[ "$("$dir/compactc" --version 2>/dev/null)" != "$VERSION_LINE" ]]; then
    echo "fetch-compactc: $dir/compactc --version is not '$VERSION_LINE'" >&2
    return 1
  fi
}

if [[ "${1:-}" == "--verify" ]]; then
  dir="${2:?usage: fetch-compactc.sh --verify <dir>}"
  if verify_dir "$dir"; then
    echo "fetch-compactc: compactc $VERSION in $dir verified ($SHA)" >&2
    exit 0
  fi
  echo "fetch-compactc: compactc $VERSION in $dir refused" >&2
  exit 65
fi

if [[ -d "$DEST" ]]; then
  if verify_dir "$DEST"; then
    echo "$DEST/compactc"
    exit 0
  fi
  echo "fetch-compactc: the cached compactc in $DEST failed verification; reinstalling" >&2
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
zip="$tmp/$ASSET"
if [[ -n "${COMPACTC_ZIP_0_35_0:-}" ]]; then
  cp "$COMPACTC_ZIP_0_35_0" "$zip"
elif [[ -f "$DEST/artifact.zip" ]] && [[ "$(sha256 "$DEST/artifact.zip")" == "$SHA" ]]; then
  cp "$DEST/artifact.zip" "$zip"
else
  echo "fetch-compactc: downloading $ASSET" >&2
  curl -fsSL --retry 3 -o "$zip" "$BASE_URL/$ASSET"
fi
got="$(sha256 "$zip")"
if [[ "$got" != "$SHA" ]]; then
  echo "fetch-compactc: SHA-256 mismatch for $ASSET: expected $SHA, got $got" >&2
  exit 65
fi
rm -rf "$DEST"
mkdir -p "$DEST"
if command -v unzip >/dev/null; then
  unzip -o -q "$zip" -d "$DEST"
else
  python3 -c 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$zip" "$DEST"
fi
chmod +x "$DEST"/compactc "$DEST"/compactc.bin "$DEST"/zkir "$DEST"/zkir-v3 2>/dev/null || true
cp "$zip" "$DEST/artifact.zip"
if ! verify_dir "$DEST"; then
  echo "fetch-compactc: the fresh install of compactc $VERSION in $DEST did not verify" >&2
  exit 65
fi
echo "fetch-compactc: compactc $VERSION verified ($SHA) in $DEST" >&2
echo "$DEST/compactc"
