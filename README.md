# Paima Engine

# Development

## Install dependencies

`deno install --allow-scripts`

## Build Contracts

`deno task -r contract:compile`

## Deploy EVM Contract

`deno task -f @e2e/evm-contracts deploy:standalone`

## Run Example Deployment

`deno task -f @e2e/node dev`

## Create pgtypes

`deno task -f @e2e/database pgtyped:update`

## Launch Explorer

`deno task -f @paima/explorer start`

# Tests

## Run Tests

`deno task -f @e2e/node test`
