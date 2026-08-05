---
title: "@effectstream/npm-avail-node"
description: "A wrapper for the Avail node binary"
sidebar_label: "avail-node"
---

<!-- Generated from packages/binaries/avail-node/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. -->

> Package: **[`@effectstream/npm-avail-node`](https://www.npmjs.com/package/@effectstream/npm-avail-node)** · [Source](https://github.com/effectstream/effectstream/tree/main/packages/binaries/avail-node)

NPM wrapper around the [Avail](https://www.availproject.org/) node
binary. Installs a pinned version into `node_modules/.bin/npm-avail-node`
so the EffectStream orchestrator can run a local Avail node without each
developer compiling or downloading it manually.

- Pinned Avail node binary (v2.3.0.1-rc1), dropped into `node_modules/.bin/`.
- Spins up a local dev node with `--dev` in one command.
- Paired with `@effectstream/npm-avail-light-client` for full local Avail-DA.
- Exercised by the [`e2e/avail/`](https://github.com/effectstream/effectstream/tree/main/e2e/avail) suite.

## Install

```bash
bun add @effectstream/npm-avail-node
# or
npm install @effectstream/npm-avail-node
```

The package downloads the pinned tarball for your platform on install.

## Standalone usage

```bash
# Spin up a local dev node
bunx npm-avail-node --dev

# Or invoke through this package
bun run --bun @effectstream/npm-avail-node/start -- --dev
```

Pair with [`@effectstream/npm-avail-light-client`](https://www.npmjs.com/package/@effectstream/npm-avail-light-client)
for the full local Avail-DA setup.

## Inside EffectStream

The orchestrator's Avail step starts this node alongside the light
client. The Avail E2E suite at
[`e2e/avail/`](https://github.com/effectstream/effectstream/tree/main/e2e/avail)
exercises this binary as the local source of truth for Avail-DA data.

## Links

- Docs: https://effectstream.github.io/docs/packages/binaries/avail-node
- Source: https://github.com/effectstream/effectstream/tree/main/packages/binaries/avail-node
- Upstream Avail Node: https://github.com/availproject/avail
