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
  // limitLedgerSize: 5_000_000, // see "Ledger size" below
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

Digests live in `checksums.js` and the check itself is
`@effectstream/binary-checksum`, shared with the other verified wrappers.

These three digests are **self-recorded**: they were hashed from a download on a
maintainer's machine, which pins the artifact against later mutation but does not
attest that it was correct to begin with. Regenerating them through
`scripts/generate-binary-checksums.ts`, so an Agave-published checksum backs them
the way bitcoin-core and the Grafana wrappers now are, is open work.

## Ledger size

The validator keeps a limited number of **data shreds** in rooted slots
(`--limit-ledger-size`) and deletes older slots. The default in Agave 3.0.14 is
**10,000 shreds**, which is small for anything that indexes the chain. Measured
on an idle 3.0.14 validator:

- It writes roughly 100 data shreds per slot: about 0.25 MB of ledger per slot
  with the coding shreds, so about 2 GB per hour.
- The cleanup counts shreds with RocksDB's estimate, which only moves when the
  shred memtable is flushed (every 256 MiB, about 2,200 idle slots). The first
  purge therefore comes at the first check after that flush, roughly 2,700 to
  3,200 slots (20 to 25 minutes) after the start, whatever the limit. Later
  checks run about every 512 slots.
- With the default limit, each purge leaves only a few dozen slots. Anything
  that reads older slots then fails with `Block N cleaned up, does not exist on
  node`: a sync that trails the tip by its confirmation depth, or a re-sync from
  an earlier start slot.

So the limit sets roughly how many slots survive: about `limit / 100` on an idle
validator, fewer with traffic. For example, 5,000,000 keeps about 50,000 slots
(5 to 6 hours, about 12 GB of shreds), and 50,000,000 keeps about two days
(about 120 GB). Pick the smallest value that covers the history your stack has
to read again.

```ts
await run({ limitLedgerSize: 5_000_000 });
```

Or set `SOLANA_LIMIT_LEDGER_SIZE=5000000` in the environment of the process that
calls `run()` (a `chain:start` script, the orchestrator, the `solana-node` bin).
The option wins over the variable. The value must be a positive integer; anything
else is refused before the validator is downloaded or started. Unset, no flag is
passed and the validator keeps its default.

## Networking

The validator has no authentication. `bindAddress` (default `127.0.0.1`,
override with `SOLANA_BIND_ADDRESS`) is passed as `--bind-address`, which in
Agave 3.0.14 binds the validator's own ports (gossip, TPU and the rest) only.

**The JSON-RPC and the faucet listen on all interfaces** whatever
`--bind-address` says: measured on 3.0.14, both are on `0.0.0.0`, and the RPC
answers on the machine's other addresses. 3.0.14 offers no flag to bind them
elsewhere; the faucet has only the `--faucet-per-request-sol-cap` /
`--faucet-per-time-sol-cap` rate limits. The SOL and state are worthless
localnet ones, but anyone who can reach the machine can use the RPC and the
faucet, so don't run this on an untrusted network. In a container, the RPC is
therefore reachable from other containers with the default bind.

`SOLANA_BIND_ADDRESS=0.0.0.0` makes 3.0.14 panic at start
(`UnspecifiedIpAddr(0.0.0.0)`). If gossip must be reachable from outside a
container, pass the container's own IP (`hostname -i`) instead.

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
