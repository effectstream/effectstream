# CLAUDE.md — evm-midnight-v2

## What this is

Multi-chain Effectstream template: EVM (Hardhat/Arbitrum) + Midnight. Syncs ERC-721 events and Midnight contract state into a unified rollup. React frontend with Midnight wallet integration.

## Required toolchain

Install [Foundry](https://www.getfoundry.sh/) and the Compact launcher before
starting this template, then install its exact Compact selection,
`0.33.0-rc.2`:

```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
bun toolchain/compact.ts install
```

`toolchain.json` is the source of truth. Contract builds, startup preflight,
Docker installation, and documentation consistency checks consume or validate
that declaration. The template installer downloads an immutable upstream asset
and verifies the per-platform checksum declared beside the version.

## Commands

```bash
bun install                          # Install deps
bun run dev                          # Full stack: PGLite + Hardhat + Midnight + sync + batcher + frontend
bun run start:mainnet                # Mainnet: Arbitrum One + Midnight mainnet (requires env vars)
bun run test                         # E2E tests (packages/tests/run-tests.ts)
bun run build:midnight               # Compile with the selection in toolchain.json
bun run build:evm                    # Compile Solidity + generate TS bindings
```

Orchestrator commands (from project root):
```bash
NODE_ENV=development bunx orchestrator-v2 status --config start.dev.ts
NODE_ENV=development bunx orchestrator-v2 restart frontend-build frontend-server --config start.dev.ts
NODE_ENV=development bunx orchestrator-v2 logs sync --config start.dev.ts
```

## Architecture

Bun monorepo with flat `packages/*` layout. All `@effectstream/*` deps are from npm (or `workspace:*` when inside the monorepo via `link.sh`).

| Package | Name | Purpose |
|---------|------|---------|
| `packages/node/` | `@evm-midnight/node` | Sync node, state machine, orchestrator configs |
| `packages/database/` | `@evm-midnight/database` | SQL migrations, pgtyped queries |
| `packages/contracts-evm/` | `@evm-midnight/contracts-evm` | Solidity contracts, Hardhat, Ignition deploy |
| `packages/contracts-midnight/` | `@evm-midnight/contracts-midnight` | Midnight infra scripts, contract deploy |
| `packages/contracts-midnight/contract-round-value/` | `@evm-midnight/midnight-contract` | Compact contract source (compiled output in `src/managed/` is gitignored — built by `start.dev.ts` / `build:midnight`) |
| `packages/batcher/` | `@evm-midnight/batcher` | TX batcher (EVM + Midnight adapters) |
| `packages/frontend/` | `@evm-midnight/frontend` | React + Vite + Midnight wallet + Fastify server |
| `packages/tests/` | `@evm-midnight/tests` | E2E test suite |

## Key patterns

- **Orchestrator-v2**: `start.dev.ts` exports a config object (`satisfies OrchestratorConfig`). The CLI runs it — no programmatic `start()`.
- **State machine**: `Stm` class in `state-machine.ts` routes ERC-721 Transfer events and Midnight contract calls.
- **MQTT broker skipped under Bun**: `typeof Bun` guard in runtime. Frontend uses HTTP polling (`/block-heights`) instead of MQTT WebSocket when `VITE_IS_BUN=true`.
- **Midnight WASM**: `@midnight-ntwrk/onchain-runtime` must be imported before other Midnight imports in `main.*.ts`.
- **Multi-env configs**: `config.dev.ts` (Hardhat + local Midnight) and `config.mainnet.ts` (Arbitrum One + Midnight mainnet). Mainnet requires `EVM_RPC_URL`, `EVM_START_BLOCK`, `MIDNIGHT_START_BLOCK` env vars.

## Midnight SDK versions

All Midnight dependencies must be pinned to exact versions from the compatibility matrix:
https://github.com/midnightntwrk/midnight-sdk/blob/main/COMPATIBILITY.md

Never use `^` or `~` ranges. Current template set (Midnight node 2.x / Ledger 9):
- Compact compiler `+0.33.0-rc.2` from `toolchain.json`, compact-runtime `0.18.0-rc.1`, compact-js `2.5.5-rc.7`
- midnight-js-* `5.0.0-beta.6`, ledger-v9 `1.0.0-rc.3`, onchain-runtime-v4 `4.0.0-rc.3`
- Wallet SDK packages use the `@midnightntwrk/*` scope and the exact beta versions pinned in `packages/frontend/package.json`.

The old `@midnight-ntwrk/ledger`, ledger-v8, onchain-runtime-v3, `zswap`, and `wallet`/`wallet-api` packages belong to the prior node-1/Ledger-8 generation and must not be mixed into this template.

## Midnight wallet SDK (v3/v4 API)

`WalletFacade.init()` (not `new WalletFacade()`):
```ts
const wallet = await WalletFacade.init({
  configuration,
  shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(keys),
  unshielded: (cfg) => UnshieldedWallet(cfg).startWithPublicKey(pubKey),
  dust: (cfg) => DustWallet(cfg).startWithSecretKey(dustKey, dustParams),
});
await wallet.start(shieldedKeys, dustKey);
```

`findDeployedContract` requires `compiledContract` (not `contract`):
```ts
const compiled = CompiledContract.make('contract-round-value', Counter.Contract).pipe(
  CompiledContract.withWitnesses(witnesses as never),
  CompiledContract.withCompiledFileAssets('./'),
);
await findDeployedContract(providers, { contractAddress, compiledContract: compiled, ... });
```

`levelPrivateStateProvider` requires `privateStoragePasswordProvider` (16+ chars) and `accountId`:
```ts
levelPrivateStateProvider({
  privateStoragePasswordProvider: async () => "EffectstreamStorage1!",
  accountId: walletAddress,
})
```

## Ports

| Service | Port |
|---------|------|
| Sync node API | 9999 |
| Batcher | 3334 |
| Frontend | 10599 |
| PGLite | 5432 |
| Hardhat EVM | 8545, 8546 |
| Midnight node | 9944 |
| Midnight indexer | 8088 |
| Midnight proof server | 6300 |

## Bun-specific workarounds

- **MQTT broker**: Skipped via `typeof Bun` guard (Bun lacks `ws.createWebSocketStream`). Frontend polls `/block-heights` REST endpoint instead.
- **`node-fetch` in Vite**: Aliased to `native-fetch-shim.mjs` (prevents `fs.promises` crash from `memfs` polyfill).
- **`.bun/` cached packages**: Bun resolves nested imports through `.bun/`, not top-level symlinks. Patches to source packages won't take effect — patch the `.bun/` copy.
- **`MIDNIGHT_STORAGE_PASSWORD`**: Must have 3 of 4 character classes (upper, lower, digit, special). Use `YourPasswordMy1!`.
