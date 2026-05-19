---
title: "@effectstream/evm-contracts"
description: "EVM smart contract interfaces for EffectStream"
sidebar_label: "evm-contracts"
---

<!-- Generated from packages/chains/evm-contracts/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. -->

> Package: **[`@effectstream/evm-contracts`](https://www.npmjs.com/package/@effectstream/evm-contracts)** · [Source](https://github.com/PaimaStudios/paima-engine/tree/main/packages/chains/evm-contracts)

Solidity sources and compiled ABIs for Effectstream's EVM contracts, distributed as an npm package. Pairs with [`@effectstream/evm-hardhat`](https://www.npmjs.com/package/@effectstream/evm-hardhat), which ships the Hardhat tooling (config builder, JSON-RPC server, deploy helpers).

- Canonical home for Effectstream's EVM-side contracts. Other packages import the ABIs from here.
- Compiled artifacts ship in the tarball so consumers don't need a Solidity toolchain unless they're modifying contracts.
- Hardhat tooling lives in `@effectstream/evm-hardhat`. This package is kept lean on purpose.

## Install

```bash
bun add @effectstream/evm-contracts
# or
npm install @effectstream/evm-contracts
```

## Standalone usage

Import a compiled ABI:

```typescript
import EffectstreamL2 from "@effectstream/evm-contracts/artifacts/EffectstreamL2.json";

const abi = EffectstreamL2.abi;
const bytecode = EffectstreamL2.bytecode;
```

For the full list of contracts and their export paths, see [the docs](https://effectstream.github.io/docs/home/libraries/evm-contracts/introduction).

## Inside Effectstream

The state machine and batcher read EVM events against ABIs exported here. Templates that target EVM include this package transitively through `@effectstream/evm-hardhat`'s deploy pipeline, so you usually don't import it by hand — you reference the contract names you want to deploy.

## Building from source

For consumers modifying contracts locally:

```bash
# In a checkout of effectstream
bun run --filter=@effectstream/evm-contracts build
```

The Hardhat config used during compilation is built by `@effectstream/evm-hardhat/hardhat-config-builder`. If you need a config in your own repo, import that builder directly; do not re-implement the Hardhat setup. See `@effectstream/evm-hardhat`'s README for the API.

## Examples

- [`templates/minimal/`](https://github.com/effectstream/effectstream/tree/main/templates/minimal) — smallest template that deploys an Effectstream contract.
- [`templates/dice/`](https://github.com/effectstream/effectstream/tree/main/templates/dice) — full game-on-EVM example.

## Links

- Docs: https://effectstream.github.io/docs/home/libraries/evm-contracts/introduction
- Source: https://github.com/effectstream/effectstream/tree/main/packages/chains/evm-contracts
- Companion tooling: [`@effectstream/evm-hardhat`](https://www.npmjs.com/package/@effectstream/evm-hardhat)
