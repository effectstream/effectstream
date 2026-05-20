# Midnight Contracts

Midnight is the trickiest chain to set up because every layer (compiler, runtime, JS SDK, ledger, wallet SDK, node Docker image) has tightly-coupled version requirements. Most "weird Midnight errors" trace back to version drift.

> **See also (concept docs).**
> - Midnight chain overview, indexer + proof-server architecture: `docs/site/docs/home/200-chains/202-midnight.md`
> - Per-package: `docs/site/docs/home/500-packages/530-chains/midnight-contracts.md`
> - Per-binary: `docs/site/docs/home/500-packages/540-binaries/midnight-node.md`, `midnight-indexer.md`, `midnight-proof-server.md`
> - PRC-6 Midnight dApp integration (per-channel metrics + identity): `docs/site/docs/home/400-paima-standards/prc6.md` — relevant for any Midnight-template README.
> - `PrimitiveTypeMidnightGeneric` + `ledgerSchema`: `docs/site/docs/home/100-components/118-primitives.md`

## Tools (probe before scaffolding)

Run this check before generating any Midnight template code:

```sh
which bun compact 2>&1
```

| Tool | Required for | If missing |
|---|---|---|
| `bun` | All Effectstream work | Stop — you can't build, run, or verify anything. Install Bun before continuing. |
| `compact` (Midnight Compact compiler) | `bun run build:midnight` (compiles `.compact` to JS + zkir keys/verifiers) | Stop and tell the user before scaffolding. Install: `curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh \| sh` then `compact update`. The compiler downloads a per-version backend (e.g. `0.30.0`), so the **first** `compact compile +X.Y.Z` may take longer than later runs. |

Other Midnight binaries (`midnight-node`, `midnight-indexer`, `midnight-proof-server`) are NOT required as system tools — `launchMidnight` ships them via the `@effectstream/npm-midnight-*` packages and the orchestrator extracts them on first run.

After confirming the tools are available, pin the **compiler version** in the contract package's `compact` script (e.g. `compact compile +0.30.0 …`) so a different default install doesn't silently produce mismatched output — see [Compact compiler ↔ runtime version alignment](#compact-compiler--runtime-version-alignment) below.

## Required `launchMidnight` package scripts

The `packages/contracts-midnight/package.json` must expose:

- `midnight-node:start`, `midnight-node:wait`
- `midnight-indexer:start`, `midnight-indexer:wait`
- `midnight-proof-server:start`, `midnight-proof-server:wait`
- `midnight-contract:deploy`

## Use direct paths, not `bunx`

`bunx @effectstream/npm-midnight-node` may fail to resolve the binary. Use direct paths:

```json
"midnight-node:start": "bun ./node_modules/.bin/npm-midnight-node --port 30333"
```

Same for `npm-midnight-indexer` and `npm-midnight-proof-server`.

## `--port 30333` is required for `midnight-node:start`

Without an explicit P2P port the node may crash. Set `--port 30333` in the start script.

## `MIDNIGHT_STORAGE_PASSWORD` is required

The Midnight node and deploy script both need `MIDNIGHT_STORAGE_PASSWORD`. Pass via `launchMidnight`'s `opts.env`:

```ts
launchMidnight(
  "@my-template/contracts-midnight",
  { cwd: path.join(root, "packages/contracts-midnight") },
  { env: { MIDNIGHT_STORAGE_PASSWORD: "YourPasswordMy1!" } },
)
```

### Password complexity rules

`@midnight-ntwrk/midnight-js-level-private-state-provider` validates the password — must contain **at least 3 of**: uppercase letters, lowercase letters, digits, special characters. `yourpasswordmypassword` fails. Use `YourPasswordMy1!` or similar.

## Compact compiler ↔ runtime version alignment

The Compact compiler version (set in `compact compile +X.Y.Z`) determines the output format. The `compact-runtime` npm dep MUST match. If the `compact-js` SDK expects `provableCircuits` (added in runtime `0.15.0`), older compiler output (e.g. `0.11.0`) fails at deploy with:

```
undefined is not an object (evaluating 'Object.keys(contract.provableCircuits)')
```

Pin to exact versions from the compatibility matrix below. **No `^` or `~` ranges anywhere in `@midnight-ntwrk/*` dependencies.**

## Midnight SDK compatibility matrix (as of 2026-04-07)

All `@midnight-ntwrk/*` packages must come from the same compatibility set. Always check the official matrix before bumping any version: https://github.com/midnightntwrk/midnight-sdk/blob/main/COMPATIBILITY.md

| Package group | Version |
|---|---|
| Compact compiler (`compactc`) | `+0.30.0` |
| `compact-runtime` | `0.15.0` |
| `compact-js` | `2.5.0` |
| `midnight-js-*` (contracts, types, utils, providers, etc.) | `4.0.4` |
| `ledger-v8` | `8.0.3` |
| `onchain-runtime` → `npm:@midnight-ntwrk/onchain-runtime-v3` | `3.0.0` |
| `wallet-sdk-facade` | `3.0.0` |
| `wallet-sdk-abstractions` | `2.0.0` |
| `wallet-sdk-hd` | `3.0.1` |
| `wallet-sdk-shielded` | `2.1.0` |
| `wallet-sdk-dust-wallet` | `3.0.0` |
| `wallet-sdk-unshielded-wallet` | `2.1.0` |
| `wallet-sdk-address-format` | `3.1.0` |
| `wallet` / `wallet-api` | `5.0.0` |
| `dapp-connector-api` | `4.0.1` |
| `zswap` | `4.0.0` |
| Node (Docker) | `0.22.x` |
| Indexer (Docker) | `4.0.x` |
| Proof Server (Docker) | `8.0.3` |

`@midnight-ntwrk/ledger` and `@midnight-ntwrk/ledger-v6` are **deprecated** — use `@midnight-ntwrk/ledger-v8`. Similarly, `onchain-runtime-v1` is replaced by `onchain-runtime-v3`.

Mismatched versions produce errors like "Failed to decode ledger event payload", "Could not deserialize Ledger Event", or `provableCircuits is undefined`.

## Nested workspace for compiled contract

Midnight Compact contracts compile into `src/managed/`. The contract subpackage must stay a separate workspace. List it explicitly in the root `package.json` because `packages/*` doesn't recurse:

```json
"workspaces": [
  "packages/*",
  "packages/contracts-midnight/contract-round-value"
]
```

## Compact Map iteration

Compact's `Map<K, V>` compiles to JavaScript objects with `member()`, `lookup()`, `isEmpty()`, `size()`, and `[Symbol.iterator]()` methods — but `Object.entries()` / `Object.keys()` return the method names, NOT the map data. When accessing Map data in STM handlers, iterate via `[Symbol.iterator]()` or use `member(key)` + `lookup(key)`.

When serializing Compact state to JSON (e.g., `MidnightGenericPrimitive`'s `makeJsonSafe()` pipeline), detect and iterate Maps explicitly — `JSON.stringify` will drop function values silently, producing `{}`.

## `MidnightGenericPrimitive`'s `ledgerSchema` option

The `MidnightGenericPrimitive` accepts an optional `ledgerSchema` mapping Compact ledger field names to types (`uint8`–`uint128`, `bytes`, `boolean`, `option`, `map`). When provided, the primitive parses raw `StateValue` arrays into named fields. Schema keys must be in **Compact declaration order** — the parser maps each key to the corresponding positional index. Without `ledgerSchema`, the raw `payload` object is passed through (after `makeJsonSafe` serialization).

## Deploy import path

```ts
import { deployMidnightContract } from "@effectstream/midnight-contracts/deploy";
import type { DeployConfig } from "@effectstream/midnight-contracts/types";
```

Not `./deploy-ledger6` or other legacy names.

## WASM runtime workaround

`@midnight-ntwrk/onchain-runtime` MUST be imported **at the top of `main.ts` before any other Midnight imports** — otherwise the WASM module fails to initialize at runtime.

With `DISABLE_MIDNIGHT=true`, guard the import:

```ts
if (!isEnvTrue("DISABLE_MIDNIGHT")) {
  await import("@midnight-ntwrk/onchain-runtime");
}
```

## `DISABLE_MIDNIGHT` dynamic-import pattern

Multi-chain templates should support running without optional toolchains. Any top-level import from a Midnight package (contract types, SDK modules) will fail if the Compact compiler output (`managed/`) doesn't exist. Convert to dynamic imports — see `references/multi-env.md` for the full pattern.

### Managed-directory stubs for `DISABLE_MIDNIGHT` mode

The Midnight contract package's `_index.ts` re-exports from `./managed/contract/index.js`. For the frontend to build without the compiler:

- `src/managed/contract/index.js` — minimal `Contract` class + `ledger` function that throw "not compiled" errors
- `src/managed/contract/index.d.ts` — type stubs matching the generated interface
- `src/managed/keys/.gitkeep` and `src/managed/zkir/.gitkeep` — empty directories for `viteStaticCopy`

These are overwritten when `bun run build:midnight` runs the real Compact compiler.
