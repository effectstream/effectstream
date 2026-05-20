---
title: "@effectstream/npm-midnight-proof-server"
description: "A wrapper for the Midnight proof server binary"
sidebar_label: "midnight-proof-server"
---

<!-- Generated from packages/binaries/midnight-proof-server/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. -->

> Package: **[`@effectstream/npm-midnight-proof-server`](https://www.npmjs.com/package/@effectstream/npm-midnight-proof-server)** · [Source](https://github.com/effectstream/effectstream/tree/main/packages/binaries/midnight-proof-server)

NPM wrapper around the Midnight proof-server binary. Installs a pinned
version into `node_modules/.bin/npm-midnight-proof-server` so the
EffectStream orchestrator can boot the proving sidecar that the
Midnight node depends on.

- Pinned Midnight proof-server sidecar.
- Boots alongside `@effectstream/npm-midnight-node`; no app-code import needed.
- Cache management via `--clean-binaries` / `--only-clean`.
- Required by ZK-heavy Midnight templates.

## Install

```bash
bun add @effectstream/npm-midnight-proof-server
# or
npm install @effectstream/npm-midnight-proof-server
```

## Standalone usage

```bash
# Start the proof server (downloads the binary on first run)
bunx npm-midnight-proof-server

# Clean / re-download the cached binary
bunx npm-midnight-proof-server --clean-binaries
bunx npm-midnight-proof-server --only-clean
```

## Inside EffectStream

The orchestrator's Midnight step starts the proof server together with
`@effectstream/npm-midnight-node`. ZK-heavy templates and tests rely on
it implicitly — you don't import this package from app code, you just
add it to the orchestrator's dependency graph (which the templates
already do).

## Links

- Docs: https://effectstream.github.io/docs/packages/binaries/midnight-proof-server
- Source: https://github.com/effectstream/effectstream/tree/main/packages/binaries/midnight-proof-server
- Upstream Midnight: https://midnight.network/
