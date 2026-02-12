# Effectstream

## Quick Start

Start at [Effectstream's Template](./templates/evm-midnight/) for quickstart
project

## Testing Development

Effectstream development mode & tests can be run through e2e testing environment.

```sh
# Install dependencies
bun install

# Build All Contracts
bun --filter @e2e/evm-contracts contract:compile
bun --filter @e2e/midnight-contract-counter-basic compact
bun --filter @e2e/midnight-contract-eip-20 compact

# Run Example Deployment Mode
bun --filter @e2e/node quickstart
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
