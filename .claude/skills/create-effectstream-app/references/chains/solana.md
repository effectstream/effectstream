# Solana

`packages/contracts-solana/` — Rust → SBF compiled programs, loaded into a local `solana-test-validator`.

> **See also (concept docs).**
> - Solana chain overview, primitives, sponsor batcher, wallets: `docs/site/docs/home/200-chains/211-solana.md`
> - Per-binary (integrity check, version pin, bind defaults): `docs/site/docs/home/500-packages/540-binaries/solana-node.md`
> - Solana primitives (program log, account balance): `docs/site/docs/home/100-components/118-primitives.md`
> - Reference deploy + e2e wiring: `e2e/shared/contracts/solana/`

## Tools (probe before scaffolding)

| Tool | Required for | If missing |
|---|---|---|
| `bun` | All Effectstream work | Stop — install Bun before continuing. |
| — | Compiling Solana programs | Nothing global. `cargo-build-sbf` ships inside `@effectstream/solana-node` and auto-installs the platform-tools it needs. |

The validator binary is vendored through `@effectstream/solana-node` (no system install, no Solana CLI needed). It verifies the binary's SHA-256 before first execution.

## Local dev environment

`launchSolana` starts `solana-test-validator` and exposes its RPC (`:8899`) for the sync node to poll. Programs are loaded into genesis by address via `--bpf-program`, so no deploy step and no program keypair are required — pass `bpfPrograms: [{ address, soPath }]` to the binary package's `run()`.

Import path is `@effectstream/orchestrator/scripts/launch-solana` (note: not `./launch-solana`, unlike the other chains).

## Required `launchSolana` package scripts

- `chain:start` — start the validator with the program(s) preloaded
- `chain:wait` — wait until RPC is responsive (`wait-on tcp:8899`)

## Program build and sponsor-wallet phases

Solana templates commonly need setup beyond `launchSolana`: build the SBF `.so`, create or reuse the sponsor keypair, and fund it before the sponsored batcher starts. Represent these as one-shot orchestrator processes, not hidden side effects in the batcher:

```text
build-program → solana-validator → create-sponsor-wallet → fund-sponsor-wallet → batcher
```

The validator process must depend on `build-program` when `chain:start` loads the `.so` with `--bpf-program`. `fund-sponsor-wallet` depends on both wallet creation and `SolanaNames.SOLANA_VALIDATOR_WAIT`; the batcher depends on funding. Put substantial provisioning logic in a purpose-named package such as `packages/wallet-provisioning`, make it reuse an existing valid keypair and check the current balance before airdropping, and cover the artifact/balance in Phase A. Never create or fund a production wallet automatically.

## Sync protocol + primitives

Sync protocol: `SOLANA_RPC_PARALLEL`. Polls slot by slot; **skipped slots are normal** and are passed over.

| Primitive | Watches | Payload |
|---|---|---|
| `PrimitiveTypeSolanaProgramLog` | `programId` (+ optional `eventType` substring) | `{ programId, slot, logMessages }` |
| `PrimitiveTypeSolanaAccountBalance` | `address` | `{ address, lamports, slot }` |
| `PrimitiveTypeSolanaTokenAccount` | at least one of `mint` / `owner` / `tokenAccount` (+ optional `tokenProgramId`) | `{ tokenAccount, mint, owner, amount, decimals, slot }` |

Program-log attribution keys off the log stream's `invoke`/`success` framing, not `accountKeys` — a program merely referenced as an account is not treated as invoked, and only its own log lines are forwarded. Reverted transactions are skipped.

> **Use `stateMachinePrefix`, not `scheduledPrefix`.** The runtime constructs primitives by spreading the config into the `Primitive` constructor, which reads `stateMachinePrefix`. Setting only `scheduledPrefix` still writes accounting rows but silently never reaches the state machine.

## Batcher

`SolanaAdapter` — fee-payer sponsor (gasless). The user sets `feePayer` to the sponsor's pubkey and partially signs; the batcher co-signs and submits. Transactions are **base64**.

Scoped to one `targetProgramId`. `maxPriorityFeeMicroLamports` defaults to `0n` (any priority fee rejected) because the sponsor pays it. Volume is not bounded by the adapter — enable the batcher's built-in rate limiting (`rateLimit` config, `packages/batcher/core/rate-limiter.ts`) before exposing a funded batcher.

## Wallets

`WalletMode.Solana` covers Phantom, Backpack, Solflare and any Wallet Standard wallet. `signMessage` returns base64; `CryptoManager.Solana()` verifies Ed25519 over the UTF-8 message bytes.

## Gotchas

- **Do not bump `@effectstream/solana-node` past Agave 3.0.x.** 3.1+ hard-asserts io_uring, which Docker's default seccomp profile blocks, so it cannot start in a container. macOS builds omit the assert, so a newer version looks fine locally and fails in CI.
- The validator's **faucet** always binds `0.0.0.0`; only the RPC honours the loopback default.
- Upstream publishes no ARM64 **Linux** validator build.
