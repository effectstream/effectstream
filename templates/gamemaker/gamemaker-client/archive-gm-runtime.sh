#!/bin/bash
set -euo pipefail
# Create a .tar containing a Game Maker runtime and license that can be
# extracted into $HOME on CI to use to compile the game's frontend. The archive
# should be kept private. Linux only.

# -----------------------------------------------------------------------------
# Configuration

# GameMaker runtime version
runtime="$(cat "$(dirname "$0")/runtime-version.txt")"

# -----------------------------------------------------------------------------
# Detect runtime and license file
pushd "$HOME" >/dev/null  # So that the .tar file has the right relative paths.
if test -d ".local/share/GameMakerStudio2-Beta/Cache/runtimes/runtime-$runtime"; then
  # Linux
  rp=".local/share/GameMakerStudio2-Beta/Cache/runtimes/runtime-$runtime"
  echo "Storing runtime: ~/$rp"
else
  echo "GM runtime missing: $runtime" >&2
  exit 1
fi

# Test that the runtime has Linux Igor and the HTML5 exporter.
require_file() {
  if ! test -f "$rp/$1"; then
    echo "Runtime missing file: $1" >&2
    exit 1
  fi
}
require_file "GmlSpec.xml"  # base
require_file "bin/igor/linux/x64/Igor"  # base-module-linux-x64
require_file "html5/index.html"  # html5

license_candidates=(".config/GameMakerStudio2-Beta/"*"/licence.plist")
if test "${#license_candidates[@]}" -eq 0; then
  echo "Couldn't find a license.plist file in $HOME/.config/GameMakerStudio2-Beta" >&2
  exit 1
fi
lf="${license_candidates[0]}"
echo "Storing license: ~/$lf"
popd >/dev/null

user=$lf
user=${user%/licence.plist}
user=${user##*/}
outfile="gm_${runtime}_${user}.tar"

# -----------------------------------------------------------------------------
# Tar and summarize.
tar -c -f "$outfile" -C "$HOME" "$rp" "$lf"
ls -lh "$outfile"
