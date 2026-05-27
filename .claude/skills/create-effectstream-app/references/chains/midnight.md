# Midnight

`packages/contracts-midnight/` — Midnight Compact contracts + deploy scripts. The compiled contract lives in a nested subpackage (e.g. `packages/contracts-midnight/contract-round-value/`) that must be declared explicitly in the root `workspaces` array (see Sharp edges).

Midnight is the trickiest chain to set up because every layer (compiler, runtime, JS SDK, ledger, wallet SDK, node Docker image) has tightly-coupled version requirements. Most "weird Midnight errors" trace back to version drift — read the **Compatibility matrix** below before changing any `@midnight-ntwrk/*` version.

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

After confirming the tools are available, pin the **compiler version** in the contract package's `compact` script (e.g. `compact compile +0.30.0 …`) so a different default install doesn't silently produce mismatched output — see Sharp edges → **Compact compiler ↔ runtime version alignment**.

## Local dev environment

`launchMidnight` starts three services: the Midnight node, the GraphQL indexer (port 8088), and the proof server (port 6300). All three are slow to come up compared to EVM Hardhat — expect tens of seconds for Phase A tests.

## Required `launchMidnight` package scripts

The `packages/contracts-midnight/package.json` must expose:

- `midnight-node:start`, `midnight-node:wait`
- `midnight-indexer:start`, `midnight-indexer:wait`
- `midnight-proof-server:start`, `midnight-proof-server:wait`
- `midnight-contract:deploy`

## Sync protocol + primitives

Sync protocol: `MIDNIGHT_PARALLEL`.

| Primitive | Grammar | Use |
|---|---|---|
| `PrimitiveTypeMidnightGeneric` | `builtinGrammars.midnightGeneric` | Read Midnight ledger contract state (raw or schema-decoded) |
| `PrimitiveTypeMidnightNullifier` | — | Track nullifiers without owning the contract |

## Batcher adapters

| Adapter | Batching criteria |
|---|---|
| `MidnightAdapter` | size (typically 1) — Midnight tx submission carries ZK proofs |

## Orchestrator wiring

Unlike `launchEvm` (which bundles a `compile-evm-contracts` process), **`launchMidnight` does NOT compile the Compact contract for you** — it goes straight from `midnight-*-wait` to `midnight-contract:deploy`, which reads pre-compiled artifacts from `src/managed/`. On a fresh checkout where `managed/` doesn't exist yet, the deploy will fail.

To make `bun run dev` self-sufficient (so users don't have to run `bun run build:midnight` separately), inject a `compile-midnight` ProcessConfig into `start.dev.ts` and wire `launchMidnight`'s `opts.dependsOn` to it. The Compact compile runs once at boot, completes, then the rest of the Midnight chain comes up:

```ts
import { launchMidnight, MidnightNames } from "@effectstream/orchestrator/launch-midnight";

const root = import.meta.dirname!;

export default {
  processes: [
    ...launchPglite(),

    // Compile Compact contracts before launchMidnight's deploy step runs.
    // Mirrors launchEvm's built-in `compile-evm-contracts` step.
    {
      name: "compile-midnight",
      description: "Compile Midnight Compact contracts (bun run build:midnight)",
      args: ["run", "build:midnight"],   // root script
      waitToExit: true,
      critical: true,
      type: "system-dependency",
    },

    ...launchMidnight(
      "@my-template/contracts-midnight",
      { cwd: path.join(root, "packages/contracts-midnight") },
      {
        env: { MIDNIGHT_STORAGE_PASSWORD: "YourPasswordMy1!" },
        dependsOn: ["compile-midnight"],   // ← injected into MidnightNames.CONTRACT_DEPLOY's deps
      },
    ),

    {
      name: "sync",
      // ...
      dependsOn: [
        DbNames.PGLITE_WAIT,
        MidnightNames.CONTRACT_DEPLOY,
      ],
    },
  ],
} satisfies OrchestratorConfig;
```

With this, the user can just `bun install && bun run dev` — same as EVM templates. The standalone `bun run build:midnight` script stays in the root `package.json` for CI/release use cases, but it's no longer a prereq for local dev.

(If the engine fixes the asymmetry by adding a `midnight-contract:compile` script to `launchMidnight`'s `REQUIRED_SCRIPTS`, the inline ProcessConfig above becomes unnecessary. As of engine `0.100.x` it's still required.)

## Sharp edges

### `launchMidnight` does NOT compile the contract — wire it yourself

See **Orchestrator wiring** above. The canonical `templates/evm-midnight-v2/` doesn't include the `compile-midnight` step either, which is why its docs tell you to run `bun run build:midnight` before `bun run dev`. New templates should bake the compile step into `start.dev.ts` so `bun run dev` works on a fresh checkout.

### Compact compiler ↔ runtime version alignment

The Compact compiler version (set in `compact compile +X.Y.Z`) determines the output format. The `compact-runtime` npm dep MUST match. If the `compact-js` SDK expects `provableCircuits` (added in runtime `0.15.0`), older compiler output (e.g. `0.11.0`) fails at deploy with:

```
undefined is not an object (evaluating 'Object.keys(contract.provableCircuits)')
```

Pin to exact versions from the compatibility matrix below. **No `^` or `~` ranges anywhere in `@midnight-ntwrk/*` dependencies.**

### Midnight SDK compatibility matrix (as of 2026-04-07)

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

### Use direct paths, not `bunx`

`bunx @effectstream/npm-midnight-node` may fail to resolve the binary. Use direct paths:

```json
"midnight-node:start": "bun ./node_modules/.bin/npm-midnight-node --port 30333"
```

Same for `npm-midnight-indexer` and `npm-midnight-proof-server`.

### `--port 30333` is required for `midnight-node:start`

Without an explicit P2P port the node may crash. Set `--port 30333` in the start script.

### `MIDNIGHT_STORAGE_PASSWORD` is required + 3-of-4 complexity

The Midnight node and deploy script both need `MIDNIGHT_STORAGE_PASSWORD`. Pass via `launchMidnight`'s `opts.env`:

```ts
launchMidnight(
  "@my-template/contracts-midnight",
  { cwd: path.join(root, "packages/contracts-midnight") },
  { env: { MIDNIGHT_STORAGE_PASSWORD: "YourPasswordMy1!" } },
)
```

`@midnight-ntwrk/midnight-js-level-private-state-provider` validates the password — must contain **at least 3 of**: uppercase letters, lowercase letters, digits, special characters. `yourpasswordmypassword` fails. Use `YourPasswordMy1!` or similar.

### Nested workspace for compiled contract

Midnight Compact contracts compile into `src/managed/`. The contract subpackage must stay a separate workspace. List it explicitly in the root `package.json` because `packages/*` doesn't recurse:

```json
"workspaces": [
  "packages/*",
  "packages/contracts-midnight/contract-round-value"
]
```

### Compact `Map<K, V>` iteration

Compact's `Map<K, V>` compiles to JavaScript objects with `member()`, `lookup()`, `isEmpty()`, `size()`, and `[Symbol.iterator]()` methods — but `Object.entries()` / `Object.keys()` return the method names, NOT the map data. When accessing Map data in STM handlers, iterate via `[Symbol.iterator]()` or use `member(key)` + `lookup(key)`.

When serializing Compact state to JSON (e.g. `MidnightGenericPrimitive`'s `makeJsonSafe()` pipeline), detect and iterate Maps explicitly — `JSON.stringify` will drop function values silently, producing `{}`.

### `MidnightGenericPrimitive`'s `ledgerSchema` option

The `MidnightGenericPrimitive` accepts an optional `ledgerSchema` mapping Compact ledger field names to types (`uint8`–`uint128`, `bytes`, `boolean`, `option`, `map`). When provided, the primitive parses raw `StateValue` arrays into named fields. Schema keys must be in **Compact declaration order** — the parser maps each key to the corresponding positional index. Without `ledgerSchema`, the raw `payload` object is passed through (after `makeJsonSafe` serialization).

### Deploy import path

```ts
import { deployMidnightContract } from "@effectstream/midnight-contracts/deploy";
import type { DeployConfig } from "@effectstream/midnight-contracts/types";
```

Not `./deploy-ledger6` or other legacy names.

### WASM runtime import order

`@midnight-ntwrk/onchain-runtime` MUST be imported **at the top of `main.ts` before any other Midnight imports** — otherwise the WASM module fails to initialize at runtime.

Same rule applies in `packages/tests/run-tests.ts` if it dynamically imports any `@midnight-ntwrk/*` SDK (most test runners do, via the Phase B counter-increment helper). **Additionally**, the tests package must declare `@midnight-ntwrk/onchain-runtime` as a direct dependency in `packages/tests/package.json` — relying on workspace hoisting from `packages/node/` is not enough; Bun's `await import()` resolver from `run-tests.ts` cwd won't find the hoisted copy.

With `DISABLE_MIDNIGHT=true`, guard the import:

```ts
if (!isEnvTrue("DISABLE_MIDNIGHT")) {
  await import("@midnight-ntwrk/onchain-runtime");
}
```

### `DISABLE_MIDNIGHT` dynamic-import pattern

Multi-chain templates should support running without optional toolchains. Any top-level import from a Midnight package (contract types, SDK modules) will fail if the Compact compiler output (`managed/`) doesn't exist. Convert to dynamic imports — see `references/multi-env.md` for the full pattern.

Managed-directory stubs for `DISABLE_MIDNIGHT` mode: the Midnight contract package's `_index.ts` re-exports from `./managed/contract/index.js`. For the frontend to build without the compiler:

- `src/managed/contract/index.js` — minimal `Contract` class + `ledger` function that throw "not compiled" errors
- `src/managed/contract/index.d.ts` — type stubs matching the generated interface
- `src/managed/keys/.gitkeep` and `src/managed/zkir/.gitkeep` — empty directories for `viteStaticCopy`

These are overwritten when `bun run build:midnight` runs the real Compact compiler.

### Midnight indexer/contract timing gates in tests

The indexer's GraphQL endpoint on port 8088 takes significantly longer to come up than EVM's Hardhat on 8545. In `packages/tests/run-tests.ts`, wait for `midnight-indexer-wait` (waitForExit) **before** `chainReadyTest()`. After `deployTest()`, wait for `midnight-contract` (timeout ≥600s) **before** Phase B — Midnight Compact deployment is much slower than EVM Hardhat Ignition. See `references/tests.md`.

## Frontend / wallet integration

Midnight wallet integration uses `@midnight-ntwrk/dapp-connector-api` against the Lace Midnight wallet extension. The frontend builds and signs Compact contract calls in the browser; the engine indexes resulting on-chain state via `PrimitiveTypeMidnightGeneric`. Frontend Vite config needs the `stream/web` shim and `node-fetch` aliasing — see `references/frontend.md` for the canonical setup. When the template ships in `DISABLE_MIDNIGHT=true` mode (e.g. for CI runs without the Compact compiler), the managed-dir stubs above let `vite build` succeed.
