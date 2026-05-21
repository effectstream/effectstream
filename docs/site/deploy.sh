#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_FOLDER="${1:-}"
BUILD_DIR="$SCRIPT_DIR/build"

if [ -z "$DOCS_FOLDER" ]; then
  echo "Usage: ./deploy.sh <path-to-docs-repo>"
  echo "  The docs repo is a clone of https://github.com/effectstream/docs"
  exit 1
fi

if [ ! -d "$DOCS_FOLDER/.git" ]; then
  echo "Error: $DOCS_FOLDER is not a git repository"
  echo "  Clone https://github.com/effectstream/docs first"
  exit 1
fi

echo "Building docs..."
cd "$SCRIPT_DIR"
bun run build

echo "Syncing build to $DOCS_FOLDER..."
# Remove old content but preserve .git and README.md
find "$DOCS_FOLDER" -mindepth 1 -maxdepth 1 \
  ! -name '.git' \
  ! -name 'README.md' \
  ! -name '.nojekyll' \
  ! -name 'CNAME' \
  -exec rm -rf {} +

cp -r "$BUILD_DIR"/* "$DOCS_FOLDER/"

# GitHub Pages needs .nojekyll to serve _ prefixed files
touch "$DOCS_FOLDER/.nojekyll"

echo "Committing and pushing..."
cd "$DOCS_FOLDER"
git add -A
if git diff --cached --quiet; then
  echo "No changes to deploy."
  exit 0
fi
git commit -m "deploy: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
git push

echo "Deployed to https://effectstream.github.io/docs/"
