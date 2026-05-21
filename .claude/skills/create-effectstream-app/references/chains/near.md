# NEAR

`packages/contracts-near/` — Rust → WASM compiled contracts, deployed to a local NEAR sandbox.

> **See also (concept docs).**
> - **Note: docs are missing a top-level NEAR chain page** (`docs/site/docs/home/200-chains/` has no NEAR entry). Until one exists, this file is the primary reference.
> - Per-binary: `docs/site/docs/home/500-packages/540-binaries/near-sandbox.md`
> - NEAR primitives (NEP-141, NEP-171, NEP-245, intent, generic, account-watch): `docs/site/docs/home/100-components/118-primitives.md`

## Tools (probe before scaffolding)

| Tool | Required for | If missing |
|---|---|---|
| `bun` | All Effectstream work | Stop — install Bun before continuing. |
| Rust toolchain (`cargo`, `rustup target add wasm32-unknown-unknown`) | Compiling NEAR contracts to WASM | Stop and tell the user — without it, `bun run build:near` (or equivalent) can't produce the contract artifacts the sync node and tests depend on. |

The NEAR sandbox binary is vendored through `@effectstream/npm-near-sandbox` (no system install needed).

## Local dev environment

`launchNear` starts a NEAR sandbox node and exposes its RPC for the sync node to poll.

## Required `launchNear` package scripts

- `chain:start` — start the NEAR sandbox
- `chain:wait` — wait until RPC is responsive

## Sync protocol + primitives

Sync protocol: `NEAR_RPC_PARALLEL`.

| Primitive | Grammar | Use |
|---|---|---|
| `PrimitiveTypeNEARNEP141` | `builtinGrammars.nearNep141` | Fungible tokens |
| `PrimitiveTypeNEARNEP171` | `builtinGrammars.nearNep171` | NFTs |
| `PrimitiveTypeNEARNEP245` | `builtinGrammars.nearNep245` | Multi-tokens |
| `PrimitiveTypeNEARIntent` | `builtinGrammars.nearIntent` | DIP-4 intents |
| `PrimitiveTypeNEARGeneric` | `builtinGrammars.nearGeneric` | NEP-297 generic events |
| `PrimitiveTypeNEARAccountWatch` | `builtinGrammars.nearAccountWatch` | Function call tracking |

## Batcher adapters

| Adapter | Batching criteria |
|---|---|
| `NearAdapter` | time, size |
| `NearIntentAdapter` | time, size — for DIP-4 intents |

## Orchestrator wiring

```ts
...launchNear("@my-template/contracts-near", {
  cwd: path.join(root, "packages/contracts-near"),
}),

{
  name: "sync",
  dependsOn: [DbNames.PGLITE_WAIT, NearNames.SANDBOX_WAIT],
  // ...
},
```

The launcher exports `NearNames.SANDBOX` and `NearNames.SANDBOX_WAIT`. Older skill versions wrote `NearNames.CHAIN_WAIT` — that constant does NOT exist; using it produces a `ReferenceError` at startup.

## Sharp edges

### `stateMachinePrefix` MUST be set alongside `scheduledPrefix`

See `references/grammar-stm.md` § "Silent killer: `stateMachinePrefix` vs `scheduledPrefix`". This affects every chain's primitive config, but NEAR is where it was first surfaced because NEP-141 has no auto-IVM table that a template author would notice missing.

### Sync from genesis is slow — pin `startBlockHeight` to current tip

By the time tests start, `near-sandbox` is already at block 300+. Setting `startBlockHeight: 1` makes the sync take ~3-5 min to catch up before it can see live test transfers. Read the sandbox tip at config-build time and use `currentTip - 5`:

```ts
async function nearTip(): Promise<number> {
  const res = await fetch("http://localhost:3030", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "status", params: [] }),
  });
  return (await res.json()).result?.sync_info?.latest_block_height ?? 1;
}

const startBlockHeight = Math.max(1, (await nearTip()) - 5);
// ... pass to addPrimitive
```

### `cargo build` produces a WASM nearcore rejects — use `cargo near build`

The naive `cargo build --target wasm32-unknown-unknown --release` produces a WASM that loads in Wasmtime but nearcore's VM rejects with:

```
Failed to prepare WASM because of 'Deserialization'
```

The fix is to use `cargo-near` instead — it applies NEAR-specific section ordering and exports:

```sh
cargo near build non-reproducible-wasm
```

Wire it into a `build:contract` shell script and call from `packages/contracts-near/package.json`:

```json
"scripts": {
  "build:contract": "./build-contract.sh"
}
```

```bash
# build-contract.sh
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/contract"
cargo near build non-reproducible-wasm
```

`cargo-near` itself is a separate install (`cargo install cargo-near` or via prebuilt binary). Worth noting in the Tools probe above.

### Pin the Rust toolchain to ≤1.86 with `rust-toolchain.toml`

nearcore's VM rejects WASM compiled with rustc 1.87+ (the system default on a current macOS is 1.90). Ship a `rust-toolchain.toml` in the contract directory:

```toml
# packages/contracts-near/contract/rust-toolchain.toml
[toolchain]
channel = "1.86.0"
components = ["rustfmt", "clippy"]
targets = ["wasm32-unknown-unknown"]
```

Without this, the first `cargo near build` either silently produces a WASM that deploys-then-fails-at-runtime, or rustup refuses with a "wrong toolchain" error from cargo-near. Both fail-mode look unrelated to the actual cause.

### `Account.callFunction<T>()` returns the parsed result, not the RPC response

In `near-api-js` v7, `Account.callFunction<T>()` returns the *parsed contract return value* — for `ft_transfer` (which returns `void`), that's `null`. Trying to read `result.transaction.hash` always gets `undefined`.

To get the raw RPC response (with `transaction.hash`), use `callFunctionRaw`:

```ts
const raw = await account.callFunctionRaw({
  contractId: FT_CONTRACT_ACCOUNT,
  methodName: "ft_transfer",
  args: { receiver_id, amount, memo },
  gas: 30_000_000_000_000n,
  attachedDeposit: 1n, // NEP-141 requires exactly 1 yoctoNEAR
});
const txHash = raw.transaction.hash;
```

The engine's own `e2e/shared/contracts/near/deploy-and-call.ts` uses `callFunction` and gets away with it because it never reads the hash; templates that need the hash for assertion or DB rows must use `callFunctionRaw`.

### `near-sdk` needs the `"legacy"` feature for `LookupMap`

In `Cargo.toml`:

```toml
[dependencies]
near-sdk = { version = "=5.5.0", features = ["legacy"] }
```

Without `"legacy"`, the old `near_sdk::collections::LookupMap` path is gone — the new path is `near_sdk::store::IterableMap`. Existing examples that use `LookupMap` won't compile.

### `cargo-near` ABI requires `JsonSchema` on returned structs

For ABI generation to work, structs returned by `#[near]`-methods must derive `JsonSchema`. Cleanest spelling:

```rust
#[near(serializers = [json])]
pub struct FtMetadata { ... }
```

This avoids pulling in `schemars` as an extra dep.

### NEP-141 primitive doesn't surface `tx_hash` in the STM data

`Nep141Primitive.getPayload()` extracts `{ from, to, amount }` but doesn't thread the originating receipt's `transactionHash` into the per-input data field, even though it IS available upstream in `primitiveTransactionData.syncProtocol.transactionHash`. If you need `tx_hash` in your user table, you either (a) write a custom subclass, or (b) leave the column empty and document it. The engine's own primitives have this same limitation across most chains — relying on `tx_hash` from chain primitives is unsafe in general.

## Frontend / wallet integration

NEAR has a mature browser-wallet story (NEAR Wallet, MyNearWallet, Meteor, Sender, etc.). The skill doesn't have an opinionated frontend pattern for NEAR yet — when scaffolding one, model it on the Cardano browser-wallet pattern in `references/frontend.md` (Fastify proxies + direct on-chain submission from the browser) rather than the EVM batcher pattern, since NEAR's gas model usually doesn't need batching.
