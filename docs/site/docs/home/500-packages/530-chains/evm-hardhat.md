---
title: "@effectstream/evm-hardhat"
description: "Hardhat deployment and JSON-RPC utilities for EffectStream"
sidebar_label: "evm-hardhat"
---

<!-- Generated from packages/chains/evm-hardhat/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. -->

> Package: **[`@effectstream/evm-hardhat`](https://www.npmjs.com/package/@effectstream/evm-hardhat)** · [Source](https://github.com/effectstream/effectstream/tree/main/packages/chains/evm-hardhat)

Hardhat tooling for EVM-side EffectStream development: a JSON-RPC
server wrapper, deploy helpers, address bookkeeping, and the Solidity
remappings every template uses to share contract paths. Pairs with
[`@effectstream/evm-contracts`](https://www.npmjs.com/package/@effectstream/evm-contracts),
which ships the actual Solidity sources.

- Hardhat tooling for EVM-side Effectstream: JSON-RPC server, deploy + addresses, Solidity remappings.
- Hardhat config builder with a Solidity 0.8.30 default.
- Pairs with `@effectstream/evm-contracts` for the Solidity sources.
- Used by every template's `deploy-contracts` step in the orchestrator.

## Install

```bash
bun add @effectstream/evm-hardhat
# or
npm install @effectstream/evm-hardhat
```

The EVM tooling is split deliberately:

- `@effectstream/evm-contracts` — Solidity sources + compiled ABIs.
- `@effectstream/evm-hardhat` — Hardhat scripts, JSON-RPC server, deploy helpers (this package).

## Standalone usage

### `./json-rpc-server` — JSON-RPC façade over a Hardhat node

```typescript
import { startJsonRpcServer } from "@effectstream/evm-hardhat/json-rpc-server";

await startJsonRpcServer({ port: 8545 });
```

Exposes the JSON-RPC endpoints templates' frontends and indexers expect
during local dev.

### `./hardhat-config-builder` — opinionated Hardhat config

```typescript
import { buildHardhatConfig } from "@effectstream/evm-hardhat/hardhat-config-builder";

export default buildHardhatConfig({
  solidity: "0.8.24",
  contractsRoot: "./contracts",
});
```

### `./deploy` & `./addresses`

`deploy` runs Hardhat scripts and writes the deployed address into a
deterministic file; `addresses` reads it back. Used by every template's
"deploy contracts" step in the orchestrator.

### `./remappings-hardhat` and `./remappings-forge`

Re-exports the canonical `effectstream/` remappings so your Hardhat or
Foundry build sees the same imports as the rest of the framework.

## Inside EffectStream

The orchestrator's `deploy-contracts` step calls into this package to
boot Hardhat, deploy a template's contracts, and record the addresses.
The sync side then reads those addresses through `@effectstream/config`'s
`buildDeployments(...)`.

## Key subpath exports

- `@effectstream/evm-hardhat/json-rpc-server`: local JSON-RPC server.
- `@effectstream/evm-hardhat/builder`: programmatic contract build entry point.
- `@effectstream/evm-hardhat/hardhat-config-builder`: opinionated Hardhat config factory.
- `@effectstream/evm-hardhat/deploy` runs Hardhat scripts and writes the deployed address into a deterministic file.
- `@effectstream/evm-hardhat/addresses`: read/write the deployed-address file.
- `@effectstream/evm-hardhat/remappings-hardhat`, `./remappings-forge` — Solidity import remappings.

## Examples

- [`templates/minimal/`](https://github.com/effectstream/effectstream/tree/main/templates/minimal) — the smallest template that wires this package via the orchestrator.
- [`templates/dice/`](https://github.com/effectstream/effectstream/tree/main/templates/dice) — full game with hardhat-deployed contracts.

## Links

- Docs: https://effectstream.github.io/docs/packages/chains/evm-hardhat
- Source: https://github.com/effectstream/effectstream/tree/main/packages/chains/evm-hardhat
