# Environment Variables

Environment variables are a powerful way to configure your EffectStream node.  
They are used to configure the different components of your node, such as the blockchains, databases, and services.
Setting them allows to have different runtime scripts for different environments.

## System Environments

> This is optional, but we recommend setting this pattern to allow for different runtime configurations for different environments.

* `EFFECTSTREAM_ENV` sets the `system environment`.
* `node:start:${EFFECTSTREAM_ENV}` should load the `main.{env}.ts` file.
* `.env.${EFFECTSTREAM_ENV}` is loaded automatically.
* Optionally `config.{env}.ts` can be created to load specific configuration for the environment, this file is imported by `main.{env}.ts`.

The main entry point for the node is located at: `/packages/node/package.json`.  
For example, if you have 2 environments: `local` and `testnet`
```json
{
    "name": "@my-project-name/node",
    "scripts": {
        "node:start:local": "bun --inspect ./src/main.local.ts",
        "node:start:testnet": "bun --inspect ./src/main.testnet.ts",

        "local": "EFFECTSTREAM_ENV=local NODE_ENV=development bun ./scripts/start.local.ts",
        "testnet": "EFFECTSTREAM_ENV=testnet bun ./scripts/start.testnet.ts"
    }
}
```

By running `bun run testnet`:
1. `.env.testnet` is loaded
2. `start.testnet.ts` is launch all the processes, once completed it will call `node:start:testnet`
> IMPORTANT: `node:start:testnet` must match the `EFFECTSTREAM_ENV=testnet` value.


## Reading ENV values

System default ENV are read by using
```ts
import { ENV } from "@effectstream/utils/node-env";

// For system defaults:
const host=ENV.DB_HOST;

// For custom envs in your .env.${EFFECTSTREAM_ENV} file:
const myCustomEnv=ENV.getString("MY_CUSTOM_ENV");

```

## Reference

Every variable below is registered in `packages/effectstream-sdk/utils/src/config.ts` and reachable as a typed getter on `ENV`. A dash in the Default column means the value is unset unless you provide it.

### Environment and database

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `EFFECTSTREAM_ENV` | string | — | The system environment, e.g. `local` or `testnet`. Selects which `.env.{env}` file is loaded. |
| `NODE_ENV` | string | — | Node environment, e.g. `development` or `production`. |
| `DB_HOST` | string | `localhost` | Postgres host URL. |
| `DB_NAME` | string | `postgres` | Postgres database name. |
| `DB_PORT` | number | `5432` | Postgres port. |
| `DB_USER` | string | `postgres` | Postgres user. |
| `DB_PW` | string | `postgres` | Postgres password. **Secret.** |
| `PGLITE` | boolean | `true` | Enable single-connection mode and other PGLite-specific behaviour. **Development only.** |
| `PGLITE_DATA_DIR` | string | `memory://` | PGLite data directory. `memory://` for in-memory, or a file path for persistent storage. |
| `DEBUG_PGLITE` | number | — | Enable PGLite debug/verbose mode. |
| `ALLOW_NO_PG_IVM` | boolean | `false` | Let the engine start without the `pg_ivm` extension, falling back to plain SQL views. Dev/test and low-volume only — the fallback degrades sharply on high-cardinality data. See [Database](./109-database.md). |
| `BATCHER_DB_SCHEMA` | string | — | Schema **suffix** the batcher owns in the database above; the code applies the fixed `batcher_` prefix, so `chess_v2` means the schema `batcher_chess_v2`. Must match `^[a-z0-9_]{1,55}$`. Setting it enables durable request tracking: the batcher connects using `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_NAME` and owns that schema, so several batchers can share one database safely. An invalid value, or a database it cannot reach, **refuses to boot** rather than running untracked. Leaving it unset falls back to queue-only `FileStorage` in `./batcher-data` — no request tracking, no replay/dedup protection, and `GET /input-status` answers 501 — which is **development only**; production must set it. Not usable against the development PgLite gateway, which multiplexes all clients onto one session; point `DB_HOST`/`DB_PORT` at a real PostgreSQL server, or use `BATCHER_PGLITE` below. Setting this **and** `BATCHER_PGLITE` refuses to boot. |
| `BATCHER_PGLITE` | boolean | `false` | **Development only.** Give the batcher its own embedded PgLite database (in-process WASM) at `BATCHER_PGLITE_DATA_DIR`, with full request tracking, instead of connecting to the database above. This is the development answer to request tracking, because the launcher's PgLite gateway puts every client on one shared Postgres session and a batcher cannot isolate itself there without breaking the engine. **Not the same key as `PGLITE`**, which describes the *engine's* database and selects nothing for the batcher. The instance binds **no network socket**, so there is no port to configure and several batchers on one host never collide over one — the only port a batcher opens is `BATCHER_PORT`. Setting this and `BATCHER_DB_SCHEMA` together refuses to boot. |
| `BATCHER_PGLITE_DATA_DIR` | string | `./batcher-data` | Data directory for that embedded database (ignored unless `BATCHER_PGLITE=true`). The database lives in the `pglite` subdirectory; a legacy `pending-inputs.jsonl` sitting directly in the directory is imported once on first boot. This directory **is** the isolation boundary between embedded batchers: give each one its own. Pointing two at the same directory is refused (the batcher takes a `pglite.lock` there), because PgLite does not lock its data directory and two instances sharing one would corrupt it. |

### Ports and services

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `EFFECTSTREAM_API_PORT` | number | `9999` | Main API port, serving your custom endpoints and the RPC endpoints. |
| `EFFECTSTREAM_EXPLORER_PORT` | number | `10590` | Explorer port. |
| `EFFECTSTREAM_CHAIN_ID` | number | `87401284021` | Chain ID for the EffectStream L2. |
| `BATCHER_PORT` | number | `3334` | Batcher HTTP port. |
| `OTEL_COLLECTOR_PORT` | number | `4318` | OpenTelemetry collector port. |
| `DOCS_PORT` | number | `10600` | Docs server port. |
| `ORCHESTRATOR_URL` | string | `http://localhost` | Orchestrator URL. |
| `ORCHESTRATOR_PORT` | number | `0` | Orchestrator port, used by the TUI to monitor processes. |
| `TUI_LOG_URL` | string | `http://localhost` | TUI log URL. |

### Events (MQTT)

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `MQTT_BROKER` | boolean | `true` | Whether to run the MQTT broker. |
| `MQTT_ENGINE_BROKER_URL` | string | `mqtt://127.0.0.1:8883` | Engine broker TCP URL. |
| `MQTT_ENGINE_BROKER_PORT` | number | `8883` | Engine broker TCP port. |
| `MQTT_ENGINE_BROKER_WS_URL` | string | `ws://127.0.0.1:9883` | Engine broker WebSocket URL, for browser clients. |
| `MQTT_ENGINE_BROKER_WS_PORT` | number | `9883` | Engine broker WebSocket port. |
| `MQTT_BATCHER_BROKER_URL` | string | `mqtt://127.0.0.1:8884` | Batcher broker TCP URL. |
| `MQTT_BATCHER_BROKER_PORT` | number | `8884` | Batcher broker TCP port. |
| `MQTT_BATCHER_BROKER_WS_URL` | string | `ws://127.0.0.1:9884` | Batcher broker WebSocket URL. |
| `MQTT_BATCHER_BROKER_WS_PORT` | number | `9884` | Batcher broker WebSocket port. |

### Sync and performance

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `STORE_HISTORICAL_GAME_INPUTS` | boolean | `true` | Persist historical game inputs. |
| `EFFECTSTREAM_COALESCE_EMPTY_BLOCKS` | boolean | `false` | Fold consecutive empty catch-up blocks into one DB transaction when behind the chain tip. |
| `EFFECTSTREAM_LAG_THRESHOLD_MS` | number | — | Lag threshold (ms) gating empty-block coalescing and lag logging. Defaults to 20× the main clock's block time, or 60 s when no `blockTimeMS` is exposed. |
| `EFFECTSTREAM_FINALIZED_STREAM_CAP` | number | `2048` | Backpressure cap on the in-memory finalized-block queue between the merge and the runtime apply loop, bounding memory during deep catch-up. |

### Snapshots

See [Database Snapshots](../1000-effectstream-engine/1003-database-snapshots.md) for the full retention model.

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `EFFECTSTREAM_SNAPSHOT_INTERVAL_SECONDS` | number | — | Wall-clock seconds between automated `pg_dump` snapshots. **Leaving this unset disables snapshots entirely.** |
| `EFFECTSTREAM_SNAPSHOT_PATH` | string | `./snapshots` | Output directory for `.dump` files. |
| `EFFECTSTREAM_SNAPSHOT_LAST_DAY_HOURLY` | boolean | `true` | Retention: keep one snapshot per hour for the last 24 hours. |
| `EFFECTSTREAM_SNAPSHOT_LAST_3_DAYS_SIX_HOURLY` | boolean | `true` | Retention: keep one snapshot per 6-hour window for the last 3 days. |
| `EFFECTSTREAM_SNAPSHOT_LAST_N_DAYS` | number | `7` | Retention: keep one snapshot per day for this many days; older snapshots are deleted. |

### Security and development

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `ENABLE_DEV_AND_DEBUG_ENDPOINTS` | boolean | `false` | Register the developer/debug endpoints (`/debug/sync-protocols`, `/config`, `/db_acquire_lock`, `/db_release_lock`, `/force-batch`, `/clear-inputs`). **Disable in production** — when unset these routes do not exist at all. |
| `API_KEY_OPEN_ENDPOINTS_EXPLORER` | string | `effectstream_api_explorer_endpoints_password` | API key guarding the open explorer endpoints (tables, primitives, addresses, scheduled-data). **Secret — change this in production.** |
| `RECAPTCHA_V3_FRONTEND` | string | — | ReCaptcha v3 frontend key, used by the batcher to verify requests. Leave empty to disable. |
| `MIDNIGHT_STORAGE_PASSWORD` | string | `YourPasswordMy1!` | Midnight storage password, used to run the node or deploy contracts on Midnight. **Secret.** |

### Set by the environment

These are read from the OS rather than configured by you.

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `SHELL` | string | — | System shell path, set by the OS. Used to run TUI/tmux commands. |
| `TMUX` | string | — | Set by tmux itself; used to detect whether the process runs inside a tmux session. |
| `TUI_LOG_PORT` | number | `11033` | TUI log port. |
