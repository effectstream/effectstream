# @effectstream/npm-midnight-indexer

NPM wrapper that runs the [Midnight](https://midnight.network) Indexer either as a Docker container or as a native binary. Boots alongside `@effectstream/npm-midnight-node` and `@effectstream/npm-midnight-proof-server` to give Effectstream a local indexer to consume.

- Pinned Midnight indexer `4.4.0-rc.1`.
- Native targets are `macos-arm64` and `linux-amd64`; no Linux arm64 asset is published.
- Docker or binary mode, with platform-aware defaults (macOS arm64 and Linux can use either; Windows is Docker-only).
- One env var to set: `APP__INFRA__SECRET`, as a hex-encoded 32-byte value (64 hex characters). Everything else has a default that works against the local Midnight stack.
- Used by the orchestrator's Midnight step; sits in front of `MidnightFetcher` on the sync side.
- Maps port 8088 (Docker) or runs on localhost (binary) so the rest of the local stack reaches it the same way.

## Bundled compatibility

The machine-readable [`compatibility.json`](./compatibility.json) is the source
of truth used by startup and timeout diagnostics:

| Component         | Bundled version |
| ----------------- | --------------- |
| Midnight node     | `2.0.0-rc.4`    |
| Ledger generation | 9               |
| Midnight indexer  | `4.4.0-rc.1`    |

Cached node state must come from the same Ledger generation. The proof server
is deliberately excluded from this cached-chain tuple because there is no
evidence that it owns compatible chain state.

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

| Variable                        | Required | Docker default             | Binary default          | Purpose                             |
| ------------------------------- | -------- | -------------------------- | ----------------------- | ----------------------------------- |
| `APP__INFRA__SECRET`            | yes      | -                          | -                       | Hex-encoded 32-byte indexer secret. |
| `LEDGER_NETWORK_ID`             | no       | `Undeployed`               | `Undeployed`            | Ledger network selector.            |
| `SUBSTRATE_NODE_WS_URL`         | no       | `ws://node:9944`           | `ws://localhost:9944`   | Substrate node WS.                  |
| `FEATURES_WALLET_ENABLED`       | no       | `true`                     | `true`                  | Wallet features.                    |
| `APP__INFRA__PROOF_SERVER__URL` | no       | `http://proof-server:6300` | `http://localhost:6300` | Proof server.                       |
| `APP__INFRA__NODE__URL`         | no       | `ws://node:9944`           | `ws://localhost:9944`   | Node URL.                           |

### Path resolution

`CONFIG_FILE` and `infra.storage.cnn_url` are both resolved relative to the process's current working directory when they are not absolute. Prefer absolute paths if your launch script's CWD is non-obvious. In binary mode this package sets the CWD to the bundled `indexer-standalone` folder, so a default `cnn_url: "./indexer.sqlite"` lands next to the binary. In Docker mode the image's `WORKDIR` is `/opt/indexer-standalone`; bind-mount accordingly.

### Supported binary platforms

Linux amd64 and macOS arm64.

## Inside Effectstream

The orchestrator's Midnight step starts this indexer behind `@effectstream/npm-midnight-node` + proof server. The runtime's `@effectstream/sync` `MidnightFetcher` queries it. You usually don't invoke this package by hand; you add it to your orchestrator config and the rest happens automatically.

The native wrapper now waits for the indexer child and preserves its nonzero
exit code. The orchestrator probes indexer TCP readiness directly with a
60-second default bound. Templates still pinned to orchestrator `0.200.1`
retain a backwards-compatible, bounded `midnight-indexer:wait` script until
their package pins advance; the new launcher does not delegate to that script.

## Breaking lifecycle change and rollout order

> **Breaking:** the CLI now remains attached to its native child and returns
> the child's nonzero/signal result. Callers that previously treated wrapper
> launch as immediate success must handle the service lifecycle result.

Land the owned-process shutdown work from PR A before rolling out this change.
PR A's ownership-safe termination semantics are operationally required before
a newly observable node or indexer failure can trigger orchestrator shutdown.

## Troubleshooting

A few common failures and where to look:

- `Docker is not installed or not available` - install Docker Desktop / Engine and confirm `docker --version` from the same shell.
- `APP__INFRA__SECRET environment variable is required` - required for both modes; export it or pass inline.
- `Failed to start midnight-indexer` - check that ports 8088, 6300, and 9944 are free and that the Midnight node is reachable.
- `unknown readiness failure` - inspect `logs/midnight-indexer.log` and
  `logs/midnight-node.log`. A TCP listener alone does not prove that the node is
  usable: both a fresh chain before block one and an indexer connected to a
  failed node can open port 8088.
- A node log containing the exact missing
  `ext_ledger_8_bridge_construct_distribute_treasury_system_tx_version_1`
  import is the verified incompatible Ledger-8-cache signal for this tuple.
  Without that exact signal, stale state is only one possible cause.
- Under the new Effectstream launcher, the node wrapper reads this package's
  compatibility declaration, observes the real node output, and propagates the
  child exit. It emits the incompatible-cache label only after seeing that
  exact signal; a successful indexer TCP connection cannot override the node
  failure.
- Indexer `--clean` removes only its SQLite data; it does not reset node chain
  state. Under the Effectstream orchestrator, node state is kept at
  `packages/contracts-midnight/node_modules/.cache/effectstream/midnight-node`.
  Stop the stack first, then archive or remove only that project-local
  directory if you choose to reset it. Startup never deletes it automatically.

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
