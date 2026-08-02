# @effectstream/ord

A pinned [`ord`](https://github.com/ordinals/ord) binary, packaged for
npm. Installing this drops a versioned `ord` CLI into
`node_modules/.bin` for EffectStream's Bitcoin / Ordinals dev workflows.

- Pinned `ord` CLI (v0.23.3) for Bitcoin / Ordinals dev workflows.
- Pairs with `@effectstream/bitcoin-core` for an `ord`-indexed view of local regtest.
- Prebuilt binaries: Linux x64, macOS arm64, macOS x64. Upstream publishes no Linux arm64 build.
- Used by Ordinals-aware templates and E2E tests.

## Install

```bash
bun add @effectstream/ord
# or
npm install @effectstream/ord
```

## Standalone usage

Once installed:

```bash
# Inspect an inscription via the bundled binary
bunx ord --regtest server --help

# Or invoke through this package
bun run --bun @effectstream/ord/start -- --regtest server
```

The package downloads the pinned tarball for your platform on first
invocation.

## Inside EffectStream

The Bitcoin orchestrator step pairs this with `@effectstream/bitcoin-core`
to expose an `ord`-indexed view of the local regtest chain, used by
Ordinals-aware templates and E2E tests.

## Links

- Docs: https://effectstream.github.io/docs/packages/binaries/ord
- Source: https://github.com/effectstream/effectstream/tree/main/packages/binaries/ord
- Upstream `ord`: https://github.com/ordinals/ord
