# @effectstream/npm-avail-node

NPM wrapper around the [Avail](https://www.availproject.org/) node
binary. Installs a pinned version into `node_modules/.bin/npm-avail-node`
so the EffectStream orchestrator can run a local Avail node without each
developer compiling or downloading it manually.

- Pinned Avail node binary, dropped into `node_modules/.bin/`.
- Spins up a local dev node with `--dev` in one command.
- Paired with `@effectstream/npm-avail-light-client` for full local Avail-DA.
- Template: [`templates/avail/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates/avail).

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
client. Templates and E2E suites that consume Avail data — see
[`templates/avail/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates/avail)
— rely on it as their local source of truth.

## Links

- Docs: https://effectstream.github.io/docs/packages/binaries/avail-node
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/binaries/avail-node
- Upstream Avail Node: https://github.com/availproject/avail
