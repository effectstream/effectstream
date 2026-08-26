# @effectstream/npm-midnight-indexer

NPM wrapper that runs the [Midnight](https://midnight.network) Indexer either as a Docker container or as a native binary. Boots alongside `@effectstream/npm-midnight-node` and `@effectstream/npm-midnight-proof-server` to give Effectstream a local indexer to consume.

- Pinned Midnight indexer `4.4.0-rc.1`.
- Native targets are `macos-arm64` and `linux-amd64`; no Linux arm64 asset is published.
- Docker or binary mode, with platform-aware defaults (macOS arm64 and Linux can use either; Windows is Docker-only).
- One env var to set: `APP__INFRA__SECRET`, as a hex-encoded 32-byte value (64 hex characters). Everything else has a default that works against the local Midnight stack.
- Used by the orchestrator's Midnight step; sits in front of `MidnightFetcher` on the sync side.
- Maps port 8088 (Docker) or runs on localhost (binary) so the rest of the local stack reaches it the same way.

## Install

```bash
bun add @effectstream/npm-midnight-indexer
# or
npm install @effectstream/npm-midnight-indexer
```

Requires a running Midnight node (`@effectstream/npm-midnight-node`) and proof server (`@effectstream/npm-midnight-proof-server`) on their standard ports, or set the override env vars below.

## Standalone usage

Pick a mode and pass `APP__INFRA__SECRET`. Without a flag, the wrapper prompts interactively.

```bash
# Docker (recommended where available)
APP__INFRA__SECRET=<64-hex-characters> bunx npm-midnight-indexer --docker

# Native binary (Linux, macOS arm64)
APP__INFRA__SECRET=<64-hex-characters> bunx npm-midnight-indexer --binary

# Interactive: prompts for Docker vs binary
APP__INFRA__SECRET=<64-hex-characters> bunx npm-midnight-indexer

# Help
bunx npm-midnight-indexer --help
```

The Docker path pulls `midnightntwrk/indexer-standalone` and maps container port 8088 to host 8088. The binary path downloads a platform-specific binary on first run and points at localhost services.

### Environment variables

| Variable | Required | Docker default | Binary default | Purpose |
| --- | --- | --- | --- | --- |
| `APP__INFRA__SECRET` | yes | - | - | Hex-encoded 32-byte indexer secret. |
| `LEDGER_NETWORK_ID` | no | `Undeployed` | `Undeployed` | Ledger network selector. |
| `SUBSTRATE_NODE_WS_URL` | no | `ws://node:9944` | `ws://localhost:9944` | Substrate node WS. |
| `FEATURES_WALLET_ENABLED` | no | `true` | `true` | Wallet features. |
| `APP__INFRA__PROOF_SERVER__URL` | no | `http://proof-server:6300` | `http://localhost:6300` | Proof server. |
| `APP__INFRA__NODE__URL` | no | `ws://node:9944` | `ws://localhost:9944` | Node URL. |

### Path resolution

`CONFIG_FILE` and `infra.storage.cnn_url` are both resolved relative to the process's current working directory when they are not absolute. Prefer absolute paths if your launch script's CWD is non-obvious. In binary mode this package sets the CWD to the bundled `indexer-standalone` folder, so a default `cnn_url: "./indexer.sqlite"` lands next to the binary. In Docker mode the image's `WORKDIR` is `/opt/indexer-standalone`; bind-mount accordingly.

### Supported binary platforms

Linux amd64 and macOS arm64.

## Inside Effectstream

The orchestrator's Midnight step starts this indexer behind `@effectstream/npm-midnight-node` + proof server. The runtime's `@effectstream/sync` `MidnightFetcher` queries it. You usually don't invoke this package by hand; you add it to your orchestrator config and the rest happens automatically.

## Troubleshooting

A few common failures and where to look:

- `Docker is not installed or not available` - install Docker Desktop / Engine and confirm `docker --version` from the same shell.
- `APP__INFRA__SECRET environment variable is required` - required for both modes; export it or pass inline.
- `Failed to start midnight-indexer` - check that ports 8088, 6300, and 9944 are free and that the Midnight node is reachable.

## Examples

End-to-end Midnight startup is exercised by the templates that target Midnight:

- [`templates/evm-midnight-v2/`](https://github.com/effectstream/effectstream/tree/main/templates/evm-midnight-v2)
- [`templates/night-bitcoin-v2/`](https://github.com/effectstream/effectstream/tree/main/templates/night-bitcoin-v2)
- [`templates/zswap-da/`](https://github.com/effectstream/effectstream/tree/main/templates/zswap-da)

## Links

- Docs: https://effectstream.github.io/docs/packages/binaries/midnight-indexer
- Source: https://github.com/effectstream/effectstream/tree/main/packages/binaries/midnight-indexer
- Midnight Network: https://midnight.network
- Indexer image: https://hub.docker.com/r/midnightntwrk/indexer-standalone

## License

ISC.
