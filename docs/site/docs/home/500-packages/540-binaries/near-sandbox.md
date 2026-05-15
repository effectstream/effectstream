---
title: "@effectstream/near-sandbox"
description: "NEAR sandbox binary wrapper for EffectStream"
sidebar_label: "near-sandbox"
---

<!-- Generated from packages/binaries/near-sandbox/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. -->

> Package: **[`@effectstream/near-sandbox`](https://www.npmjs.com/package/@effectstream/near-sandbox)** · [Source](https://github.com/PaimaStudios/paima-engine/tree/main/packages/binaries/near-sandbox)

NPM wrapper around the
[NEAR sandbox](https://github.com/near/sandbox) binary — a single-node
NEAR chain for local development. Installs a pinned version into
`node_modules/.bin/near-sandbox` so the orchestrator can boot it
without each developer fetching it separately.

## Install

```bash
bun add @effectstream/near-sandbox
# or
npm install @effectstream/near-sandbox
```

The package downloads the pinned tarball for your OS/arch on install.

## Standalone usage

```bash
# Initialise + start a local NEAR sandbox
bunx near-sandbox init
bunx near-sandbox run

# Or invoke through this package
bun run --bun @effectstream/near-sandbox/start -- run
```

## Inside EffectStream

The orchestrator's NEAR step starts the sandbox alongside the
EffectStream sync layer so the
[`templates/near/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates/near)
template runs end-to-end locally. On the runtime side,
`@effectstream/sync`'s `NearFetcher` consumes the sandbox's RPC.

## Links

- Docs: https://effectstream.github.io/docs/packages/binaries/near-sandbox
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/binaries/near-sandbox
- Upstream NEAR sandbox: https://github.com/near/sandbox
