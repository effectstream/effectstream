# Solana Starter Template

A minimal end-to-end Solana dApp built with Effectstream. It ships a vanilla
(no Anchor) on-chain **counter program**, a sync node that indexes the
program's logs into Postgres, a transaction batcher that sponsors gas as the
fee-payer, a read-only HTTP API, and a Vite + React frontend (Phantom, or an
in-browser dev keypair).

It demonstrates the full Solana round-trip:

```
frontend / client                batcher (fee-payer)            solana-test-validator
  build increment tx  ──────────▶  signs + submits   ──────────▶  counter program runs,
  (user partial-signs)                                            emits a program log

                                                                         │
                                       sync node  ◀──────────────────────┘
                                  reads the program log
                                          │
                                  state machine parses
                                  `EFFECTSTREAM_COUNTER|…`
                                          │
                                   Postgres (counter_state,
                                    counter_events)
                                          │
                                    HTTP API  ──▶  GET /api/counters
```

## Quick Start

```sh
# Install dependencies
bun install

# Launch the full stack (PGLite, validator + counter program, sync node,
# batcher, frontend). Uses the committed counter.so — no Rust required.
bun run dev
```

Open the dApp at [http://localhost:5173](http://localhost:5173).

The counter program is compiled from source on first run. `build/` is
gitignored, so nothing pre-compiled ships with the template — `cargo-build-sbf`
comes from `@effectstream/solana-node` and auto-installs the Solana
platform-tools it needs, so no global Rust or Solana toolchain is required.

Later runs reuse `build/counter.so` (that is what `SKIP_SOLANA_BUILD=1`, the
default, means). To force a recompile:

```sh
bun run build:solana          # compile explicitly
SKIP_SOLANA_BUILD=0 bun run dev   # or recompile as part of `dev`
```

## Monorepo Development

When developing inside the Effectstream monorepo, use `link.sh` instead of
`bun install`. It installs npm dependencies and then symlinks all
`@effectstream/*` packages (and the unpublished `@effectstream/solana-node`
binary wrapper) to their local monorepo sources:

```sh
./link.sh
bun run dev
```

## How It Works

Unlike the EVM templates, the user-facing input is a **raw Solana transaction**
submitted through the batcher — not a concise grammar payload. The on-chain
program is the source of truth, and the chain itself is the message bus:

1. **On-chain program** (`packages/contracts-solana/programs/counter`) stores a
   `u64` counter in a PDA seeded by the user's pubkey. On every instruction it
   emits a stable log line via `msg!`:

   ```
   EFFECTSTREAM_COUNTER|<authority>|<value>|<slot>
   ```

2. **Batcher** (fee-payer sponsor) receives a **base64 partially-signed
   transaction** whose fee payer is the batcher's sponsor key, validates it
   (fee payer == sponsor; every instruction must target the counter program),
   co-signs as the fee-payer, and submits it. The counter program takes the
   sponsor as an explicit rent-paying account, so the batcher also funds the
   counter PDA's rent — the user signs but never needs any SOL
   (**fully feeless**).

3. **Sync node** runs the `SolanaProgramLog` primitive, configured with the
   counter program's id. The engine surfaces every transaction touching that
   program and feeds `{ slot, programId, logMessages }` into the state machine
   as a `solana-program-log` input.

4. **State machine** (`packages/node/state-machine.ts`) parses the
   `EFFECTSTREAM_COUNTER|…` log lines and writes the new value to
   `counter_state` / `counter_events`. The DB is only ever mutated by the STM,
   which keeps replays deterministic.

5. **API** (`packages/node/api.ts`) serves the indexed state read-only.

## API

| Route | Description |
|-------|-------------|
| `GET /api/counter/:authority` | Latest value for a single authority (404 if unknown) |
| `GET /api/counters` | Leaderboard of all counters, ordered by value |
| `GET /api/counter-events?limit=N` | Recent counter events, newest first (default 50, max 500) |

## Testing

```sh
bun run test
```

Runs the suite in `packages/tests/`, which boots the full stack via the
orchestrator and covers two phases:

- **Phase A — infrastructure:** validator health, counter program loaded at the
  expected id, batcher wallet funded.
- **Phase B — round-trip:** submits counter increments through the batcher and
  asserts they land in `counter_state` / `counter_events` and are served by the
  HTTP API.

## Project Structure

```
solana-starter/
  packages/
    node/                  # @solana-starter/node
    database/              # @solana-starter/database
    contracts-solana/      # @solana-starter/contracts-solana
      programs/counter/      # Rust counter program (compiled to counter.so)
    batcher/               # @solana-starter/batcher
    frontend/              # @solana-starter/frontend
    tests/                 # @solana-starter/tests
  start.dev.ts             # Orchestrator process graph
  link.sh                  # Symlink monorepo packages for local dev
```

### packages/node

Sync node, state machine, config, API, and dev tooling. Key files:

| File | Purpose |
|------|---------|
| `main.dev.ts` | Dev entry point — wires config, grammar, STM, migrations, API |
| `config.dev.ts` | Solana network, sync protocol, and `SolanaProgramLog` primitive config |
| `state-machine.ts` | `Stm` with the `solana-program-log` transition that parses counter logs |
| `grammar.ts` | Input grammar — a single `solana-program-log` entry |
| `api.ts` | Fastify read-only routes (`/api/counter*`) |
| `chain-start.ts` | Launches `solana-test-validator` with `counter.so` at a fixed program id |
| `airdrop.ts` | Funds the batcher fee-payer wallet on the local validator |

### packages/contracts-solana

The on-chain counter program. Contains the Rust source
(`programs/counter/src/lib.rs`), the build script (`scripts/build.ts`, via the
vendored `cargo-build-sbf`), the committed `build/counter.so`, the fixed
program keypair, and client-side instruction builders (`instructions.ts`) that
mirror the program's wire format.

### packages/database

SQL migrations (`counter_state`, `counter_events`) and pgtyped query
definitions. Exports a `migrationTable` consumed by the sync node.

```sh
bun run build:pgtypes   # regenerate query types (requires a running Postgres)
```

### packages/batcher

Transaction batcher using the fee-payer-sponsor `SolanaAdapter`. The frontend
builds a counter-increment transaction with the batcher's sponsor as fee payer
and partial-signs it; the batcher validates it — per-program scoping means only
the counter program is sponsored, and the sponsor is allowed to appear as the
rent-paying account (`allowSponsorAsInstructionAccount`) — then co-signs as fee
payer and submits. Ships with `batcher.dev.ts` and a local fee-payer keypair
under `keypair/`.

> **⚠️ The keypairs in this template are public.** `keypair/batcher-wallet.json`
> and `contracts-solana/keypair/counter-program.json` are committed so local dev
> is zero-setup and the program ID stays deterministic — which means their
> secret keys are in the repo and anyone can drain them. They are localnet
> throwaways.
>
> Before pointing this at devnet or mainnet, generate your own:
>
> ```bash
> solana-keygen new --outfile packages/batcher/keypair/batcher-wallet.json
> solana-keygen new --outfile packages/contracts-solana/keypair/counter-program.json
> ```
>
> (then update `declare_id!` in `programs/counter/src/lib.rs` and `program-id.ts`
> to the new program ID). As a backstop, the batcher **refuses to start** if the
> committed sponsor key is used against a non-loopback RPC.
>
> The sponsor also pays every transaction fee it co-signs. `SolanaAdapter`
> bounds *per-transaction* cost — scoping to one program, and rejecting priority
> fees above `maxPriorityFeeMicroLamports` (default: none allowed) — but not
> *volume*. Add a rate limit before exposing a funded batcher publicly.

### packages/frontend

Vite + React app with Phantom wallet integration (falls back to a generated
in-browser dev keypair when Phantom isn't installed, so it works with zero
setup). Builds a counter-increment transaction client-side with the batcher's
sponsor as fee payer, partial-signs it, and POSTs the base64 partial tx to the
batcher. Renders a live **leaderboard** (`GET /api/counters`) and an
**incremental event log** (`GET /api/counter-events`) with relative timestamps;
successful submissions link to the transaction in Solana Explorer.

### packages/tests

E2E test suite covering infrastructure readiness and the full
submit → chain → STM → DB → API round-trip.

## Services

| Service | Port | URL |
|---------|------|-----|
| Sync node (HTTP API) | 9999 | http://localhost:9999 |
| Sync node (MQTT TCP) | 8883 | |
| Sync node (MQTT WS) | 9883 | ws://localhost:9883 |
| Batcher | 3334 | http://localhost:3334 |
| Frontend | 5173 | http://localhost:5173 |
| PGLite (Postgres) | 5432 | |
| Solana validator (RPC) | 8899 | http://localhost:8899 |
| Solana validator (WS) | 8900 | ws://localhost:8900 |
| Solana faucet | 9900 | |
| Orchestrator API | 4747 | http://localhost:4747 |

## Environment Variables (Dev)

| Variable | Default | Description |
|----------|---------|-------------|
| `SKIP_SOLANA_BUILD` | `1` | Reuse `build/counter.so` if present; compiles it when absent |
| `SOLANA_PLATFORM_TOOLS_VERSION` | `v1.52` | platform-tools version for `cargo-build-sbf` |
| `SOLANA_RPC_PORT` | `8899` | Validator JSON-RPC port |
| `SOLANA_FAUCET_PORT` | `9900` | Validator faucet port |
| `SOLANA_RESET` | `true` | Reset the validator ledger on each boot (set `false` to persist) |
| `EFFECTSTREAM_API_PORT` | `9999` | Sync node HTTP API port |
| `PGLITE` | `true` | Use embedded PGLite instead of an external Postgres |
