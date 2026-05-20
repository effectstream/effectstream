# Production Deployment

The orchestrator and `main.dev.ts` flow you used in [Quickstart](../10-quickstart/10-quickstart.md) is a **development tool**. In production you run the node and batcher processes directly, point them at production-grade infra, and let a system service supervisor (systemd, container, k8s, etc.) keep them alive.

## What changes from dev to prod

| | Dev | Prod |
|---|---|---|
| Process supervisor | `@effectstream/orchestrator` (`bun cli.ts start`) | systemd / k8s / your own — **do not use the orchestrator in prod** |
| Node entrypoint | `packages/node/main.dev.ts` | `packages/node/main.mainnet.ts` |
| Batcher entrypoint | `packages/batcher/batcher.dev.ts` | `packages/batcher/batcher.mainnet.ts` |
| Config | `config.dev.ts` (PgLite, local chains) | `config.mainnet.ts` (managed PostgreSQL, real chain endpoints, deployed contract addresses) |
| Database | In-memory PgLite | Managed PostgreSQL (RDS, Cloud SQL, self-hosted, …) |
| Chain infra | Local dev nodes spun up by the orchestrator | Real RPCs / indexers / light nodes you provision |

MQTT is currently **in-process inside the node** — there is no separate broker to host. The batcher is a pure MQTT client.

## Running the processes

The templates already ship `main.mainnet.ts` and `batcher.mainnet.ts`. Run each as its own long-lived process:

```bash
bun run packages/node/main.mainnet.ts
bun run packages/batcher/batcher.mainnet.ts
```

In production both should be supervised — `systemd` is the simplest fit. Example unit for the node:

```ini
# /etc/systemd/system/effectstream-node.service
[Unit]
Description=Effectstream Node
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=effectstream
WorkingDirectory=/opt/your-app
EnvironmentFile=/opt/your-app/.env
ExecStart=/usr/local/bin/bun run packages/node/main.mainnet.ts
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Mirror this for the batcher (`effectstream-batcher.service`). Each process should run under its own systemd unit so you can restart them independently.

## Database

A managed PostgreSQL instance is the only durable storage requirement. Point `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PW` / `DB_NAME` at it via your environment file (see [Environment variables](../100-components/199-environment-variables.md)).

**Schema migrations apply automatically on node startup.** Both the engine's own `effectstream.*` tables and your app's migrations (declared in `migrationTable` and passed to `start({ migrations })`) are applied idempotently every boot — you do not run a manual migration step.

## Per-chain infrastructure you must provide

Production sync requires real network access for each chain you enable. Whatever the dev orchestrator was spinning up locally, **you are responsible for the production equivalent** — and for deploying any application-specific contracts.

### EVM (Ethereum, Arbitrum, Base, …)

- **RPC endpoint.** Use a private endpoint with adequate rate limits — Alchemy, Infura, QuickNode, or a self-hosted node. Public RPCs will not survive a sync.
- **Deploy your contracts.** If you extend `EffectstreamL2Contract` (see [105 Contracts](../100-components/105-contracts.md)) or use the launchpad / NFT-sale contracts, deploy them to the target network and put the resulting addresses in `config.mainnet.ts`.

### Midnight

- **Private indexer + proof server + Midnight node.** The `@effectstream/npm-midnight-*` packages are dev binaries; for production, run the same components as private long-lived services with their own storage and backups.
- **Deploy your Compact contracts** and update the config with the resulting addresses.

### Cardano

- **UTxO-RPC endpoint.** All Cardano primitives stream from a UTxO-RPC source. [Dolos](https://github.com/txpipe/dolos) is the recommended option for production — run a private instance. (Yaci-devkit is dev-only.)
- See [203 Cardano](../200-chains/203-cardano.md) for primitive-specific endpoint config.

### Bitcoin

- **Bitcoin Core node**, fully synced, with `txindex=1` if your primitives need historical lookups. `@effectstream/bitcoin-core` is fine for dev; in prod run a real node.
- **`ord`** in addition to Bitcoin Core if you use Inscriptions / Runes primitives.

### Avail

- **Avail full node or light client.** Use `@effectstream/npm-avail-node` (full) or `@effectstream/npm-avail-light-client` (light) as a starting point; in production run a stable long-lived instance, not the dev binary.

### Celestia

- **RPC endpoint or light node.** Either a Celestia light node you operate yourself, or an RPC from a provider you trust. See [209 Celestia](../200-chains/209-celestia.md).

### NEAR

- **NEAR RPC.** Use a private RPC (FastNEAR, Pagoda, or self-hosted). The bundled `@effectstream/near-sandbox` is dev-only.

## Observability (optional)

For long-running production nodes you'll want logs and traces shipped off the host. The repo ships `@effectstream/grafana-alloy` and `@effectstream/grafana-loki` as a reference setup — point Alloy at your Loki instance and your application logs flow through automatically. Not required, but strongly recommended.
