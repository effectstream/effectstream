# @effectstream/npm-midnight-proof-server

NPM wrapper around the Midnight proof-server binary. Installs a pinned
version into `node_modules/.bin/npm-midnight-proof-server` so the
EffectStream orchestrator can boot the proving sidecar that the
Midnight node depends on.

- Pinned Midnight proof-server sidecar (`9.0.0-rc.5` by default; `MIDNIGHT_PROOF_SERVER_VERSION` selects another).
- Native targets are `macos-arm64` and `linux-amd64`; no Linux arm64 asset is published.
- Port selectable with `--port` / `MIDNIGHT_PROOF_SERVER_PORT`, so two versions can run side by side.
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

## Versions and ports

```bash
# Default: 9.0.0-rc.5 on port 6300 (binary on macos-arm64 / linux-amd64)
bunx npm-midnight-proof-server

# A second prover beside it, e.g. 9.0.0-rc.8 for compactc 0.35.0 contracts
MIDNIGHT_PROOF_SERVER_VERSION=9.0.0-rc.8 bunx npm-midnight-proof-server --docker --port 6301
```

- `MIDNIGHT_PROOF_SERVER_VERSION` (default `9.0.0-rc.5`) picks the version.
  Downloaded binaries are cached per version in `proof-server/<version>/`.
- Binary mode needs a published asset in `effectstream/binaries` release
  `0.3.120`, which has `9.0.0-rc.5` only. Any other version fails in
  `--binary` mode with an explicit "no binary" error; automatic mode then
  falls back to Docker (`midnightntwrk/proof-server:<version>`).
- `--port <n>` / `-p <n>` / `MIDNIGHT_PROOF_SERVER_PORT` (default `6300`)
  picks the host port. In Docker mode the default port keeps the container
  name `midnight-proof-server`; any other port uses
  `midnight-proof-server-<port>`. Reusing a container that was created from
  another version fails on a non-default port (a warning on 6300).
- A contract prover that is already running elsewhere (for example a Compose
  sibling) needs no launch: point the client at it with
  `MIDNIGHT_CONTRACT_PROOF_SERVER_URL` (see `@effectstream/midnight-contracts`).

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
