# @effectstream/solana-node

NPM wrapper around [`solana-test-validator`](https://docs.anza.xyz/cli/examples/test-validator)
from an [Agave](https://github.com/anza-xyz/agave) release - a single-node Solana
cluster for local development. Downloads a pinned build into
`vendor/bin/solana-test-validator` on first use so the orchestrator can boot it
without each developer installing the Solana CLI.

- Pinned Agave release (3.0.14), verified by SHA-256 before it is ever executed.
- Exposes a `solana-node` bin plus a programmatic `run()`.
- Consumed by `@effectstream/sync`'s `SolanaFetcher` via JSON-RPC on `:8899`.
- Used by the orchestrator's `launchSolana` step for end-to-end local testing.
- The same archive also provides `cargo-build-sbf`, which the `solana-starter`
  template uses to compile its Rust program.

## Install

```bash
bun add @effectstream/solana-node
```

The pinned archive is downloaded on first run (not at install time) for the
current OS/arch.

## Standalone usage

```bash
bun ./node_modules/.bin/solana-node            # boot the validator
bun ./node_modules/.bin/solana-node --verbose  # stream validator output
```

Programmatically:

```ts
import { run } from "@effectstream/solana-node";

const validator = await run({
  rpcPort: 8899,
  faucetPort: 9900,
  reset: true,
  // bindAddress: "127.0.0.1",
  // dataDir: "/tmp/my-ledger",
  // verbose: false,
});

// … use http://127.0.0.1:8899 …
validator.stop();
```

On non-zero exit the wrapper prints the last 40 lines of the validator's output.
That matters because the validator reports most startup failures on **stdout**,
and deeper detail goes only to `<ledger>/validator.log`.

## Integrity

`bin-wrapper` has no checksum support and discards the archive after extracting,
so this package hashes the **extracted binary** and refuses to run anything that
isn't one of the pinned official builds. Set `SOLANA_NODE_SKIP_CHECKSUM=1` to
bypass when deliberately testing a locally-built validator.

Regenerate the digests whenever the pinned version changes:

```bash
shasum -a 256 packages/binaries/solana-node/vendor/bin/solana-test-validator
```

## Networking

RPC and gossip bind `127.0.0.1` by default — the validator has no
authentication, so exposing it broadly is a hazard on a shared network.
Override with `SOLANA_BIND_ADDRESS` (or the `bindAddress` option) for container
setups that need external reachability.

The **faucet ignores this** and always listens on all interfaces; Agave offers no
flag to restrict it, only the `--faucet-per-request-sol-cap` /
`--faucet-per-time-sol-cap` rate limits. It hands out worthless localnet SOL, but
don't run this on an untrusted network.

## Platform support

| Platform | Supported |
| :--- | :---: |
| linux x64 | ✅ |
| darwin x64 | ✅ |
| darwin arm64 | ✅ |
| linux arm64 | ❌ |

Upstream publishes no `aarch64-unknown-linux-gnu` build, so ARM64 Linux has no
binary to download.

## ⚠️ Version pin: do not bump past Agave 3.0.x

Pinned to **3.0.14** deliberately. Agave ≥ 3.1 hard-asserts io_uring support on
Linux and panics during init where it is unavailable:

```
[INFO agave_io_uring] io_uring NOT supported: Function not implemented (os error 38)
thread 'main' panicked at fs/src/dirs.rs:27:9:
assertion failed: io_uring_supported()
```

Docker's default seccomp profile blocks the io_uring syscalls, and the whole e2e
suite runs containerized — so 3.1+ cannot start in CI as configured. macOS builds
don't compile the assert in at all, which means a newer version looks fine
locally and then fails in CI.

Verified: `4.1.2` ✗ · `4.0.3` ✗ · `3.1.14` ✗ · `3.0.14` ✓ · `2.3.13` ✓

This is a CI-configuration constraint, not an upstream dead end — on a kernel
that supports io_uring the block is purely seccomp. See the note in `index.js`
for the path to running a current release.
