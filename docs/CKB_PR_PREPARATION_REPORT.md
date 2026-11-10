# CKB PR Preparation Report

**Decision: PARTIAL — REVIEW REQUIRED**

The integration is reviewable and the cited functional/regression evidence is positive. The repository's final strict TypeScript comparison still exits nonzero on diagnostics reproduced against clean upstream `v-next`. The PR description should disclose this, and maintainers should decide whether those baseline diagnostics are acceptable for publication. No changes were made to tracked files during this audit.

## Branch and protected references

- Branch: `feat/ckb-native-sync-upstream-integration`
- HEAD: `cd3db259b2b0039f349ceda9fc046290c83235ab`
- Upstream base: `cd3db259b2b0039f349ceda9fc046290c83235ab`
- Published baseline: `14c27d58c247eec53b3b37c54ea62d3e1af2c0cf` (unchanged)
- Connector pin: `5a0d30adb682f4de282be7eb794eda0a845c302a` (unchanged)
- Starting staged paths: 65. Starting paths with unstaged edits: 5; four of these overlap staged files. No reset, stash, discard, commit, rebase, push, or automatic staging occurred.

## Staged and unstaged reconciliation

The 65 staged paths comprise CKB network and protocol schemas, native fetcher/state and shared sync integration, PostgreSQL migration/assets, runtime event/outbox integration, EVM contract/relay worker/acceptance harness, dashboard, tests, and CKB reports/docs. They include upstream v-next `0.300.3` lock graph/version reconciliation. All are within the stated CKB integration or its upstream reconciliation and verification scope; no deleted upstream functionality was detected in the reviewed changes.

Five paths also have unstaged follow-up changes:

| Path | Follow-up change and disposition |
| --- | --- |
| `bun.lock` | Adds the `@types/pg` development dependency to the sync workspace lock entry and resolves the root package to 8.23.1. This is CKB strict-type remediation; the existing `pg` runtime dependency remains. |
| `docs/CKB_UPSTREAM_COMPATIBILITY_REPORT.md` | Adds the final strict upstream comparison, Postgres fallback conditions, fresh acceptance evidence, and current limitations. Historical sections remain but are explicitly superseded by the final verification section. |
| `packages/node-sdk/sync/package.json` | Declares `@types/pg` as a dev dependency; retains the runtime `pg` dependency and exact connector commit. |
| `packages/node-sdk/sync/src/sync-protocols/ckb/fetcher.test.ts` | Makes the fixture hash type explicit and narrows the restored state to CKB before CKB-specific fetcher use. |
| `packages/node-sdk/sync/src/sync-protocols/common/page-helpers.ts` | Types pagination against the per-call page/fetcher relation contract; removes the old union-result casts. This reconciles CKB page types while keeping shared callers. |

No unrelated behavior was identified in these unstaged hunks. `packages/node-sdk/runtime/src/main.ts` retains upstream's nested `call()` lifecycle and inserts CKB relay validation after cleanup registration and before opening the database connection. The upstream package version/stable Midnight pins are preserved in sync manifest/lock. Public API changes are additive: CKB network/protocol/config and optional relay configuration, with no identified removal of existing upstream interfaces.

## Changed-file inventory (staged at audit start)

- `apps/ckb-relay-dashboard/.env.example`
- `apps/ckb-relay-dashboard/README.md`
- `apps/ckb-relay-dashboard/package.json`
- `apps/ckb-relay-dashboard/public/index.html`
- `apps/ckb-relay-dashboard/src/server.test.ts`
- `apps/ckb-relay-dashboard/src/server.ts`
- `bun.lock`
- `docs/CKB_POST_PIN_REGRESSION_ACCEPTANCE_REPORT.md`
- `docs/CKB_UPSTREAM_COMPATIBILITY_REPORT.md`
- `e2e/evm/ckb-event-relay-worker-main.ts`
- `e2e/evm/ckb-relay-dashboard-live.ts`
- `e2e/evm/ckb-relay-primitive.ts`
- `e2e/evm/config.ts`
- `e2e/evm/launcher.cli.ts`
- `e2e/evm/node.ts`
- `e2e/evm/postgres-config.test.ts`
- `e2e/evm/postgres-config.ts`
- `e2e/evm/run-tests.ts`
- `e2e/evm/sync/batcher.test.ts`
- `e2e/evm/tooling/ckb-event-relay-adapter.ts`
- `e2e/evm/tooling/ckb-event-relay-worker.test.ts`
- `e2e/evm/tooling/ckb-event-relay-worker.ts`
- `e2e/evm/tooling/ckb-event-relay.ts`
- `e2e/evm/tooling/ckb-to-evm-relay.test.ts`
- `e2e/evm/tooling/deploy.test.ts`
- `e2e/shared/contracts/evm/deploy.ts`
- `e2e/shared/contracts/evm/ignition/modules/ckbEventRelay.ts`
- `e2e/shared/contracts/evm/src/contracts/CkbEventRelay.sol`
- `packages/effectstream-sdk/config/src/schema/network/all.ts`
- `packages/effectstream-sdk/config/src/schema/network/ckb.ts`
- `packages/effectstream-sdk/config/src/schema/network/mod.ts`
- `packages/effectstream-sdk/config/src/schema/network/types.ts`
- `packages/effectstream-sdk/config/src/schema/network/utils.ts`
- `packages/effectstream-sdk/config/src/schema/primitive/types.ts`
- `packages/effectstream-sdk/config/src/schema/sync-protocols/all.ts`
- `packages/effectstream-sdk/config/src/schema/sync-protocols/ckb/rpc.ts`
- `packages/effectstream-sdk/config/src/schema/sync-protocols/mod.ts`
- `packages/effectstream-sdk/config/src/schema/sync-protocols/types.ts`
- `packages/effectstream-sdk/config/test/ckb-schema.test.ts`
- `packages/effectstream-sdk/utils/src/types/nominal.ts`
- `packages/node-sdk/db/assets-config.json`
- `packages/node-sdk/db/migrations/assets.ts`
- `packages/node-sdk/db/migrations/system-up-v-0.8.2.sql`
- `packages/node-sdk/db/migrations/system-version.ts`
- `packages/node-sdk/runtime/src/api/http-server.ts`
- `packages/node-sdk/runtime/src/ckb-evm-relay.ts`
- `packages/node-sdk/runtime/src/config-snapshot.ts`
- `packages/node-sdk/runtime/src/main.ts`
- `packages/node-sdk/runtime/src/process-blocks.ts`
- `packages/node-sdk/runtime/src/types.ts`
- `packages/node-sdk/runtime/test/config-snapshot.unit.test.ts`
- `packages/node-sdk/runtime/test/reproduction/ckb-fork-fail-closed.test.ts`
- `packages/node-sdk/runtime/test/reproduction/ckb-relay-outbox-postgres.test.ts`
- `packages/node-sdk/sync/README.md`
- `packages/node-sdk/sync/docs/CKB-NATIVE-SYNC.md`
- `packages/node-sdk/sync/docs/CKB-TO-EVM-M4.md`
- `packages/node-sdk/sync/package.json`
- `packages/node-sdk/sync/scripts/ckb-live-smoke.ts`
- `packages/node-sdk/sync/src/sync-protocols/ckb/fetcher.test.ts`
- `packages/node-sdk/sync/src/sync-protocols/ckb/fetcher.ts`
- `packages/node-sdk/sync/src/sync-protocols/ckb/state.ts`
- `packages/node-sdk/sync/src/sync-protocols/ckb/types.ts`
- `packages/node-sdk/sync/src/sync-protocols/mod.ts`
- `packages/node-sdk/sync/src/sync-protocols/types.ts`
- `packages/node-sdk/sync/src/syncProtocolFactory.ts`

## Dependency and lockfile audit

- `packages/node-sdk/sync/package.json` has `pg: ^8.14.0` under runtime `dependencies` and `@types/pg: ^8.15.5` under `devDependencies`.
- The `pg` runtime dependency is used by sync CKB state/database code; its runtime classification is appropriate. `@types/pg` is compile-time only.
- The connector dependency in manifest and lock resolves to the required immutable SHA `5a0d30adb682f4de282be7eb794eda0a845c302a`.
- The compatibility report records `bun install --frozen-lockfile` passing with Bun 1.4.4, 1,711 installs checked across 1,749 packages, no lock changes required. This is prior evidence; the only later dependency delta is the recorded `@types/pg` addition, whose lock entry is present. The report notes that frozen install was not rerun after earlier remediation; the final verification section reports the current frozen install pass.
- No other new runtime dependency beyond the pinned CKB connector was identified in the integration sync manifest changes.

## Test and acceptance evidence

As documented in `docs/CKB_UPSTREAM_COMPATIBILITY_REPORT.md`:

- CKB/sync regression: CKB fetcher 4 tests/25 assertions; shared sync 111/532; CKB config 2/8; config typecheck passed under its baseline-aware script.
- PostgreSQL fork/outbox: 2 passed, 0 failed, 29 assertions on isolated PostgreSQL 18.6. The harness requires `PGLITE=false` and `REPRO_PG_BINDIR`; it enabled `ALLOW_NO_PG_IVM=true` because `pg_ivm` is unavailable. This fallback verifies the real-PostgreSQL paths exercised by these tests, not production `pg_ivm` behavior.
- EVM regression: 13 tests, 15 assertions; dashboard 4 tests/19 assertions and 40-module build.
- Fresh live EVM/CKB acceptance: 50 passed, 0 failed, 0 skipped. Two outbox events were executed successfully with separate destination receipts; each persisted payload hash matched independently calculated and on-chain hashes. Sync advancement, dashboard status/API/render checks, dashboard restart, worker restart, and post-restart outbox/transaction uniqueness are recorded.
- Frozen installation and `git diff --check` are recorded as passing.
- Strict targeted TypeScript with locked TypeScript 5.9.3: no diagnostics remain in CKB fetcher/state/tests or shared pagination helper, but the command exits nonzero on non-CKB diagnostics reproduced in a clean detached upstream worktree. Root tsconfig is not strict and CI does not run this extra strict command. This is the publication review item.

## Proposed PR materials

**Title**

`feat: add native CKB sync and EVM relay integration`

**Description**

Adds native CKB synchronization and durable CKB-to-EVM relay support, reconciled against upstream v-next (`cd3db259b2b0039f349ceda9fc046290c83235ab`).

Includes native CKB synchronization and cursor/state integration; corrected CKB script hash serialization through the connector pinned at `5a0d30adb682f4de282be7eb794eda0a845c302a`; durable PostgreSQL relay/outbox handling; CKB fork fail-closed and PostgreSQL fork/outbox regression coverage; EVM relay contract and worker; verified live CKB-to-EVM acceptance; and dashboard plus worker restart verification.

Testing recorded: CKB and sync regression suites, EVM relay tests, PostgreSQL fork/outbox tests, dashboard tests/build, fresh live CKB-to-EVM acceptance, and frozen dependency installation. PostgreSQL tests used isolated PostgreSQL 18.6 with `ALLOW_NO_PG_IVM=true` because `pg_ivm` was unavailable; this does not verify production `pg_ivm` behavior. The strict targeted TypeScript command still reports non-CKB diagnostics reproduced on clean upstream `v-next`; the repository CI typecheck and baseline-aware config typecheck pass.

Known limitations: historical spent-cell resolution remains incomplete; lock-script-aware ownership transitions are not implemented; production-grade CKB reorg recovery and trustless bridge guarantees are not claimed.

## Remaining risks and publication checklist

1. Review and accept the non-CKB strict TypeScript diagnostics reproduced on the upstream base, or resolve them in an appropriately scoped upstream change before publication.
2. Keep the PostgreSQL fallback limitation explicit; the evidence does not exercise production `pg_ivm` behavior.
3. The integration is local relay/acceptance scope (destination chain 31337); the report does not claim a production bridge or generalized destination configuration.
4. The working tree has intentionally retained staged and unstaged edits. Review both layers before preparing a publication commit.

## Status snapshot at audit start

```text
A  apps/ckb-relay-dashboard/.env.example
A  apps/ckb-relay-dashboard/README.md
A  apps/ckb-relay-dashboard/package.json
A  apps/ckb-relay-dashboard/public/index.html
A  apps/ckb-relay-dashboard/src/server.test.ts
A  apps/ckb-relay-dashboard/src/server.ts
MM bun.lock
A  docs/CKB_POST_PIN_REGRESSION_ACCEPTANCE_REPORT.md
AM docs/CKB_UPSTREAM_COMPATIBILITY_REPORT.md
A  e2e/evm/ckb-event-relay-worker-main.ts
A  e2e/evm/ckb-relay-dashboard-live.ts
A  e2e/evm/ckb-relay-primitive.ts
M  e2e/evm/config.ts
M  e2e/evm/launcher.cli.ts
M  e2e/evm/node.ts
A  e2e/evm/postgres-config.test.ts
A  e2e/evm/postgres-config.ts
M  e2e/evm/run-tests.ts
M  e2e/evm/sync/batcher.test.ts
A  e2e/evm/tooling/ckb-event-relay-adapter.ts
A  e2e/evm/tooling/ckb-event-relay-worker.test.ts
A  e2e/evm/tooling/ckb-event-relay-worker.ts
A  e2e/evm/tooling/ckb-event-relay.ts
A  e2e/evm/tooling/ckb-to-evm-relay.test.ts
M  e2e/evm/tooling/deploy.test.ts
M  e2e/shared/contracts/evm/deploy.ts
A  e2e/shared/contracts/evm/ignition/modules/ckbEventRelay.ts
A  e2e/shared/contracts/evm/src/contracts/CkbEventRelay.sol
M  packages/effectstream-sdk/config/src/schema/network/all.ts
A  packages/effectstream-sdk/config/src/schema/network/ckb.ts
M  packages/effectstream-sdk/config/src/schema/network/mod.ts
M  packages/effectstream-sdk/config/src/schema/network/types.ts
M  packages/effectstream-sdk/config/src/schema/network/utils.ts
M  packages/effectstream-sdk/config/src/schema/primitive/types.ts
M  packages/effectstream-sdk/config/src/schema/sync-protocols/all.ts
A  packages/effectstream-sdk/config/src/schema/sync-protocols/ckb/rpc.ts
M  packages/effectstream-sdk/config/src/schema/sync-protocols/mod.ts
M  packages/effectstream-sdk/config/src/schema/sync-protocols/types.ts
A  packages/effectstream-sdk/config/test/ckb-schema.test.ts
M  packages/effectstream-sdk/utils/src/types/nominal.ts
M  packages/node-sdk/db/assets-config.json
M  packages/node-sdk/db/migrations/assets.ts
A  packages/node-sdk/db/migrations/system-up-v-0.8.2.sql
M  packages/node-sdk/db/migrations/system-version.ts
M  packages/node-sdk/runtime/src/api/http-server.ts
A  packages/node-sdk/runtime/src/ckb-evm-relay.ts
M  packages/node-sdk/runtime/src/config-snapshot.ts
M  packages/node-sdk/runtime/src/main.ts
M  packages/node-sdk/runtime/src/process-blocks.ts
M  packages/node-sdk/runtime/src/types.ts
M  packages/node-sdk/runtime/test/config-snapshot.unit.test.ts
A  packages/node-sdk/runtime/test/reproduction/ckb-fork-fail-closed.test.ts
A  packages/node-sdk/runtime/test/reproduction/ckb-relay-outbox-postgres.test.ts
M  packages/node-sdk/sync/README.md
A  packages/node-sdk/sync/docs/CKB-NATIVE-SYNC.md
A  packages/node-sdk/sync/docs/CKB-TO-EVM-M4.md
MM packages/node-sdk/sync/package.json
A  packages/node-sdk/sync/scripts/ckb-live-smoke.ts
AM packages/node-sdk/sync/src/sync-protocols/ckb/fetcher.test.ts
A  packages/node-sdk/sync/src/sync-protocols/ckb/fetcher.ts
A  packages/node-sdk/sync/src/sync-protocols/ckb/state.ts
A  packages/node-sdk/sync/src/sync-protocols/ckb/types.ts
 M packages/node-sdk/sync/src/sync-protocols/common/page-helpers.ts
M  packages/node-sdk/sync/src/sync-protocols/mod.ts
M  packages/node-sdk/sync/src/sync-protocols/types.ts
M  packages/node-sdk/sync/src/syncProtocolFactory.ts
```
