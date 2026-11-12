# CKB Upstream Compatibility Report

**Status: PARTIAL — NON-CKB UPSTREAM ISSUES REMAIN**

The CKB type fixes and required database/live acceptance checks are now verified. The latest strict reproduction has no CKB diagnostics, but still reports errors also present on upstream `v-next`; the final audit below records their exact classification and the upstream CI behavior. Earlier sections are historical snapshots and are superseded by the final verification section.

## Baseline and branch

- Published fork branch: `fork/feat/ckb-native-sync`
- Published commit: `14c27d58c247eec53b3b37c54ea62d3e1af2c0cf`
- Upstream `origin/v-next`: `cd3db259b2b0039f349ceda9fc046290c83235ab`
- Merge base: `5604043213df01beccebe253fbb479e387a514bb`
- Divergence at assessment: upstream is 39 commits ahead of the merge base; the published fork is 8 commits ahead.
- Integration branch: `feat/ckb-native-sync-upstream-integration`, based on upstream `v-next` and containing the CKB fork changes as a no-commit merge for review.
- The published branch was not modified. No push, rebase, reset, force-push, or commit rewrite was performed.
- The pre-existing acceptance report and CKB implementation were present on the published baseline and were preserved in the integration tree.

## Upstream changes reviewed

The upstream-only series includes the 0.300.3 release and the Midnight v9 migration, stable Midnight ledger/indexer/runtime dependency updates, startup failure handling, config builder semantics and associated tests. The upstream runtime now scopes startup with `call()` so finalizers and cleanup failures propagate through the runtime lifecycle. The upstream sync package version is `0.300.3`; its stable Midnight packages are `@midnight-ntwrk/ledger-v9` 1.0.0, public data provider 5.0.0, and runtime v4 4.0.0. The inspected upstream range did not introduce competing CKB connector interfaces or database migration changes.

The CKB branch adds system migration 0.8.2 on top of upstream 0.8.1. It does not modify Event V1, implement historical spent-cell resolution or ownership transitions, or claim trustless bridging or production-grade reorg recovery.

## Conflict reconciliation

| File | Upstream change | CKB change | Resolution and compatibility |
| --- | --- | --- | --- |
| `bun.lock` | Refreshes the dependency graph for the 0.300.3 release and Midnight v9 stack. | Adds the connector dependency pinned to commit `5a0d30adb682f4de282be7eb794eda0a845c302a`. | Kept the upstream lock graph as the starting point, reconciled the manifest, and regenerated the lockfile with Bun. Frozen installation passes, and the immutable connector SHA is present in both manifest and lock. |
| `packages/node-sdk/sync/package.json` | Bumps the sync package and updates the Midnight package versions to stable v9 releases. | Adds the CKB connector. | Preserved upstream package version and stable Midnight pins; added only the CKB connector at the exact immutable SHA. |
| `packages/node-sdk/runtime/src/main.ts` | Moves startup work inside a nested `call()` scope so teardown and cleanup failures propagate correctly. | Validates CKB relay config before database initialization. | Kept the upstream scoped lifecycle and placed CKB validation inside that scope, after cleanup registration and before opening the database connection. This retains cleanup behavior and fails invalid relay configuration before DB side effects. Runtime tests and live acceptance pass. |

Other upstream architecture areas were inspected: sync protocol and connector typing, worker shutdown/restart behavior, database migrations, runtime configuration, and tests. No additional textual conflict was found. The regression commands below cover the touched runtime, sync, migration/outbox, CKB, and relay paths.

## Files in the integration change

The branch changes 65 paths relative to upstream `v-next`, comprising the CKB connector/schema/fetcher/state, relay worker and dashboard, migration 0.8.2, EVM relay contract and E2E wiring, acceptance report and CKB docs, plus the three reconciled conflict files and related tests. The full path list is available from `git diff --name-only origin/v-next` on this branch.

## Verification

The following results are from the earlier compatibility audit, before the type remediation below.

| Check | Result |
| --- | --- |
| `bun install --frozen-lockfile` | Passed with Bun 1.4.4. |
| Focused CKB config, fetcher, PostgreSQL port, relay worker, dashboard tests | 23 passed, 0 failed, 67 assertions across 6 files. |
| `bun test packages/node-sdk/sync/test` | 111 passed, 0 failed, 532 assertions across 12 files, including upstream Midnight v9 and sync lifecycle coverage. |
| Pinned connector config/hash/observer tests | 32 passed, 0 failed, 81 assertions. |
| PostgreSQL fork fail-closed and relay outbox tests against PostgreSQL 18 | 2 passed, 0 failed, 29 assertions. |
| `bun test e2e/evm` | 13 passed, 0 failed, 15 assertions across 16 files. |
| Runtime lifecycle, startup-failure, telemetry, config snapshot tests | 17 passed in separately run focused files. |
| Runtime health tests | 2 passed, 0 failed, 18 assertions. |
| Dashboard bundle | Passed; 40 modules bundled. |
| `git diff --check` | Passed. |
| `bun run --cwd packages/effectstream-sdk/config typecheck` | Passed. This package script suppresses two precisely pinned pre-existing diagnostics. |
| Strict targeted TypeScript diagnostic pass | **Not clean.** See classification below. |
| Live CKB-to-EVM acceptance | Passed; details below. |

A combined multi-file Bun invocation for selected runtime lifecycle files initially reported 3 module export/import errors. Running the files separately passed; the health tests were also rerun separately and passed. This runner interaction is recorded rather than counted as a product regression.

### TypeScript diagnostic classification

The strict targeted check at the earlier audit reported CKB-specific diagnostics. Their reproduction and resolution are documented in the remediation audit below:

- `packages/node-sdk/sync/src/sync-protocols/common/page-helpers.ts` lines 67–84: the new object-shaped CKB page joins the paginated protocol union, and the current `narrowResult` generic then infers an intersection where the helper needs a union. This is a shared typing issue exposed by adding CKB and requires a type-safe generic adjustment.
- `packages/node-sdk/sync/src/sync-protocols/ckb/fetcher.test.ts`: one fixture address is typed as general `string` rather than `` `0x${string}` ``; the factory-based test also loses the concrete CKB state/output type when using the protocol union. These test typing issues need correction and rechecking.

The same ad-hoc strict pass reports other diagnostics outside the new CKB files, including concise address unions, config/event/typebox typing, missing OpenTelemetry namespace declarations, an existing Utxo RPC fetcher property, existing runtime primitive/pool typing, wallet branding, missing `@utxorpc/spec` declarations, Midnight optional height handling, and UtxoRPC `Uint8Array` typing. These were not changed. The diagnostic run does not establish which predate the upstream merge because a strict baseline check on upstream was not run; they are classified as non-CKB diagnostics in unchanged code, not asserted to be pre-existing relative to upstream.

Missing declaration/dependency issues: `@utxorpc/spec` is not resolvable in the ad-hoc check environment, and the OpenTelemetry namespace declarations are not available to that invocation. No repository-wide errors were suppressed or fixed as part of this compatibility pass.

No runtime, acceptance, or test regression was observed. The unresolved issue is type-level compatibility, so a PR readiness claim would be premature.

## Live acceptance evidence

Fresh acceptance evidence is preserved at `/tmp/ckb-relay-dashboard-live-rtIUbU/`.

- PostgreSQL 18.6 used `127.0.0.1:55433`, database `effectstream`, with a disposable temporary data directory tracked in the evidence directory.
- Acceptance log: `logs/evm-e2e.log`; it records 50 live-run tests passed, zero failed/skipped.
- Source CKB transaction: `0x2d432495617af69158029a7f97fe13e5ab2bad96ab01e7ec9f87a16cc19c91f6`, block 3, hash `0x8262ed4dad337a328faaec7e157bab794bd43b5de060b424b028257074edfc0d`.
- Destination transaction: `0xa36ae580f8afc35b982cadccb02eea91778ad03eeefe7d07384fed790ca9c6d5`, EVM chain 31337, successful receipt at block 69.
- Persisted, calculated, and contract payload hashes matched: `0x37f2b41da50f6d5d91f3432bae97d136c7442fee8e1213fad06fe82081657644`.
- Evidence records health checks, CKB sync, dashboard and worker restart checks, event ingestion and outbox execution. Dashboard screenshot: `dashboard-confirmed-event.png`.

The earlier published acceptance baseline remains at `/tmp/ckb-relay-dashboard-live-Y0qyMv/` with its report in `docs/CKB_POST_PIN_REGRESSION_ACCEPTANCE_REPORT.md`. The fresh integration-branch run reproduces the core source-to-destination payload hash match.

## Remaining compatibility risks and next step

1. Fix the CKB pagination generic and concrete CKB test typing without weakening shared type safety; rerun targeted strict TypeScript checking and the affected sync suites.
2. Run an upstream-baseline comparison for remaining repository-wide strict diagnostics if a precise pre-existing versus newly exposed classification is required.
3. After these checks pass, update this report’s status. The current branch is a reviewable compatibility work branch, but is **not yet suitable for a pull request**.

Connector dependency remains pinned to `5a0d30adb682f4de282be7eb794eda0a845c302a`.

## Type remediation audit — 2026-11-11

This section supersedes the earlier “Remaining compatibility risks and next step” section above.

### Working state

- Branch: `feat/ckb-native-sync-upstream-integration`.
- `HEAD` and `origin/v-next`: `cd3db259b2b0039f349ceda9fc046290c83235ab`.
- Published baseline ref `fork/feat/ckb-native-sync`: `14c27d58c247eec53b3b37c54ea62d3e1af2c0cf` (unchanged).
- The integration changes that were staged at start remain staged. The three files changed for this remediation are unstaged; no reset, stash, commit, or history rewrite was performed.
- Connector manifest pin remains `5a0d30adb682f4de282be7eb794eda0a845c302a`.

### Original CKB diagnostics and correction

The previous audit did not preserve its exact command or compiler version. An earlier reproduction used `bunx` and TypeScript 7.0.2, which is not the repository-locked compiler. The final reproducible comparison uses the locked TypeScript 5.9.3 documented below.

```sh
bunx tsc --ignoreConfig --noEmit --strict --skipLibCheck --moduleResolution bundler --module esnext --allowImportingTsExtensions --target esnext --types bun-types \
  packages/node-sdk/sync/src/sync-protocols/common/page-helpers.ts \
  packages/node-sdk/sync/src/sync-protocols/ckb/fetcher.test.ts
```

The two strict CKB error groups reproduced as follows:

| Location | Diagnostic | Cause and correction |
| --- | --- | --- |
| `common/page-helpers.ts:67–84` | TS2345; a `Page \| BlockNumber` argument was required to satisfy `Page & BlockNumber` at the page relation and pagination calls. | `genInputRange` was parameterized by the union of all paginated states; method signatures were intersected, though an individual call has one concrete page type. It now accepts the narrow structural pagination contract (one fetcher and relation over `Page`), infers `Page` from the state, and contains a single local cast for the persisted last-page value at that boundary. It no longer uses `narrowResult` to paper over the union. |
| `ckb/fetcher.test.ts:110` | TS2322; `string` was not assignable to connector argument type `` `0x${string}` ``. | The shared fixture hash helper widened its template literal return to `string`. Its return type now states the existing `0x`-prefixed fixture contract. |
| `ckb/fetcher.test.ts:166` | TS2322; factory union’s `readData` operation result could not be assigned to the EVM-specific operation type. | `genSyncProtocols` returns a union of protocol states. The restart test now narrows with `instanceof CkbSyncState` before using the concrete CKB fetcher, preserving the factory restoration test. |
| `ckb/fetcher.test.ts:166` | TS2554; `readData` required the root conversion argument. | The test now passes the CKB state as the root conversion, matching the fetcher interface. |
| `ckb/fetcher.test.ts:169` | TS2339; `page` was not a property of the union’s output. | Same union-narrowing cause; accessing the resumed page occurs after narrowing to CKB state/fetcher. |

These arose in integration-added CKB code and the shared pagination helper as the CKB state joined the protocol union. The helper correction also type-checks through existing EVM and NTP callers. No CKB pagination, connector, or fetcher-test diagnostics remain. The pass does report the same missing-`pg` declaration diagnostic at the new CKB state's `pg` type import as it does at existing adapters; it is classified below as a shared dependency declaration issue, rather than a CKB type-contract error.

### Files changed for the first remediation

- `packages/node-sdk/sync/src/sync-protocols/common/page-helpers.ts`: give the helper the per-call page/fetcher/relation contract and keep the persisted-page narrowing local.
- `packages/node-sdk/sync/src/sync-protocols/ckb/fetcher.test.ts`: type the prefixed hash fixture and narrow restored factory state before using CKB-specific methods.
- `docs/CKB_UPSTREAM_COMPATIBILITY_REPORT.md`: record this audit and its results.

### Verification results from the first remediation

| Check | Result |
| --- | --- |
| Reproduced strict TypeScript command above (TypeScript 7.0.2) | **Exit 1 on non-CKB diagnostics; zero diagnostics in `page-helpers.ts` or `ckb/`.** The previous audit’s exact invocation could not be recovered, so this is a documented reproduction, not a claim that an unknown command was rerun verbatim. |
| `bun test packages/node-sdk/sync/src/sync-protocols/ckb/fetcher.test.ts` | Passed: 4 tests, 25 assertions. |
| `bun test packages/node-sdk/sync/test` | Passed: 111 tests, 532 assertions across 12 files. |
| `bun test packages/effectstream-sdk/config/test/ckb-schema.test.ts` | Passed: 2 tests, 8 assertions. |
| `bun test packages/node-sdk/runtime/test/reproduction/ckb-fork-fail-closed.test.ts packages/node-sdk/runtime/test/reproduction/ckb-relay-outbox-postgres.test.ts` | Both tests skipped by their environment gates; none passed or failed. PostgreSQL fork/outbox behavior was not freshly exercised. |
| `bun test e2e/evm` | Passed: 13 tests, 15 assertions. |
| `bun test apps/ckb-relay-dashboard/src/server.test.ts` | Passed: 4 tests, 19 assertions. |
| `bun build apps/ckb-relay-dashboard/src/server.ts --target=bun --outdir=/tmp/ckb-relay-dashboard-build` | Passed: 40 modules bundled. Output is outside the repository. |
| `bun run --cwd packages/effectstream-sdk/config typecheck` | Passed using the package’s baseline-aware script (filters its two exact pinned diagnostics). |
| `git diff --check` | Passed. |
| Frozen install | Not rerun; dependency files were not changed for this remediation. |
| Live CKB-to-EVM acceptance | **Not rerun.** The acceptance evidence in the earlier report is historical only. The strict pass still has unrelated diagnostics, so the live workflow gate was not reached. |

### Remaining strict diagnostics

The strict reproduction still exits 1 on non-remediation diagnostics: TS2536 in config primitive typing; three TS2503 missing `opentelemetry` namespace declarations; TS7016 missing `pg` declarations in database and sync files (including the new CKB state's type-only import, with the same diagnostic in existing adapters); TS18048 and TS2345 around optional `latestHeight` in unchanged Midnight state; and TS2322 `Uint8Array<ArrayBufferLike>` versus `Uint8Array<ArrayBuffer>` in unchanged UtxoRPC code. These are unrelated to CKB's pagination/fetcher typing; the `pg` declaration issue is shared dependency typing. This run did not compare a strict upstream-baseline checkout, so it does not claim these errors predate the upstream merge.

The status and verification results above are historical. The final audit below supersedes them.

## Final verification and PR readiness audit — 2026-11-11

**Status: PARTIAL — NON-CKB UPSTREAM ISSUES REMAIN**

### Preserved working state

- Branch: `feat/ckb-native-sync-upstream-integration`.
- `HEAD` and `origin/v-next`: `cd3db259b2b0039f349ceda9fc046290c83235ab`.
- Published baseline ref: `14c27d58c247eec53b3b37c54ea62d3e1af2c0cf` (unchanged).
- Connector pin in manifest and lockfile: `5a0d30adb682f4de282be7eb794eda0a845c302a` (unchanged).
- The original staged integration remains staged: 65 paths. Five paths have follow-up unstaged edits: `bun.lock`, this report, `packages/node-sdk/sync/package.json`, `packages/node-sdk/sync/src/sync-protocols/ckb/fetcher.test.ts`, and `packages/node-sdk/sync/src/sync-protocols/common/page-helpers.ts`. No reset, stash, commit, rebase, or push was performed.
- No deleted upstream paths or repository-local generated artifacts were found. The acceptance evidence and dashboard builds are under `/tmp`, outside the repository.

### TypeScript command and comparison

The original audit command could not be recovered from repository scripts, CI configuration, reflogs, or available command logs. The earlier `bunx tsc` reproduction used TypeScript 7.0.2; the repository lockfile instead resolves TypeScript 5.9.3 for the config package. The repository's root tsconfig has `strict: false`; CI does not run a strict TypeScript command. The only relevant package script is `bun run --cwd packages/effectstream-sdk/config typecheck`, which runs TypeScript 5.9.3 with `strictNullChecks` and filters two documented baseline diagnostics. That script passed.

For a reproducible strict comparison, I ran the same command with the locked TypeScript 5.9.3 binary on the integration branch and in a clean detached worktree at upstream `v-next`:

```sh
packages/effectstream-sdk/config/node_modules/.bin/tsc --noEmit --strict --skipLibCheck \
  --moduleResolution bundler --module esnext --allowImportingTsExtensions \
  --target esnext --types bun-types \
  packages/node-sdk/sync/src/sync-protocols/common/page-helpers.ts \
  packages/node-sdk/sync/src/sync-protocols/ckb/fetcher.test.ts
```

The integration command exits 2 with 16 diagnostics, none in `page-helpers.ts` or the CKB fetcher/state/tests. The clean upstream command (without the CKB-only test file) reproduces the remaining config, OpenTelemetry, database `pg`, Midnight, and UtxoRPC diagnostics. Upstream also reports missing `pg` declarations in its existing sync adapters; the new sync `@types/pg` development dependency now resolves those occurrences in the integration branch. The newly added CKB state initially showed TS7016 for `pg`; inspection showed `pg` was a runtime dependency but `@types/pg` was not declared by the sync package. I added `@types/pg` `^8.15.5` as a sync development dependency; the frozen lock resolves 8.23.1. This clears the CKB state diagnostic and corresponding strict diagnostics across sync adapters without casts or compiler suppression. It does not fix the unrelated database package diagnostics.

| Remaining diagnostic in the strict reproduction | Root cause and source comparison | Scope |
| --- | --- | --- |
| `packages/effectstream-sdk/config/src/schema/primitive/types.ts:25:14` — TS2536 | `SyncProtocol` is constrained by `keyof ProtocolPrimitiveMap`, which TypeScript cannot prove is also a key of `ProtocolPayloadMap`. This line and diagnostic exist at the same upstream SHA; the package's baseline-aware script filters this exact error. The CKB map entry does not create it. | Production type; upstream baseline, not a CKB regression. |
| `packages/effectstream-sdk/log/src/otel/setup.ts:73:11`, `74:21`, `94:22` — TS2503 | These declarations reference a global `opentelemetry` namespace that the strict invocation does not load/resolve. The file is unchanged from upstream and the same three errors reproduce there. | Production typing; upstream baseline. |
| `packages/node-sdk/db/migrations/system-version.ts:1:29`, `packages/node-sdk/db/scripts/apply-migrations.ts:3:29`, `packages/node-sdk/db/src/capabilities.ts:1:33`, `dynamic-tables.ts:5:33`, `event-indexing.ts:1:33`, `pg-connection.ts:1:53` and `2:16`, `register-events.ts:1:33`, `system.ts:3:39` — TS7016 | `@effectstream/db` declares runtime `pg` but has no direct `@types/pg` declaration. These imports/files are present in upstream and reproduce there. The CKB state's matching diagnostic was fixed by declaring the type package in `@effectstream/sync`. | Production typing; remaining errors are upstream database package issues. |
| `packages/node-sdk/sync/src/sync-protocols/midnight/state.ts:102:24` — TS18048; `109:7` — TS2345 | `latestHeight` is possibly undefined under strict null checks before numeric comparison/use. Both lines are unchanged in upstream and reproduce there. | Production code; upstream baseline, not CKB. |
| `packages/node-sdk/sync/src/sync-protocols/utxorpc/WatchMultiplexer.ts:315:11` — TS2322 | `Uint8Array<ArrayBufferLike>` is assigned where the inferred target requires `Uint8Array<ArrayBuffer>`. The file is unchanged in upstream and reproduces there. | Production code; upstream baseline, not CKB. |

The three TS2503 errors plus the grouped TS7016 locations, TS2536, the two Midnight errors, and UtxoRPC TS2322 are all current strict diagnostics. CI's `.github/workflows/main.yaml` runs tests, frontend build, and generated-asset checks; it does not run this repository-wide strict command. Therefore the strict baseline errors are recorded, not represented as CKB fixes or as CI failures.

### PostgreSQL fork/outbox tests

The skip gate is `process.env.PGLITE === "false" && postgresAvailable()` in both test files. I ran them with `PGLITE=false REPRO_PG_BINDIR=/usr/lib/postgresql/18/bin`. The harness created an isolated PostgreSQL 18.6 cluster on a dynamically selected loopback port, created isolated test databases, and ran the runtime migrations. It explicitly sets the documented `ALLOW_NO_PG_IVM=true` fallback: `pg_ivm` is unavailable on this host, but is optional for these test paths under that documented real-PostgreSQL fallback.

Result: 2 passed, 0 failed, 29 assertions across the fork fail-closed and relay outbox tests. The harness stopped its cluster and removed its temporary `repro-pg-*` data directory. The pre-existing host PostgreSQL process (PID 1505, `/var/lib/postgresql/18/main`) remained up and accepting connections on 5432; it was not used or modified.

### Fresh CKB-to-EVM live acceptance

The established workflow was rerun on the final dependency state with `REPRO_PG_BINDIR=/usr/lib/postgresql/18/bin`. Evidence is at `/tmp/ckb-relay-dashboard-live-w7D6aW/` (summary JSON, service logs, dashboard API evidence, screenshot, and stopped isolated database data). It used OffCKB 0.4.13, CKB 0.208.0, PostgreSQL 18.6, and a loopback-only database on port 55432.

- The EVM/CKB E2E runner passed 50 tests, 0 failed, 0 skipped.
- Source CKB transaction `0x2d432495617af69158029a7f97fe13e5ab2bad96ab01e7ec9f87a16cc19c91f6` was observed at block 3, hash `0x43f02339ed7be2115012ae82e7402ef702ed703672b39efa3a5f13758d8a1f93`.
- The transfer produced two matching cell events and exactly two confirmed outbox intents / distinct successful destination transactions on chain 31337:

| Cell output | Event ID | EVM transaction (receipt block) | Persisted, calculated, and on-chain payload hash |
| --- | --- | --- | --- |
| 0 | `ckb-cell-created:2f9a8b5d70b53c09ee4fff7556b2897528589c3f2b38eb28441c0922b83b352c` | `0x3743c48ef4d384b31a6de9925a1ce06c539d7fcf05851dd9b273425a99a2efe8` (74) | `0xb6fc9b1eb4d9dd45fd2be331f54218d3fcc873f4d8683e88107459946fe85d74` |
| 1 | `ckb-cell-created:6a58875990e3bd02360e9c8fc23a2494c67c7e86a0a5b5f0ee8f5c9f99451f07` | `0xe1441d78174ee447ec92c7e9cdac2855f8bd0437d5077b0611ad2542a7b28065` (76) | `0xc71231179f4e530396b3de6b8f0e363cad63581cda7d399631b9ad61f77c3eeb` |

Both persisted receipts were `success`; the acceptance test compared each stored hash with its independently calculated and on-chain contract hash. The sync advanced through the source event; dashboard status showed CKB RPC, PostgreSQL, and chain 31337 connected. Dashboard API/render checks, dashboard restart, and worker restart passed. After restart, the selected event still had one outbox row and one distinct transaction.

Cleanup stopped OffCKB, dashboard, E2E services, and the temporary PostgreSQL server; the post-run check found all configured ports free and no temporary PostgreSQL PID file. The isolated database data and evidence remain under `/tmp` for audit. The host PostgreSQL service remained available.

### Final regression and repository checks

| Check | Result |
| --- | --- |
| `bun install --frozen-lockfile` | Passed: 1,711 installs checked across 1,749 packages; no changes required. |
| `bun run assets:check` | Passed for database and EVM remapping asset bundles. |
| CKB fetcher tests | Passed: 4 tests, 25 assertions. |
| Shared sync regression tests | Passed: 111 tests, 532 assertions across 12 files. |
| CKB config tests | Passed: 2 tests, 8 assertions. |
| Baseline-aware config typecheck | Passed; its two exact baseline diagnostics are filtered by the existing script. |
| CKB runtime snapshot tests | Passed: 4 tests, 6 assertions. |
| PostgreSQL fork/outbox tests | Passed: 2 tests, 29 assertions. |
| EVM regression tests | Passed: 13 tests, 15 assertions across 16 files. |
| Dashboard API tests and build | Passed: 4 tests, 19 assertions; 40 modules bundled. |
| Fresh live EVM/CKB acceptance | Passed: 50 tests, 0 failed/skipped; two successful relay executions verified. |
| `git diff origin/v-next --check` and `git diff --check` | Passed. |

Connector SHA, upstream base, published baseline, and staged integration snapshot are unchanged. No regression was detected. The CKB-specific strict errors and the new CKB `pg` declaration error are resolved. The overall status remains **PARTIAL — NON-CKB UPSTREAM ISSUES REMAIN** because the stricter-than-CI TypeScript reproduction still exits nonzero on the upstream-baseline diagnostics listed above; those upstream issues were not altered as part of CKB remediation.
