# Effectstream

## Quick Start

Start at [Effectstream's Template](./templates/evm-midnight/) for quickstart
project

## Bun 
```sh
rm -rf bun.lock && \
bun install && \
bun run --filter '@e2e/midnight-contract-counter-basic' contract:compile && \
bun run --filter '@e2e/midnight-contract-eip-20' contract:compile  && \
DISABLE_EVM=true DISABLE_BITCOIN=true DISABLE_AVAIL=true bun run --filter @e2e/node e2e
```

## Testing Development

Effectstream development mode & tests can be run through e2e testing environment.

```sh
# Install dependencies
deno install --allow-scripts && ./patch.sh

# Build All Contracts
deno task -r contract:compile

# If running on linux set env DISABLE_YACI=true
# Run Example Deployment Mode
deno task -f @e2e/node quickstart
```

## Run Tests

> NOTE: first install dependencies and build contracts

```sh
deno task -f @e2e/node e2e
```

## Contracts

Contracts can be built individually or all at once.
```sh
# Build All Contracts
deno task -r contract:compile

# OR Build Contracts Individually
deno task -f @e2e/evm-contracts build:mod
deno task -f @e2e/midnight-contract-eip-20 contract:compile
deno task -f @e2e/midnight-contract-counter contract:compile
```
