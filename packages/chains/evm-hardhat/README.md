# @effectstream/evm-hardhat

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

- `@effectstream/evm-contracts` - Solidity sources + compiled ABIs.
- `@effectstream/evm-hardhat` - Hardhat scripts, JSON-RPC server, deploy helpers (this package).

## Standalone usage

### `./json-rpc-server` - JSON-RPC façade over a Hardhat node

```typescript
import { JsonRpcServerImplementation } from "@effectstream/evm-hardhat/json-rpc-server";

const server = new JsonRpcServerImplementation(
  { hostname: "127.0.0.1", port: 8545, provider },
  (msg) => console.log(msg),
);

const { address, port } = await server.listen();
await server.waitUntilClosed();
```

The config takes a `hostname`, a `port`, and an `EthereumProvider`; the second
constructor argument is a log callback. `listen()`, `waitUntilClosed()` and
`close()` make up the `JsonRpcServer` interface.

Exposes the JSON-RPC endpoints templates' frontends and indexers expect
during local dev.

### `./hardhat-config-builder` - opinionated Hardhat config

```typescript
import { createHardhatConfig } from "@effectstream/evm-hardhat/hardhat-config-builder";

export default createHardhatConfig({
  sourcesDir: "./contracts",
  artifactsDir: "./build/artifacts",
  cacheDir: "./build/cache",
  // solidityVersion defaults to "0.8.30"
});
```

`sourcesDir`, `artifactsDir` and `cacheDir` are required. Optional fields cover
`networks`, `useDefaultNetworks`, `defaultNetworkOptions`, `tasks`, and
`solidityVersion`.

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
- `@effectstream/evm-hardhat/remappings-hardhat`, `./remappings-forge` - Solidity import remappings.

## Examples

- [`templates/minimal/`](https://github.com/effectstream/effectstream/tree/main/templates/minimal) - the smallest template that wires this package via the orchestrator.
- [`templates/dice/`](https://github.com/effectstream/effectstream/tree/main/templates/dice) - full game with hardhat-deployed contracts.

## Links

- Docs: https://effectstream.github.io/docs/packages/chains/evm-hardhat
- Source: https://github.com/effectstream/effectstream/tree/main/packages/chains/evm-hardhat
