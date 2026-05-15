#!/bin/bash
# Link local packages and apply patches for this template.
# Usage: ./link.sh
# - Links packages not published to npm (cardano-contracts)
# - Patches published runtime to skip MQTT broker under Bun

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
P="$MONOREPO_ROOT/packages"
NM="$SCRIPT_DIR/node_modules"

# Guard: the linked SDK packages (sm, runtime, event-server, event-client) all
# import workspace siblings via `workspace:*`. Bun resolves those siblings by
# walking up from the source files in $MONOREPO_ROOT/packages — but the
# workspace symlinks (e.g. packages/node-sdk/runtime/node_modules/@effectstream/sync)
# only exist after `bun install` runs at the monorepo root. Without that,
# `bun run dev` fails with "Cannot find module '@effectstream/sync' from
# .../packages/node-sdk/runtime/src/main.ts".
if [ ! -d "$MONOREPO_ROOT/node_modules" ] || \
   [ ! -e "$P/node-sdk/runtime/node_modules/@effectstream/sync" ]; then
  echo "ERROR: monorepo workspace deps are not installed."
  echo ""
  echo "  Run 'bun install' at the monorepo root first:"
  echo "    cd $MONOREPO_ROOT && bun install"
  echo ""
  echo "  Then re-run this script from $SCRIPT_DIR."
  exit 1
fi

echo "Linking unpublished packages..."

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

link_pkg "effectstream" "cardano-contracts"  "$P/chains/cardano-contracts"

# Link SDK packages that the custom-events work touches. The template's
# node_modules normally has the published versions; we replace them with
# symlinks to the monorepo source so dev changes take effect immediately.
#
# Bun's module resolver walks up from the actual file location (not the
# symlink-from path), so workspace:* deps inside these packages resolve back
# to the monorepo root's node_modules, which itself is a workspace install
# pointing at the same source. The result: every internal SDK import sees
# the monorepo source, end-to-end.
link_pkg "effectstream" "sm"           "$P/node-sdk/sm"
link_pkg "effectstream" "runtime"      "$P/node-sdk/runtime"
link_pkg "effectstream" "event-server" "$P/node-sdk/events"
link_pkg "effectstream" "event-client" "$P/effectstream-sdk/events"

# NOTE: the obsolete "Patching runtime MQTT broker for Bun" block was removed.
# The migrate/mqtt-opifex PR replaced the broker stack with @seriousme/opifex,
# which works natively under Bun. Linking the monorepo runtime above gives us
# the working broker; the old text-substitution patch is no longer needed and
# would only mask new bugs.

echo ""
echo "Done."
