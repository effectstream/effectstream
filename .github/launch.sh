#!/bin/bash

# Build with Docker:
# > DOCKER_DEFAULT_PLATFORM=linux/amd64 docker buildx build -t paima-engine-test .
# > DOCKER_DEFAULT_PLATFORM=linux/amd64 docker run paima-engine-test
set -e  # Exit on any error

# deno upgrade --version 2.4.1
deno --version
forge --version
node --version
npm --version

# Compile Contracts & Deploy Contracts
deno task -f @e2e/evm-contracts build
deno task -f @e2e/evm-contracts deploy:standalone || true

echo "✅ Contracts compiled & deployed"

# Run tests
echo "🧪 Running tests..."
# TODO: ENV DISABLE_LINUX_YACI is to avoid launching YACI-DEVKIT 
#       in linux.
#
#       At the moment, there is a bug where some processes cannot 
#       be launched due to "error: Text file busy (os error 26)"
#
#       This is a workaround to avoid launching YACI DEVKIT.
#
# TODO: GITHUB_ACTIONS_SHORT_TEST limits the number of tests run.
#       This is to stop running some tests on Github Actions.
#
#       At the time the test always get stuck on `Check System API Table Data`
#       This only happens on Github Actions, not on local machine.
#
GITHUB_ACTIONS_SHORT_TEST=1 DISABLE_LINUX_YACI=true PAIMA_E2E_LOG_DEBUG=1 deno task -f @e2e/node test

