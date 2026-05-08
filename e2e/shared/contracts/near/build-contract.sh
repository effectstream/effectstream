#!/usr/bin/env bash
set -euo pipefail

# Builds test_event_contract.wasm from test_event_contract.rs
# See BUILD.md for prerequisites (Rust 1.86, cargo-near, wasm32 target)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

cat > "$TMP_DIR/Cargo.toml" << 'EOF'
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
EOF

mkdir -p "$TMP_DIR/src"
cp "$SCRIPT_DIR/test_event_contract.rs" "$TMP_DIR/src/lib.rs"

cd "$TMP_DIR"
rustup override set 1.86.0
cargo near build non-reproducible-wasm

cp "$TMP_DIR/target/near/test_event_contract.wasm" "$SCRIPT_DIR/test_event_contract.wasm"
echo "Built: $SCRIPT_DIR/test_event_contract.wasm ($(wc -c < "$SCRIPT_DIR/test_event_contract.wasm") bytes)"
