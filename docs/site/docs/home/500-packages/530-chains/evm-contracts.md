---
title: "@effectstream/evm-contracts"
description: "EVM smart contract interfaces for EffectStream"
sidebar_label: "evm-contracts"
---

<!-- Generated from packages/chains/evm-contracts/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. -->

> Package: **[`@effectstream/evm-contracts`](https://www.npmjs.com/package/@effectstream/evm-contracts)** · [Source](https://github.com/PaimaStudios/paima-engine/tree/main/packages/chains/evm-contracts)

NPM package for EVM contracts for EffectStream and related utilities.

See
[the Effectstream documentation](https://effectstream.github.io/docs/home/libraries/evm-contracts/introduction)
for full documentation.

# Hardhat Config Builder

This package also provides a unified Hardhat configuration builder that consolidates common Hardhat setup logic used across e2e tests and templates.

## Overview

The unified config builder provides three main functions:

1. **`createHardhatConfig()`** - Creates a complete Hardhat configuration with automatic default networks
2. **`createNodeTasks()`** - Creates custom Hardhat tasks for running local blockchain nodes
3. **`initTelemetry()`** - Initializes OpenTelemetry for Hardhat

**Key Features:**
- **Automatic Default Networks**: Default networks (`evmMain`, `evmMainHttp`, `evmParallel`, `evmParallelHttp`) are included when `networks` is not specified.
- **Centralized Configuration**: All common Hardhat setup logic in one place
- **Type Safe**: Full TypeScript support with proper types
- **Flexible**: Supports both `@effectstream` and `@paimaexample` package namespaces

**Additional Utilities:**
- **`createDefaultNetworks()`** - Helper function to create default network configurations

## Usage

### Basic Example

```typescript
import type { HardhatUserConfig } from "hardhat/config";
import {
  createHardhatConfig,
  createNodeTasks,
  initTelemetry,
} from "@effectstream/evm-hardhat/hardhat-config-builder";
// or for templates:
// } from "@paimaexample/evm-hardhat/hardhat-config-builder";

import {
  JsonRpcServerImplementation,
} from "@effectstream/evm-hardhat/json-rpc-server";
// or for templates:
// } from "@paimaexample/evm-hardhat/json-rpc-server";

import fs from "node:fs";
import waitOn from "wait-on";
import {
  ComponentNames,
  log,
  SeverityNumber,
} from "@effectstream/log";
// or for templates:
// } from "@paimaexample/log";

const __dirname = import.meta.dirname;

// Initialize telemetry (optional)
// Note: logPackage parameter is kept for backward compatibility but ignored
initTelemetry("@effectstream/log", "./deno.json");
// or for templates:
// initTelemetry("@paimaexample/log", "./deno.json");

// Create node tasks (optional, only if you need local node functionality)
const nodeTasks = createNodeTasks({
  JsonRpcServer: {} as unknown as never, // Type placeholder, optional and not used
  JsonRpcServerImplementation,
  ComponentNames,
  log,
  SeverityNumber,
  waitOn,
  fs,
});

// Create unified config with default networks
const config: HardhatUserConfig = createHardhatConfig({
  sourcesDir: `${__dirname}/src/contracts`,
  artifactsDir: `${__dirname}/build/artifacts/hardhat`,
  cacheDir: `${__dirname}/build/cache/hardhat`,
  // Default networks (evmMain, evmMainHttp, evmParallel, evmParallelHttp) are used automatically
  tasks: nodeTasks, // Optional: only include if you created node tasks
  solidityVersion: "0.8.30", // Optional: defaults to "0.8.30"
});

export default config;
```

## API Reference

### `createDefaultNetworks(options?: DefaultNetworkOptions): Record<string, NetworkConfig>`

Creates default network configurations commonly used in e2e tests and templates. This function is used by `createHardhatConfig()` when default networks are enabled, but can also be called directly if you need to create networks separately or customize them.

#### When to Use

- **Directly**: When you want to create default networks and pass them explicitly to `createHardhatConfig()`
- **Internally**: Automatically called by `createHardhatConfig()` when `networks` is not provided (default behavior)
- **Customization**: Use with `defaultNetworkOptions` in `createHardhatConfig()` to customize default network parameters

#### Parameters

- `options.evmMainPort` (optional): Base port for evmMain (defaults to `8545`)
- `options.evmParallelPort` (optional): Base port for evmParallel (defaults to `8546`)
- `options.evmMainChainId` (optional): Chain ID for evmMain (defaults to `31337`)
- `options.evmParallelChainId` (optional): Chain ID for evmParallel (defaults to `31338`)
- `options.evmMainInterval` (optional): Mining interval for evmMain in ms (defaults to `250`)
- `options.evmParallelInterval` (optional): Mining interval for evmParallel in ms (defaults to `1000`)

#### Returns

A network configuration object with:
- `evmMain`: Fast network (250ms block interval) on chainId 31337, port 8545
- `evmMainHttp`: HTTP wrapper for evmMain (used by Hardhat Ignition for deployments)
- `evmParallel`: Slower network (1s block interval) on chainId 31338, port 8546
- `evmParallelHttp`: HTTP wrapper for evmParallel (used by Hardhat Ignition for deployments)

#### Example

```typescript
import { createDefaultNetworks } from "@effectstream/evm-contracts";

// Create default networks with custom ports
const networks = createDefaultNetworks({
  evmMainPort: 8545,
  evmParallelPort: 8546,
  evmMainInterval: 500, // Slower than default
});

// Use in createHardhatConfig
const config = createHardhatConfig({
  sourcesDir: `${__dirname}/src/contracts`,
  artifactsDir: `${__dirname}/build/artifacts/hardhat`,
  cacheDir: `${__dirname}/build/cache/hardhat`,
  networks, // Explicitly pass networks
  useDefaultNetworks: false, // Disable auto-creation since we're passing networks
});
```

### `createHardhatConfig(options: HardhatConfigOptions): HardhatUserConfig`

Creates a unified Hardhat configuration.

#### Parameters

- `options.sourcesDir` (required): Directory containing contract sources
- `options.artifactsDir` (required): Directory for compiled artifacts
- `options.cacheDir` (required): Directory for Hardhat cache
- `options.networks` (optional): Networks configuration object. **If not provided, default networks (`evmMain`, `evmMainHttp`, `evmParallel`, `evmParallelHttp`) will be automatically used**
- `options.useDefaultNetworks` (optional): Whether to use default networks (defaults to `true` if `networks` is not provided)
- `options.defaultNetworkOptions` (optional): Options for customizing default networks (only used if `useDefaultNetworks` is `true`)
- `options.tasks` (optional): Custom Hardhat tasks (e.g., from `createNodeTasks()`)
- `options.solidityVersion` (optional): Solidity compiler version (defaults to `"0.8.30"`)

#### Returns

A complete `HardhatUserConfig` object ready to export.
**Note:** The config will automatically include the default networks (`evmMain`, `evmMainHttp`, `evmParallel`, `evmParallelHttp`) when `networks` is not provided.

### `createNodeTasks(deps: NodeTaskDependencies): HardhatUserConfig["tasks"]`

Creates custom Hardhat tasks for running local blockchain nodes. These tasks enable:
- Starting JSON-RPC servers for configured networks (`hardhat node`)
- Waiting for servers to be ready (`hardhat node:wait`)

#### Parameters

- `deps.JsonRpcServer` (optional): Type placeholder, not actually used (kept for type compatibility). Can be omitted or set to `{} as unknown as never`
- `deps.JsonRpcServerImplementation` (required): The JsonRpcServerImplementation class from `@effectstream/evm-hardhat/json-rpc-server` or `@paimaexample/evm-hardhat/json-rpc-server`
- `deps.ComponentNames` (required): Component names from the log package
- `deps.log` (required): Log utilities from the log package
- `deps.SeverityNumber` (required): Severity number constants from the log package
- `deps.waitOn` (required): The `wait-on` module for waiting on ports
- `deps.fs` (required): Node.js `fs` module for checking Docker environment

#### Returns

An array of Hardhat tasks that can be passed to `createHardhatConfig()`.

### `initTelemetry(logPackage: string, denoJsonPath?: string): void`

Initializes OpenTelemetry for Hardhat. This should be called at the top level of your `hardhat.config.ts` file.

#### Parameters

- `logPackage` (required but ignored): Package name for log utilities - kept for backward compatibility but no longer used (uses static import instead)
- `denoJsonPath` (optional): Path to `deno.json` file for version detection (defaults to `"./deno.json"`)

## Package Names

The unified config builder supports both package naming conventions:

- **E2E tests**: Use `@effectstream/evm-hardhat/hardhat-config-builder`, `@effectstream/evm-hardhat/json-rpc-server`, `@effectstream/log`
- **Templates**: Use `@paimaexample/evm-hardhat/hardhat-config-builder`, `@paimaexample/evm-hardhat/json-rpc-server`, `@paimaexample/log`

Note: The functions are now exported from `evm-hardhat` package. The `evm-contracts` package re-exports them for backward compatibility, but new code should import directly from `evm-hardhat`.

## Benefits

1. **Centralized Configuration**: All common Hardhat setup logic in one place
2. **Easier Maintenance**: Updates to Hardhat setup only need to be made once
3. **Consistency**: All e2e tests and templates use the same configuration logic
4. **Flexibility**: Still allows customization through parameters
5. **Type Safety**: Full TypeScript support with proper types

### Customizing Default Networks

You can customize the default networks by passing `defaultNetworkOptions`:

```typescript
const config: HardhatUserConfig = createHardhatConfig({
  sourcesDir: `${__dirname}/src/contracts`,
  artifactsDir: `${__dirname}/build/artifacts/hardhat`,
  cacheDir: `${__dirname}/build/cache/hardhat`,
  defaultNetworkOptions: {
    evmMainInterval: 500, // Customize main network interval
    evmMainPort: 8545, // Customize port (defaults to 8545)
    evmParallelPort: 8546, // Customize port (defaults to 8546)
  },
  tasks: nodeTasks,
  solidityVersion: "0.8.30",
});
```

### Using Custom Networks

If you want to provide completely custom networks instead of using defaults:

```typescript
const customNetworks = {
  myCustomNetwork: {
    type: "edr-simulated",
    chainType: "l1",
    chainId: 1337,
    // ... custom config
  },
};

const config: HardhatUserConfig = createHardhatConfig({
  sourcesDir: `${__dirname}/src/contracts`,
  artifactsDir: `${__dirname}/build/artifacts/hardhat`,
  cacheDir: `${__dirname}/build/cache/hardhat`,
  networks: customNetworks,
  useDefaultNetworks: false, // Disable default networks
  tasks: nodeTasks,
  solidityVersion: "0.8.30",
});
```

## Migration Guide

If you have an existing `hardhat.config.ts` file, follow these steps:

1. Import the unified builder functions
2. Replace your custom `initTelemetry()` function with `initTelemetry()` from the builder
3. Replace your custom node tasks with `createNodeTasks()`
4. Remove the network definitions (they're now provided by default)
5. Replace your config object with `createHardhatConfig()` (without the `networks` parameter)
6. Remove duplicate code (network list helpers, task definitions, etc.)

See the examples in `e2e/shared/contracts/evm/hardhat.config.ts` and the template configs for reference implementations.

## See Also

- [Hardhat Documentation](https://hardhat.org/docs)
- [Effectstream Documentation](https://effectstream.github.io/docs)
