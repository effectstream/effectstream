---
title: "@effectstream/midnight-contracts"
description: "Midnight network contract interfaces for EffectStream"
sidebar_label: "midnight-contracts"
---

<!-- Generated from packages/chains/midnight-contracts/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. -->

> Package: **[`@effectstream/midnight-contracts`](https://www.npmjs.com/package/@effectstream/midnight-contracts)** · [Source](https://github.com/effectstream/effectstream/tree/main/packages/chains/midnight-contracts)

Utilities for reading and deploying Midnight contracts from inside an Effectstream node or test. Two functions: `readMidnightContract` to load contract metadata + ABI by name, and `deployMidnightContract` to deploy and persist the resulting address.

- Reads contract files by name, searching from the current working directory upward.
- Supports per-network files (`contract-counter.undeployed.json`, `contract-counter.testnet.json`) without hardcoded paths.
- Deploys against the local Midnight stack by default; pass `NetworkUrls` to point at another environment.
- Persists the deployed address to a JSON file so subsequent reads pick it up automatically.

## Install

```bash
bun add @effectstream/midnight-contracts
# or
npm install @effectstream/midnight-contracts
```

Requires a reachable Midnight node, proof server, and indexer. The defaults match what `@effectstream/orchestrator`'s Midnight step boots locally.

## Standalone usage

### Read a contract

```typescript
import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";

// Defaults to contract-counter.<networkId>.json, where networkId is "undeployed".
const local = readMidnightContract("contract-counter");

// Read the same contract on a different network.
const preview = readMidnightContract("contract-counter", { networkId: "preview" });

// Override the search base if your contracts live outside the CWD tree.
const custom = readMidnightContract("contract-counter", {
  baseDir: "/path/to/contracts",
  networkId: "undeployed",
});
```

Returns `{ contractAddress, contractInfo, zkConfigPath }`. Results are cached per `(location, name, filename)` tuple so repeated reads in the same process are free.

### Deploy a contract

```typescript
import {
  deployMidnightContract,
  type DeployConfig,
  type NetworkUrls,
} from "@effectstream/midnight-contracts/deploy";

const config: DeployConfig = {
  contractName: "contract-counter",
  contractFileName: "contract-counter.json",
  contractClass: Counter.Contract,
  witnesses,
  privateStateId: "counterPrivateState",
  initialPrivateState: { privateCounter: 0 },
};

const address = await deployMidnightContract(config);
```

To deploy against a non-default stack, pass `NetworkUrls`:

```typescript
const network: NetworkUrls = {
  indexer: "http://localhost:8088/api/v3/graphql",
  indexerWS: "ws://localhost:8088/api/v3/graphql/ws",
  node: "http://localhost:9944",
  proofServer: "http://localhost:6300",
};

const address = await deployMidnightContract(config, network);
```

The deploy helper creates and funds a wallet from the genesis mint seed, runs the deployment, and writes the resulting address to `${contractName}.${networkId}.json` so the next `readMidnightContract` call picks it up.

## Inside Effectstream

`@effectstream/midnight-contracts` is the seam between Midnight contract artifacts on disk and the code that reads or deploys them. Templates that target Midnight call `readMidnightContract` from their node startup to resolve the on-chain address; the orchestrator's deploy step calls `deployMidnightContract` to put one there in the first place. On the sync side, `@effectstream/sync`'s `MidnightFetcher` consumes the node behind both calls.

## Key exports

`@effectstream/midnight-contracts/read-contract`:

- `readMidnightContract(name, options?)`: returns `{ contractAddress, contractInfo, zkConfigPath }`. `options.networkId` selects per-network files; `options.baseDir` overrides the search base.

`@effectstream/midnight-contracts/deploy`:

- `deployMidnightContract(config, networkUrls?)`: deploys and returns the address. Persists the address to a JSON file.
- `DeployConfig`, `NetworkUrls`: input types.

## Examples

End-to-end usage in templates:

- [`templates/evm-midnight-v2/`](https://github.com/effectstream/effectstream/tree/main/templates/evm-midnight-v2)
- [`templates/zswap-da/`](https://github.com/effectstream/effectstream/tree/main/templates/zswap-da)

## Links

- Docs: https://effectstream.github.io/docs/packages/chains/midnight-contracts
- Source: https://github.com/effectstream/effectstream/tree/main/packages/chains/midnight-contracts
- Midnight: https://midnight.network
