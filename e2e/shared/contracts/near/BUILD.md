# Building the NEAR test contract

The `test_event_contract.wasm` is a minimal NEAR smart contract that emits a NEP-297 event when `emit_event` is called. It is used by the E2E tests to verify the sync protocol captures on-chain events.

## Prerequisites

- Rust 1.86 (newer versions produce WASM incompatible with the NEAR VM)
- `wasm32-unknown-unknown` target
- `cargo-near` CLI tool

```bash
rustup install 1.86.0
rustup target add wasm32-unknown-unknown --toolchain 1.86.0
cargo install cargo-near
```

## Contract source

Create a temporary directory with these two files:

**Cargo.toml**
```toml
[package]
name = "test-event-contract"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
near-sdk = "=5.5.0"

[profile.release]
codegen-units = 1
opt-level = "s"
```

**src/lib.rs**

See `test_event_contract.rs` in this directory for the current source — the
file is copied verbatim to `src/lib.rs` by `build-contract.sh`.

## Build

```bash
rustup override set 1.86.0
cargo near build non-reproducible-wasm
```

The output WASM is at `target/near/test_event_contract.wasm`. Copy it into this directory.

## Why Rust 1.86?

Rust 1.87+ generates WASM with features (`multivalue`) that the NEAR VM in neard does not support yet. `cargo-near` enforces this and will refuse to build with newer toolchains. See: https://github.com/near/near-workspaces-js/issues/225
