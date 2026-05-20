# EVM Contracts

`packages/contracts-evm/` holds Solidity sources, Hardhat config, deployment, and generated TypeScript bindings. **Compile (`bun run build:evm`) and verify before moving to the node package** — downstream packages depend on the generated ABIs and addresses.

> **See also (concept docs).**
> - EVM chain overview + supported chains: `docs/site/docs/home/200-chains/201-evm.md`
> - Contracts (base contracts, L2 contract): `docs/site/docs/home/100-components/105-contracts.md`, `docs/site/docs/home/100-components/104-l2-contract.md`, `docs/site/docs/home/200-chains/210-contracts.md`
> - Per-package: `docs/site/docs/home/500-packages/530-chains/evm-contracts.md`, `docs/site/docs/home/500-packages/530-chains/evm-hardhat.md`

## Tools (probe before scaffolding)

Run this check before generating any EVM template code:

```sh
which bun forge 2>&1
```

| Tool | Required for | If missing |
|---|---|---|
| `bun` | All Effectstream work | Stop — you can't build, run, or verify anything. Install Bun before continuing. |
| `forge` (Foundry) | `bun run build:evm` (forge build pass; produces the ABI/bytecode that the TypeScript binding generator consumes) | Stop and tell the user before scaffolding. Install: `curl -L https://foundry.paradigm.xyz \| bash && foundryup`. Without `forge`, `bun run build:evm` reports "Nothing to compile" and the generated `build/mod.ts` is empty — every importer (`mct_erc1155`, etc.) then fails to resolve. |

Optional but commonly expected:
- `anvil` / `cast` (ship with Foundry; you get them when `forge` is installed).
- `hardhat` is provided as a dev dependency of `packages/contracts-evm/` — no system install needed.

## Layout

```
packages/contracts-evm/
├── package.json                      # @my-template/contracts-evm
├── hardhat.config.ts
├── deploy.ts
├── mod.ts                            # AUTO-GENERATED — do not edit
├── build/                            # Generated artifacts (ABIs, addresses)
├── src/contracts/
│   └── MyEffectstreamL2.sol
└── ignition/modules/
    └── effectstreamL2.ts
```

## Required npm scripts (driven by `launchEvm`)

```json
{
  "scripts": {
    "build:hardhat": "bun run swap:remappings:hardhat && bun ./node_modules/.bin/hardhat compile",
    "build:forge": "bun run swap:remappings:forge && forge build",
    "hardhat:start": "...",
    "hardhat:wait": "...",
    "deploy": "...",
    "build:mod": "(bun run deploy:standalone || true) && bun -e 'await import(\"@effectstream/evm-hardhat/builder\")'",
    "swap:remappings:forge": "bun ./node_modules/@effectstream/evm-hardhat/src/remappings/remappings-forge.ts --depth=0",
    "swap:remappings:hardhat": "bun ./node_modules/@effectstream/evm-hardhat/src/remappings/remappings-hardhat.ts --depth=0"
  }
}
```

## `mod.ts` is auto-generated — do not hand-edit

The orchestrator's `generate-evm-mod` step (and `bun run build:evm`) writes `packages/contracts-evm/mod.ts`, which exports `contractAddressesEvmMain()` reading deployed addresses from `ignition/deployments/`. The generated file also re-exports from `./build/mod.ts` and `./build/contracts.ts` (ABI bindings when forge artifacts exist). Anything you put there manually will be overwritten.

## Solidity contract — extend `EffectstreamL2Contract`

```solidity
// packages/contracts-evm/src/contracts/MyEffectstreamL2.sol
pragma solidity ^0.8.20;

import {EffectstreamL2Contract} from "@effectstream/evm-contracts/src/contracts/EffectstreamL2Contract.sol";

contract MyEffectstreamL2 is EffectstreamL2Contract {
  constructor(address _owner, uint256 _fee) EffectstreamL2Contract(_owner, _fee) {}
}
```

Note: This contract was previously `PaimaL2Contract.sol` — the import path uses `EffectstreamL2Contract.sol` now.

## Ignition module

```ts
// packages/contracts-evm/ignition/modules/effectstreamL2.ts
import { buildModule } from "@nomicfoundation/ignition-core";

export default buildModule("EffectstreamL2Module", (m) => {
  const owner = m.getParameter("owner");
  const fee = m.getParameter("fee");
  const contract = m.contract("MyEffectstreamL2", [owner, fee]);
  return { contract };
});
```

## Hardhat config

```ts
// packages/contracts-evm/hardhat.config.ts
import type { HardhatUserConfig } from "hardhat/config";
import {
  createHardhatConfig,
  createNodeTasks,
  initTelemetry,
} from "@effectstream/evm-hardhat/hardhat-config-builder";
import { JsonRpcServerImplementation } from "@effectstream/evm-hardhat/json-rpc-server";
import { ComponentNames, log, SeverityNumber } from "@effectstream/log";
import fs from "node:fs";
import waitOn from "wait-on";

initTelemetry("@effectstream/log", "./package.json");

const nodeTasks = createNodeTasks({
  JsonRpcServer: {} as never,
  JsonRpcServerImplementation,
  ComponentNames, log, SeverityNumber, waitOn, fs,
});

const config: HardhatUserConfig = createHardhatConfig({
  sourcesDir: `${import.meta.dirname}/src/contracts`,
  artifactsDir: `${import.meta.dirname}/build/artifacts/hardhat`,
  cacheDir: `${import.meta.dirname}/build/cache/hardhat`,
  tasks: nodeTasks,
  solidityVersion: "0.8.30",
});

export default config;
```

## Sharp edges

### Forge build is required for TypeScript ABI generation

`@effectstream/evm-hardhat/builder` reads exclusively from `build/artifacts/forge/`, not `build/artifacts/hardhat/`. So **Foundry must be installed and `forge build` must run** before the builder can generate `build/mod.ts` with ABI exports.

The orchestrator's `launchEvm` only runs `build:hardhat` (for deployment). Either pre-build forge artifacts or have `build:hardhat` also trigger `build:forge`. Without forge artifacts, `build/mod.ts` will be `export {}` and frontend imports like `erc721dev` will fail.

### Remappings depth MUST be `--depth=0`

The `swap:remappings:*` scripts accept a `--depth` flag that controls how many `../` levels to prepend when resolving `node_modules/`. Use `--depth=0` (works everywhere including Docker where the app is at `/app/`). Higher depths break in Docker.

### Builder must use dynamic import, not `bun run`

```json
"build:mod": "(bun run deploy:standalone || true) && bun -e 'await import(\"@effectstream/evm-hardhat/builder\")'"
```

`bun run <package>` fails in Docker because the package bin entry isn't resolvable through Bun's `.bun/` cache. The dynamic import works everywhere.
