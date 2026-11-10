# EffectStream CKB Post-Pin Regression and Acceptance Report

**Status: PASS — FULL REGRESSION AND LIVE ACCEPTANCE VERIFIED**

## Repository and dependency state

- Repository: `/home/farmers-boy/Documents/GKM/CKB/effectstream-ckb-sync`
- Branch: `feat/ckb-native-sync`
- EffectStream HEAD: `c31d99328beb718cf15aeaa9e65443df2a190078`
- Connector immutable pin: `5a0d30adb682f4de282be7eb794eda0a845c302a`
- `packages/node-sdk/sync/package.json` and `bun.lock` both resolve to the requested SHA. They were already modified at task start; the pin was not changed again.
- `bun install --frozen-lockfile`: passed (`Checked 1732 installs across 1771 packages (no changes)`).
- The installed package is under Bun's `...ckb-multichain-connector+5a0d30a...` store path. Its `src/hash.ts` contains the corrected Molecule `Bytes` encoding: the 4-byte prefix records the payload length, excluding the prefix, before hashing the serialized script. The installed source was inspected directly.

## PostgreSQL port diagnosis

- `127.0.0.1:5432` is already served by host PostgreSQL 18. Process inspection showed the system `18/main` cluster and a separate `18/orbis_test` cluster. Neither was stopped or reconfigured.
- `e2e/evm/launcher.cli.ts` calls `launchPglite()` without a port. The helper defaults to 5432; `stopProcessAtPort` would also claim that port. The runner accepts `DB_HOST` and `DB_PORT`, and `launchPglite()` supports external PostgreSQL when `PGLITE=false`.
- For the EVM attempt, a disposable PostgreSQL 18 cluster was created on an available loopback port (recorded in the evidence directory); it was stopped after the runner exited. The host services were not used as test databases.
- The focused PostgreSQL harness checks `PGLITE=false` and `postgresAvailable()`. With `REPRO_PG_BINDIR=/usr/lib/postgresql/18/bin`, it starts isolated temporary clusters and per-test databases; no personal or production credentials were used.

## PostgreSQL-backed tests

Command:

```sh
PGLITE=false REPRO_PG_BINDIR=/usr/lib/postgresql/18/bin bun test \
  packages/node-sdk/runtime/test/reproduction/ckb-fork-fail-closed.test.ts \
  packages/node-sdk/runtime/test/reproduction/ckb-relay-outbox-postgres.test.ts
```

Result: **2 passed, 0 failed, 29 assertions**. The fork test verified fail-closed handling and transaction atomicity; the relay outbox test verified persisted lease/restart/retry behavior. Neither guard was bypassed.

## Full EVM regression

The runner was executed with `PGLITE=false` and the disposable PostgreSQL port. The first invocation found Foundry unavailable on its inherited `PATH`; the retry added the already installed Foundry binary directory without changing repository configuration.

The earlier retry compiled contracts, deployed chains 31337 and 31338, generated bindings, and passed 17 tooling tests, but timed out waiting for `GET http://localhost:9999/health`. The preserved runner environment had `DB_PORT=53881` but no `ALLOW_NO_PG_IVM=true`. The PostgreSQL log records the unavailable `pg_ivm` extension. The runtime's capability check intentionally throws when the extension is unavailable and the explicit dev/test fallback is not enabled; the HTTP server starts later in initialization, so health cannot return `status: ok`. The missing `sync_protocol_pagination` queries occurred during initial schema bootstrap and also appeared transiently in the successful live run; the table is created by `system-up-v-0.0.1.sql`, and those early queries did not prevent startup once migrations completed.

- Earliest causal failure: `pg_ivm` absent and fallback flag unset
- The `pg_ivm`-optional fallback is explicitly documented for dev/test and is enabled by the live acceptance workflow; with that setting the sync node started, health returned `200 {"status":"ok"}`, and block processing advanced.

The latest complete acceptance run passed **50 EVM/CKB E2E tests, 0 failed, 0 skipped**. The preserved `evm-e2e.log` numbers those live runner cases 1 through 50 and records the zero-failure/zero-skip summary. This is a separate end-to-end run inventory; it is not calculated by adding the focused unit/integration test totals below. Those focused suites were executed as separate commands, so the apparent difference between 50 and the sum 36 is not a missing-test count. The dedicated 11 port tests are also reported separately from the aggregate focused suite and must not be added a second time. No unobserved 14 tests are inferred.

The live runner covered tooling, EVM sync, batching, CKB event ingestion, and relay execution. The smallest remediation for the earlier health timeout is to set `ALLOW_NO_PG_IVM=true` for this disposable dev/test PostgreSQL run (or install `pg_ivm` where the production path is intended); no health check was weakened.

## CKB synchronization and live acceptance

- `bun test packages/node-sdk/sync/src/sync-protocols/ckb/fetcher.test.ts`: **4 passed, 0 failed, 25 assertions**, covering native event mapping, cursor restoration, checkpoint conflict handling, and retry behavior.
- Live acceptance uses `CKB_ACCEPTANCE_DB_PORT`; the default remains `55432`, while this run selected verified-free loopback port **55433**. It created and initialized a temporary PostgreSQL 18 cluster in `/tmp/ckb-relay-dashboard-live-Y0qyMv/postgres-data`, bound only to `127.0.0.1`, applied migrations, and stopped that exact data directory's server during cleanup.
- CKB evidence: OffCKB `0.4.13`, CKB `0.208.0`; source transaction `0x2d432495617af69158029a7f97fe13e5ab2bad96ab01e7ec9f87a16cc19c91f6` was observed at CKB block 3, hash `0x5ccb6a2cbed108a1e3aa33fb63ce7f1790db3e533a81688d2517b5a5d5aa0fb1`.
- Relay evidence: one `confirmed` outbox row (one attempt) on destination chain 31337; EVM transaction `0xfce5c479c20b8d309ddf97d4cce4222f1ef85860e2f7fb2f08976b7a9bf6a043` succeeded at block 108. Persisted, calculated, and on-chain payload hashes all matched: `0x73086506db4ae53d004a64bd124086503cc4ab1e541b93cd010b53070e88e223`.
- Dashboard API status, event search/detail, rendered DOM, dashboard restart, and relay worker restart all passed. Screenshot and acceptance summary are retained in the evidence directory.

## Scope and workspace changes

Pre-existing changes in `packages/node-sdk/sync/package.json` and `bun.lock` were preserved; the connector SHA remains unchanged. This task added the configurable port helper, focused tests, and workflow updates for port consistency, owned-process cleanup, and clearing the runner timeout after exit. Event V1, connector code/pin, historical spent-cell resolution, ownership-transition tracking, and unrelated dependencies were not changed.

Historical spent-cell resolution and ownership-transition tracking remain deferred. Canonical CKB fork recovery remains unsupported; the fork test verifies fail-closed behavior, not recovery. The relay does not prove trustless bridging or cross-chain exactly-once execution. Production-grade reorg recovery is not claimed.

## Evidence and remaining limitations

- Full EVM runner logs and temporary PostgreSQL logs: `/tmp/effectstream-ckb-postpin.IPhIoK/`
- Latest full live acceptance evidence: `/tmp/ckb-relay-dashboard-live-Y0qyMv/` (summary JSON, PostgreSQL logs, EVM runner logs, source transaction, CKB settings, dashboard screenshot).
- Focused port/configuration/CKB fetcher/relay worker/dashboard suite: **23 passed, 0 failed, 66 assertions**. Isolated PostgreSQL CKB fork/outbox tests: **2 passed, 0 failed, 29 assertions**. Dedicated port tests: **11 passed, 0 failed, 13 assertions**; these port tests are included in the focused 23 and are a breakdown, not an additional set.
- A strict TypeScript check of `postgres-config.ts` and its test passed. The repository-wide `tsc --noEmit -p tsconfig.json` reports **325 diagnostics**. They fall into three existing categories: missing site/workspace dependencies or declarations (including React/Docusaurus, generated SQL, workspace aliases, and `ckb-multichain-connector`); existing diagnostics in unchanged files (including ABI/type, branded type, and migration typing errors); and no diagnostics in the new PostgreSQL helper/test. The errors reported at existing contract calls in the live acceptance workflow are in unchanged call sites; the changes in this milestone add no TypeScript errors. A clean repository-wide typecheck is not claimed.
- At final inspection, `18/main` remained online on port 5432 and port 55432 was no longer listening; `18/orbis_test` showed `down`. This workflow did not issue commands against either system cluster: it only used and stopped its temporary PostgreSQL data directory. The external timing/actor for the `orbis_test` state change cannot be established here.
- Existing limitations remain: historical spent-cell resolution, ownership-transition tracking, and canonical CKB fork recovery are not implemented. This run verifies the local acceptance path, not production-grade reorg recovery or trustless bridge properties.

## Configurable port and workflow lifecycle

`CKB_ACCEPTANCE_DB_PORT` selects the temporary PostgreSQL port. Unset or blank preserves the backward-compatible default `55432`; valid custom ports are `1024` through `65535`. Preflight rejects occupied ports without fallback. Database startup, identity check, runner `DB_PORT`, dashboard URL, and acceptance summary all use the same resolved port. The process is stopped only after this run successfully starts PostgreSQL, using `pg_ctl -D` for its unique temporary data directory; evidence is retained after service cleanup.
