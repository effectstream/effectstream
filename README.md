# Paima Engine

# Development

## Install dependencies
`deno install --allow-scripts`

## Build Contracts
`deno task -f @example/evm-contracts build`
`deno task -f @example/evm-contracts deploy:standalone` 

## Run Example Deployment
`deno task -f @example/node dev`

## Create pgtypes
`deno task -f @example/database pgtyped:update`

## Launch Explorer
`deno task -f @paima/explorer start`

# Tests
## Run Tests
`deno task -f @example/node test`

