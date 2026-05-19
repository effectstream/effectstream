# @effectstream/near-sandbox

NPM wrapper around the
[NEAR sandbox](https://github.com/near/sandbox) binary — a single-node
NEAR chain for local development. Installs a pinned version into
`node_modules/.bin/near-sandbox` so the orchestrator can boot it
without each developer fetching it separately.

- Pinned NEAR sandbox binary, a single-node NEAR chain for local dev.
- `init` then `run`, both via `bunx`.
- Consumed by `@effectstream/sync`'s `NearFetcher`.
- Used by the orchestrator's NEAR step for end-to-end local testing.

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
EffectStream sync layer for end-to-end local testing of NEAR-side
integrations. On the runtime side, `@effectstream/sync`'s `NearFetcher`
consumes the sandbox's RPC.

## Links

- Docs: https://effectstream.github.io/docs/packages/binaries/near-sandbox
- Source: https://github.com/effectstream/effectstream/tree/main/packages/binaries/near-sandbox
- Upstream NEAR sandbox: https://github.com/near/sandbox
