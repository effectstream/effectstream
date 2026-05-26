---
title: "@effectstream/ord"
description: "Ord binary wrapper for EffectStream"
sidebar_label: "ord"
---

<!-- Generated from packages/binaries/ord/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. -->

> Package: **[`@effectstream/ord`](https://www.npmjs.com/package/@effectstream/ord)** · [Source](https://github.com/PaimaStudios/paima-engine/tree/main/packages/binaries/ord)

A pinned [`ord`](https://github.com/ordinals/ord) binary, packaged for
npm. Installing this drops a versioned `ord` CLI into
`node_modules/.bin` for EffectStream's Bitcoin / Ordinals dev workflows.

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
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/binaries/ord
- Upstream `ord`: https://github.com/ordinals/ord
