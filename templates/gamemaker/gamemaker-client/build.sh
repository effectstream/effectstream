#!/bin/bash
set -euo pipefail
shopt -s nullglob

# Requires that you have logged into the GameMaker IDE to supply the runtime
# and a license file.

# -----------------------------------------------------------------------------
# Configuration

# GameMaker runtime version.
runtime="$(cat "$(dirname "$0")/runtime-version.txt")"
# Directory of game to compile.
game="$(dirname "$0")"
# Input yyp file to compile.
project="$game/example-game.yyp"
# Target folder. Where the build actually gets put.
tf="$game/gm_cli_build"

# -----------------------------------------------------------------------------
# Detect runtime and license file and compute target/temp/cache folders

# runtime folder and Igor executable
if test -d "$HOME/.local/share/GameMakerStudio2-Beta/Cache/runtimes/runtime-$runtime"; then
  # Linux
  rp="$HOME/.local/share/GameMakerStudio2-Beta/Cache/runtimes/runtime-$runtime"
  igor="$rp/bin/igor/linux/x64/Igor"
elif test -d "/Users/Shared/GameMakerStudio2/Cache/runtimes/runtime-$runtime"; then
  # Mac
  rp="/Users/Shared/GameMakerStudio2/Cache/runtimes/runtime-$runtime"
  igor="$rp/bin/igor/osx/arm64/Igor"
else
  echo "GM runtime missing: $runtime" >&2
  exit 1
fi

# Detect a license file
license_candidates=("$HOME/.config/GameMakerStudio2"*"/"*"/licence.plist")
if test "${#license_candidates[@]}" -eq 0; then
  echo "Couldn't find a licence.plist file in" "$HOME/.config/GameMakerStudio2"* >&2
  exit 1
fi
lf="${license_candidates[0]}"

# Cache folder. Must be absolute path. Keeping cache saves ~12s (50%) per build.
cache="$(realpath "$game/gm_cli_cache")"
# Output folder. Temporary staging for target folder. Must have trailing slash.
of="$(mktemp -d)/"
# Temporary directory. Not always used.
temp="$(mktemp -d)"

set -x  # Log the rest of the commands ----------------------------------------
rm -rf "$tf"
# Compile
"$igor" --project="$project" --rp="$rp" --lf="$lf" --of="$of" --tf="$tf" --temp="$temp" --cache="$cache" html5 folder
rm -rf "$of" "$temp"
