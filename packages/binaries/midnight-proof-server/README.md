# @effectstream/npm-midnight-proof-server

NPM wrapper around the Midnight proof-server binary. Installs a pinned
version into `node_modules/.bin/npm-midnight-proof-server` so the
EffectStream orchestrator can boot the proving sidecar that the
Midnight node depends on.

- Pinned Midnight proof-server sidecar (`9.0.0-rc.5`).
- Native targets are `macos-arm64` and `linux-amd64`; no Linux arm64 asset is published.
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
it implicitly - you don't import this package from app code, you just
add it to the orchestrator's dependency graph (which the templates
already do).

## Links

- Docs: https://effectstream.github.io/docs/packages/binaries/midnight-proof-server
- Source: https://github.com/effectstream/effectstream/tree/main/packages/binaries/midnight-proof-server
- Upstream Midnight: https://midnight.network/
