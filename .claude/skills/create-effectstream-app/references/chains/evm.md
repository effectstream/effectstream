# EVM

`packages/contracts-evm/` — Solidity sources, Hardhat config, deployment scripts, and generated TypeScript bindings. **Compile (`bun run build:evm`) and verify before moving to the node package** — downstream packages depend on the generated ABIs and addresses.

> **See also (concept docs).**
> - EVM chain overview + supported chains: `docs/site/docs/home/200-chains/201-evm.md`
> - Contracts (base contracts, L2 contract): `docs/site/docs/home/100-components/105-contracts.md`, `docs/site/docs/home/100-components/104-l2-contract.md`, `docs/site/docs/home/200-chains/211-contracts.md`
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

## Local dev environment

`launchEvm` starts Hardhat as the local EVM node (port 8545), compiles the contracts, deploys them via Hardhat Ignition, and generates `mod.ts` with the deployed addresses.

## Required `launchEvm` package scripts

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

## Sync protocol + primitives

Sync protocol: `EVM_RPC_PARALLEL`.

| Primitive | Grammar | Use |
|---|---|---|
| `PrimitiveTypeEVMEffectstreamL2` | your custom grammar | **Opt-in.** Parses `effectstreamSubmitGameInput` calls on the L2 contract. See Sharp edges. |
| `PrimitiveTypeEVMERC721` | `builtinGrammars.evmErc721` | ERC-721 Transfer events |
| `PrimitiveTypeEVMERC20` | `builtinGrammars.evmErc20` | ERC-20 Transfer events |
| `PrimitiveTypeEVMERC1155` | `builtinGrammars.evmErc1155` | ERC-1155 TransferSingle events |

## Batcher adapters

| Adapter | Batching criteria |
|---|---|
| `EffectstreamL2DefaultAdapter` | time, size, hybrid — for `effectstreamSubmitGameInput` payloads |
| `EvmContractAdapter` | time, size, hybrid — for custom contract calls |

## Orchestrator wiring

```ts
...launchEvm("@my-template/contracts-evm", { cwd: path.join(root, "packages/contracts-evm") }),

{
  name: "sync",
  args: ["run", "packages/node/main.dev.ts"],
  waitToExit: false,
  type: "system-dependency",
  env: { PGLITE: "true" },
  dependsOn: [DbNames.PGLITE_WAIT, EvmNames.GENERATE_MOD],
},
```

## Sharp edges

### `PrimitiveTypeEVMEffectstreamL2` is opt-in — confirm with the user first

`PrimitiveTypeEVMEffectstreamL2` is needed only when the template accepts **user-submitted inputs via custom grammar** (i.e. `effectstreamSubmitGameInput` on the L2 contract, or through the batcher which routes to it). It is an EVM-specific tool — a contract + scanner that lets users send arbitrary messages (concise/game inputs) to the backend.

**Do not add it by default** — scanning an extra contract is expensive (one more RPC call per block, one more contract address to deploy and audit). Add it only when the template has standalone user actions that don't originate from events already emitted by other contracts (ERC-20 transfers, Midnight state changes, etc.).

If you do need it, register it in `buildPrimitives` with `stateMachinePrefix: ""` pointing at the L2 contract address. **Without this primitive when it IS needed, the sync node silently ignores L2 inputs — no error, no crash, just empty results.** See `references/grammar-stm.md` §6 for the config example.

### Solidity contract — extend `EffectstreamL2Contract`

```solidity
// packages/contracts-evm/src/contracts/MyEffectstreamL2.sol
pragma solidity ^0.8.20;

import {EffectstreamL2Contract} from "@effectstream/evm-contracts/src/contracts/EffectstreamL2Contract.sol";

contract MyEffectstreamL2 is EffectstreamL2Contract {
  constructor(address _owner, uint256 _fee) EffectstreamL2Contract(_owner, _fee) {}
}
```

Note: previously named `PaimaL2Contract.sol` — update the import path.

### Ignition module

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

### Hardhat config

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

### `mod.ts` is auto-generated — do not hand-edit

The orchestrator's `generate-evm-mod` step (and `bun run build:evm`) writes `packages/contracts-evm/mod.ts`, which exports `contractAddressesEvmMain()` reading deployed addresses from `ignition/deployments/`. The generated file also re-exports from `./build/mod.ts` and `./build/contracts.ts` (ABI bindings when forge artifacts exist). Anything you put there manually will be overwritten.

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

## Frontend / wallet integration

EVM templates use the standard `@effectstream/wallets` integration: `EffectstreamConfig` + `walletLogin` + `sendTransaction`. Browser-injected wallets (MetaMask, etc.) sign payloads that go through the batcher → `effectstreamSubmitGameInput` → `PrimitiveTypeEVMEffectstreamL2` → STM. See `references/frontend.md` for the wiring.

### Layout

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
