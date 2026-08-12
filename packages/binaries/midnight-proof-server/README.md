# @effectstream/npm-midnight-proof-server

NPM wrapper around the Midnight proof-server binary. Installs a pinned
version into `node_modules/.bin/npm-midnight-proof-server` so the
EffectStream orchestrator can boot the proving sidecar that the
Midnight node depends on.

- Pinned Midnight proof-server sidecar (ledger-8.1.0).
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

### Shared release-image cache

With `EFFECTSTREAM_BINARY_CACHE_DIR` set, ledger 8.1.0 on Linux amd64 resolves
from:

```text
<cache>/midnight-proof-server/ledger-8.1.0/linux-amd64/bin/midnight-proof-server
```

Use `--download-only`, `--verify`, or `--path` for image preparation and
diagnostics. `EFFECTSTREAM_OFFLINE=1` fails immediately when the verified native
payload is unavailable and never uses the mutable Docker fallback. Writable
proof-server state is kept below `EFFECTSTREAM_RUNTIME_DIR`.

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
