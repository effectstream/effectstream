# Solana Starter

> A gasless Solana counter dApp: the user signs, a fee-payer batcher pays, and the sync node indexes the program's own log lines into Postgres.

This template is a complete Solana round-trip built with Effectstream. It ships a vanilla
(no Anchor) on-chain **counter program**, a sync node that indexes that program's logs into
Postgres, a transaction batcher that sponsors gas as the fee payer, a read-only HTTP API,
and a Vite + React frontend that works with Phantom or with a generated in-browser dev
keypair.

Read it if you want to see how Effectstream reads Solana. Solana has no EVM-style typed
event log — a program's only observable output is the text it writes with `msg!`, mixed
into one flat stream alongside every other program the transaction touched. Getting from
that stream to a deterministic state machine is the interesting part, and it is what this
template exists to demonstrate.

## What this template shows

**Log-based indexing of a Solana program, safely.** A Solana transaction's
`meta.logMessages` is a single interleaved stream covering every program in the
transaction, framed by `Program <id> invoke [N]` / `Program <id> success` lines. Two naive
approaches both break: matching on `accountKeys.includes(programId)` proves nothing (any
transaction may name an account key it never calls, so an attacker can list the watched
program, have their *own* program print the expected text, and have it attributed to the
watched program), and forwarding every line in the transaction hands the state machine
other programs' output. The `SOLANA:ProgramLog` primitive walks the invoke/success framing
instead and returns only the lines the watched program itself emitted at its own frame
depth — which also picks up programs invoked through an address lookup table, since those
never appear in `message.accountKeys`. The template turns that on with one primitive entry
in `packages/node/config.dev.ts`, and the state machine can then treat every line it
receives as genuinely written by the counter program.

**The chain is the message bus, not the batcher.** Unlike the EVM templates, the
user-facing input here is a **raw, partially-signed Solana transaction** rather than a
concise grammar payload. Nothing the user submits reaches the state machine directly: the
batcher's job ends when the transaction lands on chain, and the state machine's input comes
back around from the sync node reading the program's log. The on-chain program is the only
source of truth, and a replay of the chain reproduces the database exactly.

**Fully feeless for the user.** The frontend builds a transaction whose fee payer is the
batcher's sponsor key and partial-signs it. The batcher validates it — the fee payer must be
the sponsor, and every instruction must target the counter program (or ComputeBudget, whose
priority fee is capped separately, since the sponsor would be the one paying it) — then
co-signs as fee payer and submits. The counter program is written to take the rent payer as an explicit account
(`packages/contracts-solana/programs/counter/src/lib.rs`), so the sponsor funds the counter
PDA's rent as well as the transaction fee. The user only ever provides a signature — which
is free — and never has to hold SOL. That is why the frontend can fall back to an
`Keypair.generate()` dev key with a zero balance and still work.

## Effectstream features used

| Feature | Where | Used for |
| --- | --- | --- |
| `SOLANA:ProgramLog` primitive (`PrimitiveTypeSolanaProgramLog`) | `packages/node/config.dev.ts` | Surfacing the counter program's `msg!` lines as `solana-program-log` state-machine inputs, scoped to `COUNTER_PROGRAM_ID` |
| `ConfigSyncProtocolType.SOLANA_RPC_PARALLEL` | `packages/node/config.dev.ts` | Polling the validator's JSON-RPC for slots, with `confirmationDepth`, `stepSize` and `delayMs` tuning |
| `ConfigSyncProtocolType.NTP_MAIN` | `packages/node/config.dev.ts` | The main (timing) chain — Solana is read as a parallel chain |
| `@effectstream/sm` state machine | `packages/node/state-machine.ts` | Parsing `EFFECTSTREAM_COUNTER\|…` log lines into `counter_state` / `counter_events` |
| `@effectstream/concise` grammar | `packages/node/grammar.ts` | The single `solana-program-log` entry the primitive feeds |
| Batcher `SolanaAdapter` (`@effectstream/batcher-sdk`) | `packages/batcher/solana-adapter.ts` | Fee-payer sponsorship: co-signing and submitting user-signed transactions scoped to one program |
| `StartConfigApiRouter` (`@effectstream/runtime`) | `packages/node/api.ts` | Read-only Fastify routes over the indexed state |
| Migrations + pgtyped queries (`@effectstream/db`) | `packages/database/` | `counter_state` / `counter_events` schema and typed queries |
| `@effectstream/solana-node` binary wrapper | `packages/node/chain-start.ts`, `packages/contracts-solana/scripts/build-program.ts` | Vendored `solana-test-validator` and `cargo-build-sbf` — no global Solana or Rust toolchain |
| `@effectstream/orchestrator` | `start.dev.ts` | The dev process graph (PGLite, program build, validator, airdrop, sync, batcher, frontend) |

## Quick start

**Prerequisites: Bun only.** `packages/contracts-solana/build/counter.so` is committed, and
the `solana-test-validator` binary is downloaded on demand by
`@effectstream/solana-node` — so a fresh clone needs no Rust toolchain, no `cargo-build-sbf`
and no global `solana` CLI.

```sh
# Install dependencies
bun install

# Launch the full stack: PGLite, counter-program build check, solana-test-validator
# with counter.so preloaded, batcher airdrop, sync node, batcher, frontend.
bun run dev
```

Open the dApp at [http://localhost:5173](http://localhost:5173), connect (Phantom, or the
in-browser dev keypair if Phantom is not installed) and submit an increment.

| Service | URL |
| --- | --- |
| Frontend | http://localhost:5173 |
| Batcher | http://localhost:3334 |
| Sync node HTTP API | http://localhost:9999 |
| Sync node MQTT (TCP) | mqtt://localhost:8883 |
| Sync node MQTT (WebSocket) | ws://localhost:9883 |
| Solana validator (JSON-RPC) | http://localhost:8899 |
| Solana validator (WebSocket) | ws://localhost:8900 |
| Solana faucet | localhost:9900 |
| PGLite (Postgres) | postgres://localhost:5432 |
| Orchestrator API | http://localhost:4747 |

### Rebuilding the program

Only needed after editing `packages/contracts-solana/programs/counter/src/lib.rs`. The
compiler comes from `@effectstream/solana-node`'s vendored `cargo-build-sbf`, which is
populated when the validator binary downloads — so run the stack once before the first
explicit rebuild, or put a `cargo-build-sbf` on `PATH`.

```sh
bun run build:solana              # compile explicitly, then commit build/counter.so
SKIP_SOLANA_BUILD=0 bun run dev   # or recompile as part of `dev`
```

### Developing against the monorepo

`bun install` is all the template needs — every `@effectstream/*` package it depends on is
published. Use `link.sh` only when working on unreleased engine changes inside the
Effectstream monorepo: it installs npm dependencies and then repoints every
`@effectstream/*` package at its local monorepo source, so the template exercises your
working tree instead of the published release.

```sh
./link.sh
bun run dev
```

## Project structure

```
solana-starter/
  packages/
    node/                        # @solana-starter/node — sync node, STM, config, API
      main.dev.ts                #   dev entry point: config + grammar + STM + migrations + API
      config.dev.ts              #   networks, sync protocols, SOLANA:ProgramLog primitive
      grammar.ts                 #   the single `solana-program-log` grammar entry
      state-machine.ts           #   parses EFFECTSTREAM_COUNTER|… lines into the DB
      api.ts                     #   read-only Fastify routes
      chain-start.ts             #   launches solana-test-validator with counter.so preloaded
      airdrop.ts                 #   funds the batcher fee-payer wallet on the local validator
    contracts-solana/            # @solana-starter/contracts-solana — the on-chain program
      programs/counter/src/lib.rs#   Rust counter program (no Anchor)
      build/counter.so           #   compiled program, committed
      keypair/counter-program.json #  fixed program keypair (public, localnet only)
      instructions.ts            #   client-side instruction builders mirroring the wire format
      program-id.ts              #   program id, discriminants, PDA seed
      dev-config.ts              #   local URLs, namespace and sponsor pubkey shared by all packages
      scripts/build.ts           #   build entry: compiles the program and regenerates mod.ts
      scripts/build-program.ts   #   runs the vendored cargo-build-sbf
    database/                    # @solana-starter/database — migrations + pgtyped queries
      migrations/000-init.sql    #   counter_state, counter_events
      sql/queries.sql            #   pgtyped query definitions
    batcher/                     # @solana-starter/batcher — fee-payer sponsor
      batcher.dev.ts             #   batcher config and entry point
      solana-adapter.ts          #   SolanaAdapter construction + dev-keypair guardrails
      keypair/batcher-wallet.json#   local fee-payer keypair (public, localnet only)
    frontend/                    # @solana-starter/frontend — Vite + React dApp
      src/App.tsx                #   wallet, increment form, leaderboard, event log
    tests/                       # @solana-starter/tests — orchestrated end-to-end suite
  start.dev.ts                   # Orchestrator process graph
  link.sh                        # Repoint @effectstream/* at monorepo sources
```

## How it works

```
frontend / tests                 batcher (fee payer)            solana-test-validator
  build increment tx  ──────────▶  validates + co-signs ───────▶  counter program runs,
  (user partial-signs)             + submits                      emits a program log

                                                                         │
                                       sync node  ◀──────────────────────┘
                                SOLANA:ProgramLog primitive
                                          │
                                  state machine parses
                                  `EFFECTSTREAM_COUNTER|…`
                                          │
                                   Postgres (counter_state,
                                    counter_events)
                                          │
                                    HTTP API  ──▶  GET /api/counters
```

### Program (contracts)

`packages/contracts-solana/programs/counter/src/lib.rs` is plain `solana-program` — no
Anchor, so it builds with the vendored `cargo-build-sbf` alone. It stores a little-endian
`u64` in a PDA seeded by `[b"counter", authority]`, and takes four accounts in a fixed
order: authority (signer), counter PDA, payer (signer, funds rent), system program. Two
instructions are selected by a leading discriminant byte — `Increment(amount)` (`0`,
followed by a little-endian `u64`) and `Reset` (`1`).

Every successful call ends with the same log line:

```rust
let slot = Clock::get()?.slot;
let value = read_u64(counter_info)?;
// Stable wire format consumed by the effectstream sync node's state machine.
msg!(
    "EFFECTSTREAM_COUNTER|{}|{}|{}",
    authority_info.key,
    value,
    slot
);
```

That format is the contract between the chain and the indexer. `packages/contracts-solana/instructions.ts`
mirrors the account order and byte layout on the client side, so the frontend and the tests
build the same instruction the Rust program expects.

The PDA is created lazily on first use with a transfer + `allocate` + `assign` sequence
rather than `system_instruction::create_account`, because `create_account` fails with
`AccountAlreadyInUse` once the target holds any lamports — which would let anyone brick a
user's counter forever by sending it 1 lamport before their first increment.

### Batcher

`packages/batcher/batcher.dev.ts` runs a `SolanaAdapter` from `@effectstream/batcher-sdk`
holding the sponsor keypair:

```ts
const solana = createSolanaAdapter({
  rpcUrl: RPC_URL,
  batcherKeypairPath: BATCHER_KEYPAIR,
  syncProtocolName: SYNC_PROTOCOL_NAME,
  targetProgramId: COUNTER_PROGRAM_ID,
  // The counter program creates a PDA funded by the sponsor, so it must be
  // allowed to appear as the rent payer in the sponsored instruction.
  allowSponsorAsInstructionAccount: true,
});
```

`targetProgramId` confines the sponsor to the counter program — anything else (a System
transfer, a token move) is rejected outright, with ComputeBudget instructions the only other
allowance, bounded by `maxPriorityFeeMicroLamports` (default `0n`, so the frontend's
`setComputeUnitLimit` passes while any priority-fee instruction is refused).
`allowSponsorAsInstructionAccount` permits the one exception the program needs — the sponsor
appearing as the rent-paying account. Batching criteria are
`{ criteriaType: "size", maxBatchSize: 1 }`: Solana transactions do not compose into one
another, so the adapter never merges them, and size 1 simply keeps latency low while still
flowing through the batcher's queue and retry logic.

Clients POST to the batcher's `/send-input` endpoint with the base64 partially-signed
transaction as `input` and `addressType: 9` (`AddressType.SOLANA`) — see
`packages/frontend/src/App.tsx` and `packages/tests/stm/submit-counter.test.ts`, which build
identical payloads.

### Grammar

The grammar has a single entry, and it is not a user-authored action — it is the shape the
`SOLANA:ProgramLog` primitive emits:

```ts
export const grammar = {
  "solana-program-log": [
    ["slot", Type.Number()],
    ["programId", Type.String()],
    ["logMessages", Type.Array(Type.String())],
  ],
} as const satisfies GrammarDefinition;
```

`packages/node/config.dev.ts` binds that to the counter program:

```ts
.buildPrimitives((builder) =>
  builder.addPrimitive(
    (syncProtocols) => (syncProtocols as any).parallelSolanaRPC,
    (_network, _deployments, _syncProtocol) => ({
      name: "SolanaProgramLog",
      type: PrimitiveTypeSolanaProgramLog,
      startBlockHeight: 0,
      programId: COUNTER_PROGRAM_ID,
      stateMachinePrefix: "solana-program-log",
    }),
  ),
)
```

`stateMachinePrefix` is what ties the primitive's output to the grammar key, so the state
machine transition is registered under the same name.

### State machine

`packages/node/state-machine.ts` handles that one transition. It re-checks the program id
(the primitive already filters, but the state machine is the security boundary), parses
each line, then reads the previous value so it can record a `kind` and `delta` on the event
row:

```ts
stm.addStateTransition("solana-program-log", function* (data) {
  const { parsedInput, blockHeight } = data;
  const { slot, programId, logMessages } = parsedInput;

  // Safety check; the primitive already filters to this program.
  if (programId !== COUNTER_PROGRAM_ID) return;

  for (const raw of logMessages) {
    const parsed = parseCounterLog(raw);
    if (!parsed) continue;
```

Parsing strips the `Program log: ` prefix that `msg!` produces on the wire and rejects
anything that is not the expected four-field line. Values stay `bigint` end to end, because
the on-chain counter is a `u64` and going through `Number()` would silently stop indexing
past 2^53:

```ts
const line = raw.startsWith("Program log: ")
  ? raw.slice("Program log: ".length)
  : raw;
if (!line.startsWith(COUNTER_LOG_PREFIX + "|")) return null;
const parts = line.split("|"); // [PREFIX, authority, value, slot]
if (parts.length !== 4) return null;
```

The database is written only here — `upsertCounterState` for the latest value per
authority, `insertCounterEvent` for the append-only log. Nothing else in the template
mutates it, which is what keeps replays deterministic.

### API

`packages/node/api.ts` exposes read-only routes over the indexed state:

| Route | Description |
| --- | --- |
| `GET /api/counter/:authority` | Latest value for a single authority (404 if unknown) |
| `GET /api/counters` | All counters ordered by value, highest first |
| `GET /api/counter-events?limit=N` | Recent events, newest first (default 50, clamped to 1–500) |

The frontend polls `/api/counters` and `/api/counter-events?limit=50` every two seconds to
render the leaderboard and the live event log.

### Database

`packages/database/migrations/000-init.sql` defines two tables — `counter_state`, keyed by
`authority` with the latest `value`, `slot` and engine `block_height`, and `counter_events`,
an append-only log carrying `kind` (`"increment"` or `"reset"`) and `delta`. Queries live in
`packages/database/sql/queries.sql` and are typed with pgtyped; `packages/database/mod.ts`
exports both the generated queries and the `migrationTable` the sync node applies at
startup.

```sh
bun run build:pgtypes   # regenerate query types (requires a running Postgres)
```

## Configuration

`packages/contracts-solana/dev-config.ts` is the single place the local endpoints,
namespace and sponsor public key are defined; the frontend, batcher and tests all import
from it rather than hardcoding URLs.

| Variable | Default | Description |
| --- | --- | --- |
| `SKIP_SOLANA_BUILD` | `1` | Reuse `build/counter.so` when present; compiles it when absent. `0` forces a rebuild |
| `SOLANA_PLATFORM_TOOLS_VERSION` | `v1.52` | platform-tools version passed to `cargo-build-sbf` |
| `SKIP_FORCE_TOOLS_INSTALL` | unset | Set to `1` to drop `--force-tools-install` from the build |
| `SOLANA_RPC_PORT` | `8899` | Validator JSON-RPC port |
| `SOLANA_FAUCET_PORT` | `9900` | Validator faucet port |
| `SOLANA_RESET` | `true` | Reset the validator ledger on each boot; `false` persists it |
| `SOLANA_RPC_URL` | `http://localhost:8899` | RPC the batcher submits to |
| `SOLANA_SYNC_PROTOCOL_NAME` | `parallelSolanaRPC` | Sync protocol the batcher reports against |
| `BATCHER_PORT` | `3334` | Batcher HTTP port |
| `BATCHER_NAMESPACE` | `solana-starter` | Must match the security namespace the client signs under, or the batcher returns `401 Invalid signature` |
| `BATCHER_POLLING_MS` | `1000` | Batcher polling interval |
| `EFFECTSTREAM_API_PORT` | `9999` | Sync node HTTP API port |
| `PGLITE` | `true` (set by `start.dev.ts`) | Use embedded PGLite instead of an external Postgres |

### Targeting a real network

`packages/node/config.dev.ts` points `solanaMain` at `http://localhost:8899` with
`networkId: "localnet"`; change both to target devnet or mainnet, and deploy the program
with `solana program deploy` instead of the validator's `--bpf-program` preload that
`packages/node/chain-start.ts` uses.

> [!WARNING]
> **The keypairs in this template are public.** `packages/batcher/keypair/batcher-wallet.json`
> and `packages/contracts-solana/keypair/counter-program.json` are committed on purpose, so
> local dev is zero-setup and the program id stays deterministic. Their secret keys are in
> the repository and anyone can drain them. They are localnet throwaways.
>
> Before pointing this at devnet or mainnet, generate your own:
>
> ```sh
> solana-keygen new --outfile packages/batcher/keypair/batcher-wallet.json
> solana-keygen new --outfile packages/contracts-solana/keypair/counter-program.json
> ```
>
> then update `declare_id!` in `packages/contracts-solana/programs/counter/src/lib.rs` and
> `COUNTER_PROGRAM_ID` in `packages/contracts-solana/program-id.ts` to the new program id.
> As a backstop, `packages/batcher/solana-adapter.ts` refuses to start if the committed
> sponsor key is used against a non-loopback RPC.
>
> The sponsor also pays every transaction fee it co-signs. `SolanaAdapter` bounds
> *per-transaction* cost — scoping to one program, and rejecting priority fees above
> `maxPriorityFeeMicroLamports` — but not *volume*. Add a rate limit before exposing a
> funded batcher publicly.

## Testing

```sh
bun run test
```

`packages/tests/run-tests.ts` boots the full stack through the orchestrator
(`packages/tests/start.test.ts`) and runs two phases:

- **Phase A — infrastructure** (`packages/tests/infra/`): the validator answers `getHealth`;
  the counter program is loaded at `COUNTER_PROGRAM_ID`, owned by a BPF loader and marked
  executable; the batcher wallet has a non-zero balance after the airdrop.
- **Phase B — round-trip** (`packages/tests/stm/`): a fresh `Keypair` partial-signs an
  increment, posts it to the batcher's `/send-input`, and the suite asserts the resulting
  rows appear in `counter_state` / `counter_events` and that `/api/counters`,
  `/api/counter/:authority` and `/api/counter-events` serve them.

The frontend is deliberately not covered: Phantom cannot be driven headlessly, and Phase B
exercises the identical submission path with a raw keypair.

## Where to go next

- [Solana on Effectstream](https://effectstream.github.io/docs/home/chains/solana) — network
  configuration, the full Solana primitive set, wallets and signature verification.
- [Primitives](https://effectstream.github.io/docs/home/components/primitives) — how primitives
  turn chain data into state-machine inputs, including `SOLANA:AccountBalance` and
  `SOLANA:TokenAccount`, which this template does not use.
- [Batcher overview](https://effectstream.github.io/docs/home/components/batcher/overview) — the
  adapter model behind the fee-payer sponsor used here.
- [State machine](https://effectstream.github.io/docs/home/components/state-machine) — the
  transition model and determinism rules the counter indexer relies on.
- [All templates](https://effectstream.github.io/docs/home/templates) — sibling starters, including
  `minimal` for the EVM equivalent of this layout and `batcher-validations` for custom
  batcher validation logic.
