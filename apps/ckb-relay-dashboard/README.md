# CKB Relay Dashboard

Read only local observability for persisted CKB relay intents and the EffectStream trusted relay worker. The feed reads `effectstream.ckb_evm_relay_outbox`; it does not claim to show every CKB observation. The dashboard never signs or submits transactions.

## Live local acceptance demonstration

The repository now includes a reproducible local run that starts a disposable PostgreSQL cluster, isolated OffCKB devnet, EffectStream EVM E2E runtime and relay worker, and the dashboard. EffectStream and the dashboard use the same PostgreSQL database. It sends a real transfer on the local CKB devnet and checks the resulting outbox records against Hardhat receipts and contract storage, then verifies dashboard API/UI data and dashboard/worker restarts.

Requirements:

- Bun 1.4.0 (the version pinned in CI) and root dependencies installed with `bun install --frozen-lockfile`.
- Dashboard runtime dependency installed separately because `apps/` is not part of the root Bun workspace:

  ```sh
  cd apps/ckb-relay-dashboard && bun install --no-save
  ```

- OffCKB CLI exactly `0.4.13`, with its CKB `0.208.0` binary already available in `~/.local/share/offckb-nodejs/bins/0.208.0/ckb`.
- Foundry `forge`, Google Chrome, and PostgreSQL 16, 17, or 18 binaries (`initdb`, `pg_ctl`, `pg_isready`, `psql`, `postgres`). PostgreSQL need not be running as a service. The script only starts a temporary loopback cluster.
- The ports `8114`, `28114`, `8545`, `8546`, `4747`, `9999`, `3334`, `4173`, and `55432` must be free. Preflight checks them and refuses to stop anything it did not start.

Set `REPRO_PG_BINDIR` to the PostgreSQL `bin` directory, then run from the repository root:

```sh
REPRO_PG_BINDIR=/path/to/postgresql/bin bun run e2e/evm/ckb-relay-dashboard-live.ts
```

On Linux, if PostgreSQL is installed by the OS, the directory is often `/usr/lib/postgresql/16/bin`, `/usr/lib/postgresql/17/bin`, or `/usr/lib/postgresql/18/bin`. If the binaries are in a nonstandard location, set `LD_LIBRARY_PATH` so the `postgres` executable can load its PostgreSQL libraries. The acceptance runner uses local trust authentication on its private socket and loopback-only TCP listener; it does not alter PostgreSQL system configuration or require a running database service.

The runner prints its evidence directory under `/tmp/ckb-relay-dashboard-live-*`. It retains service logs, database identity, acceptance summary, and a screenshot there after stopping only the services it started. It temporarily stages any existing Hardhat Ignition deployment records and restores them at exit. A successful summary has `result: live-local-evidence-verified`; the screenshot is `dashboard-confirmed-event.png`. The OffCKB account key is read in memory and written briefly to a mode-0600 temporary file for the CLI transfer, then removed; it is not written into the repository or logs.

## Dashboard only

To run the dashboard against an already initialized local EffectStream PostgreSQL database:

```sh
cd apps/ckb-relay-dashboard
cp .env.example .env
# Set DATABASE_URL to your local EffectStream database.
bun install
bun run start
```

It binds to `127.0.0.1:4173`. Open <http://127.0.0.1:4173>; status is available at <http://127.0.0.1:4173/api/v1/status>. The example URL is a placeholder and does not create a database or credentials.

The dashboard reads `DATABASE_URL`, `DASHBOARD_CKB_RPC_URL`, `DASHBOARD_EVM_RPC_URL`, `DASHBOARD_CKB_PROTOCOL`, and `DASHBOARD_PORT`. RPC endpoints must be unauthenticated loopback HTTP URLs. The browser receives no database URL, RPC URL, credentials, or signing key. Do not add a signing key to this app's environment.

## Data path and schema

The outbox migration is `packages/node-sdk/db/migrations/system-up-v-0.8.2.sql`, registered as system migration `0.8.2`. EffectStream applies it during runtime initialization; the dashboard does not mutate schema. The CKB fetcher and `CkbRelayPrimitive` feed `processFinalizedBlock`, which writes the source event and relay intent transactionally. The worker claims intents, submits to the configured local relay contract, and persists transaction/receipt evidence. The event ID, source JSON, retry/lease fields, transaction hash, payload hash, and receipt result are exposed by the dashboard.

The dashboard uses `DATABASE_URL`; the EffectStream runtime uses `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PW`, and `PGLITE`. Set `PGLITE=false` for a shared PostgreSQL demonstration. The live runner configures both processes to the same disposable database automatically. PostgreSQL `pg_ivm` is optional for this local E2E path: it sets `ALLOW_NO_PG_IVM=true` and uses the runtime's plain-view fallback when that extension is unavailable.

## API

- `GET /api/v1/status` — CKB RPC tip/genesis and sync cursor, EVM chain ID, PostgreSQL/outbox status, and qualified worker/runtime information.
- `GET /api/v1/events?page=1&pageSize=20&q=` — paginated persisted relay intents.
- `GET /api/v1/events/:eventId` — stored source event, outbox, and destination evidence.
- `GET /api/v1/executions/:eventId` — execution stages derived from the outbox record.

Invalid pagination/search input and malformed event IDs return `400`; unknown IDs return `404`; unavailable database queries return `503`. Missing RPC services appear unavailable. A confirmed outbox status and receipt are persisted by the worker; the dashboard does not claim source consensus finality. There is no separate durable worker heartbeat, complete observation archive, or EffectStream runtime health endpoint.

## Focused checks

```sh
bun test e2e/evm/tooling/ckb-event-relay-worker.test.ts e2e/evm/tooling/ckb-to-evm-relay.test.ts apps/ckb-relay-dashboard/src/server.test.ts
bun build apps/ckb-relay-dashboard/src/server.ts --target=bun --outdir=/tmp/ckb-relay-dashboard-build
```
