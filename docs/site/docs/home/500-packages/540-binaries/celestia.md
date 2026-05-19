---
title: "@effectstream/celestia"
description: "Celestia binary wrapper for EffectStream"
sidebar_label: "celestia"
---

<!-- Generated from packages/binaries/celestia/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. -->

> Package: **[`@effectstream/celestia`](https://www.npmjs.com/package/@effectstream/celestia)** · [Source](https://github.com/PaimaStudios/paima-engine/tree/main/packages/binaries/celestia)

NPM wrapper around the [Celestia](https://celestia.org/) node binaries.
Installs a pinned version into `node_modules/.bin/celestia` so the
EffectStream orchestrator can boot a local Celestia DA layer
(node + bridge) for development and testing.

- Pinned Celestia node + bridge binaries.
- Ships `start-node` and `start-bridge` convenience scripts.
- Consumed by `@effectstream/sync`'s `CelestiaFetcher`.
- E2E: [`e2e/celestia/`](https://github.com/effectstream/effectstream/tree/main/e2e/celestia).

## Install

```bash
bun add @effectstream/celestia
# or
npm install @effectstream/celestia
```

## Standalone usage

The package ships two convenience scripts (`start-node` and
`start-bridge`) plus a raw `celestia` entrypoint:

```bash
# Run a Celestia consensus node
bunx @effectstream/celestia start-node --verbose

# Run a Celestia bridge node (against a running consensus node)
bunx @effectstream/celestia start-bridge --verbose

# Or pass arbitrary args
bunx celestia <celestia-cli args>
```

On install, the package fetches the pinned binary for your OS/arch.

## Inside EffectStream

The orchestrator's Celestia step uses `start-node` to bring up a local
chain, and the EffectStream runtime consumes it through
`@effectstream/sync`'s `CelestiaFetcher`/`CelestiaSyncState`. See the
[`e2e/celestia/`](https://github.com/effectstream/effectstream/tree/main/e2e/celestia)
suite.

## Links

- Docs: https://effectstream.github.io/docs/packages/binaries/celestia
- Source: https://github.com/effectstream/effectstream/tree/main/packages/binaries/celestia
- Upstream Celestia: https://github.com/celestiaorg/celestia-node
