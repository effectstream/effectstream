#!/bin/bash
# E2E test runner for Docker — delegates to e2e/runner.ts

# Pre-compile EVM contracts so the orchestrator finds cached artifacts.
# solc binary is pre-downloaded in the Dockerfile so no webstreams download needed.
cd /app/e2e/shared/contracts/evm
bun run build:hardhat
cd /app

exec bun run e2e/runner.ts
