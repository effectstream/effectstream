#!/bin/sh
set -eu

BUNDLE_WORKSPACE=api node ./esbuildconfig.cjs
BUNDLE_WORKSPACE=state-transition node ./esbuildconfig.cjs

cp api/src/tsoa/swagger.json ./packaged/openapi.json

rm -rf ../packaged
mv -f ./packaged ..


echo "✅ Game code bundled and packaged in the parent folder."
echo "To start your game node, simply use: ./paima-engine run"
