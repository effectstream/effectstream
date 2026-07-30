# Building the Solana e2e test program

`test_event.so` is a minimal Solana program that emits one structured log line
per invocation:

```text
E2E_SOLANA_EVENT|<authority>|<value>
```

It exists so the e2e suite can exercise `SOLANA:ProgramLog` against a **real,
custom program** rather than piggybacking on the System or SPL Memo programs —
including the negative case where another program emits the same marker string
and must NOT be attributed to this program id.

The compiled `.so` is committed, matching the NEAR test contract convention in
`../near/`. Rebuild it only when `programs/test_event/src/lib.rs` changes.

## Prerequisites

None global. `cargo-build-sbf` ships inside `@effectstream/solana-node` and
auto-installs the Solana platform-tools it needs.

## Build

From the repository root, after the solana-node binary has been fetched once:

```sh
packages/binaries/solana-node/vendor/bin/cargo-build-sbf \
  --manifest-path e2e/shared/contracts/solana/programs/test_event/Cargo.toml \
  --sbf-out-dir e2e/shared/contracts/solana \
  --tools-version v1.52
```

Then delete the `test_event-keypair.json` it drops beside the `.so` — the
program is loaded **by address** via `--bpf-program`, so that secret is
unnecessary and is gitignored.

## Program id

`7v54NWdBtkjuAFJrLGsS2SXnuk8nKam81mZJeeYxVFi9`

Derived from `Keypair.fromSeed(new Uint8Array(32).fill(11))` so it is
reproducible. It appears in three places that must agree:

- `declare_id!` in `programs/test_event/src/lib.rs`
- `[package.metadata.solana] program-id` in `programs/test_event/Cargo.toml`
- `TEST_EVENT_PROGRAM_ID` in `program-id.ts` (the single source for TS callers)

## Why `--tools-version v1.52`

platform-tools v1.52 is the first whose bundled cargo (1.85+) handles
edition2024 dependencies. The `cargo-build-sbf` shipped with the pinned Agave
3.0.14 defaults to v1.51, one short.

## Why the lockfile pin

`programs/test_event/Cargo.toml` sets `[lockfile] version = 3`.
`cargo-build-sbf` invokes cargo in a way that rejects the v4 lockfile format
newer Rust toolchains generate by default.
