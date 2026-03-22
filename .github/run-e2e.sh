#!/bin/bash
# E2E-V2 test runner for Docker — delegates to e2e-v2/runner.ts

# Pre-compile EVM contracts. Bun's webstreams polyfill crashes and
# hangs on first solc WASM download — but solc gets cached regardless.
# Kill the hung first attempt with timeout, then retry with cached solc.
cd /app/e2e-v2/shared/contracts/evm
timeout 60 bun run build:hardhat || bun run build:hardhat
cd /app

exec bun run e2e-v2/runner.ts
