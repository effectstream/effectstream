#!/bin/bash

# Build with Docker:
# > DOCKER_DEFAULT_PLATFORM=linux/amd64 docker buildx build -t paima-engine-test .
# > DOCKER_DEFAULT_PLATFORM=linux/amd64 docker run paima-engine-test
set -e  # Exit on any error

# deno upgrade --version 2.4.3
deno --version
forge --version
node --version
npm --version

# Compile Contracts & Deploy Contracts
deno task -f @e2e/midnight-contracts midnight-contract:compile
deno task -f @e2e/evm-contracts build:mod

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
DISABLE_LINUX_YACI=true PAIMA_E2E_LOG_DEBUG=1 deno task -f @e2e/node test

