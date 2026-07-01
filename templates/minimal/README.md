# Minimal Effectstream Template

A bare-bones Effectstream template: one EVM chain (Hardhat in dev), one grammar action, one state-machine transition that logs each input to PostgreSQL, and a small vanilla-JS frontend to submit inputs from a connected wallet.

## Quick Start

```sh
bun install
bun run dev
```

Then open <http://localhost:10599> and connect an EVM wallet (e.g. MetaMask on the Hardhat chain).

> **You need a funded wallet.** Submitting an input is a real on-chain transaction — this template has **no batcher**, so inputs are sent *self-sequenced* and the connected account must hold gas on the local Hardhat chain. Hardhat pre-funds 20 deterministic dev accounts with 10 000 test ETH each; use one of them. In MetaMask: add the network (RPC `http://localhost:8545`, Chain ID `31337`), then **Import account** and paste a Hardhat private key. Default account **#0**:
>
> - Address: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
> - Private key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
>
> ⚠️ These are public keys baked into Hardhat — **local dev only**. Never reuse them or send real funds on any live network.

If you are working from inside the Effectstream monorepo and want to use local `@effectstream/*` packages, run `./link.sh` after `bun install`.

## Environments

| Aspect | Dev | Mainnet |
|---|---|---|
| Chain | Hardhat (localhost:8545) | Arbitrum (`EVM_RPC_URL`) |
| Sync node entry | `packages/node/main.dev.ts` | `packages/node/main.mainnet.ts` |
| Config | `packages/node/config.dev.ts` | `packages/node/config.mainnet.ts` |
| Start command | `bun run dev` | `bun run start:mainnet` |
| Local services | PGLite + Hardhat + sync + frontend | None launched — sync node only |

### Mainnet env vars

| Variable | Required | Description |
|---|---|---|
| `EVM_RPC_URL` | yes | RPC endpoint for the target EVM chain (e.g. Arbitrum) |
| `EVM_START_BLOCK` | yes | Block number to begin syncing from |
| `EFFECTSTREAM_L2_ADDRESS` | yes | Deployed `MyEffectstreamL2` contract address |
| `NTP_START_TIME` | no | Override NTP start timestamp (ms); auto-recovered from DB otherwise |

## Testing

```sh
bun run test
```

Spins up PGLite + Hardhat + the sync node, then runs:

- **Phase A — Infrastructure**: chain reachable on 8545, `MyEffectstreamL2` deploys to a valid address
- **Phase B — STM / DB / API**: submits `["my_action_name", "hello-from-test"]` via `effectstreamSubmitGameInput` directly through viem, then asserts the row appears in `inputs_log` and is served by `GET /api/inputs`

There is no batcher in this template, so the test submits transactions on-chain directly with a Hardhat private key.

## Project Structure

```
minimal/
├── start.dev.ts                          # Orchestrator config (used by `bun run dev`)
└── packages/
    ├── node/                             # @minimal/node — sync engine
    ├── database/                         # @minimal/database — migrations + pgtyped queries
    ├── contracts-evm/                    # @minimal/contracts-evm — Solidity, Hardhat, Ignition
    ├── frontend/                         # @minimal/frontend — vanilla JS + esbuild + Fastify static
    └── tests/                            # @minimal/tests — e2e test suite
```

## Package descriptions

### `@minimal/node`

| File | Purpose |
|---|---|
| `grammar.ts` | Grammar definition (`my_action_name` action) |
| `config.dev.ts` | `ConfigBuilder` for local Hardhat |
| `config.mainnet.ts` | `ConfigBuilder` for Arbitrum — validates env vars |
| `state-machine.ts` | One transition that writes to `inputs_log` |
| `api.ts` | `GET /api/inputs` |
| `main.dev.ts` / `main.mainnet.ts` | Entry points |

### `@minimal/database`

One migration (`000-init.sql`) creating a single table:

```sql
CREATE TABLE inputs_log (
  id SERIAL PRIMARY KEY,
  signer TEXT NOT NULL,
  payload TEXT NOT NULL,
  block_height INTEGER NOT NULL
);
```

### `@minimal/contracts-evm`

`MyEffectstreamL2` is a thin wrapper extending `EffectstreamL2Contract` from `@effectstream/evm-contracts`. The orchestrator's `generate-evm-mod` step auto-generates `mod.ts` after deployment.

### `@minimal/frontend`

Vanilla JS bundled with esbuild, served by Fastify + `@fastify/static` on port 10599. Uses `@effectstream/wallets` for wallet connect and `sendTransaction` to submit the input.

### `@minimal/tests`

Phase A + Phase B as described above. No frontend smoke test.

## Services

| Service | Port |
|---|---|
| Sync node API | 9999 |
| Frontend | 10599 |
| PGLite | 5432 |
| Hardhat EVM | 8545 |
| Orchestrator | 4747 |

## Grammar

| Action | Args | Effect |
|---|---|---|
| `my_action_name` | `input: string` | Inserts a row into `inputs_log` with the signer, payload, and block height |

## API

| Method | Path | Response |
|---|---|---|
| `GET` | `/api/inputs` | `{ inputs: [{ id, signer, payload, block_height }, ...] }` (latest 100) |
| `GET` | `/health` | `{ status: "ok" }` |
