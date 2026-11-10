# Native CKB sync integration

This adapter adds CKB as a parallel source in EffectStream's native synchronization service. It uses the existing protocol config registries, `genSyncProtocols`, `BaseDataFetcher`, `SyncState`, orchestration merge, primitive transition, and per-output resume marker. It does not start a second polling loop or publish a separate event queue.

## Configuration

The network schema accepts only `devnet`, `testnet`, or `mainnet` and requires `rpcUrl` and the expected 32-byte `genesisBlockHash`. A CKB parallel protocol requires a name, `startBlockHeight`, polling interval, confirmation depth, reorganization window, and a target script with an explicit `lock` or `type` role. `stepSize` cannot exceed `reorgWindow`. The current adapter supports exactly one configured primitive entry per CKB protocol.

Example protocol and primitive entries:

```ts
{
  name: "ckb-devnet",
  type: ConfigNetworkType.CKB,
  rpcUrl: "http://127.0.0.1:8114",
  network: "devnet",
  genesisBlockHash: "0x<64 hex characters>",
}

{
  name: "ckb-cell-created",
  type: ConfigSyncProtocolType.CKB_RPC_PARALLEL,
  startBlockHeight: 0,
  pollingInterval: 3_000,
  confirmationDepth: 6,
  reorgWindow: 24,
  stepSize: 24,
  targetScript: {
    role: "lock",
    script: { codeHash: "0x<64 hex characters>", hashType: "type", args: "0x1234" },
  },
}

{
  name: "cell-created",
  type: "CKB:CellCreated",
  startBlockHeight: 0,
  stateMachinePrefix: "cell-created",
}
```

The full v1 event is carried as the primitive output payload. Capacity and output index remain decimal strings, and transaction, block, script, and data hashes remain full `0x` values. The shared `contractAddress` metadata field is left unset for CKB: consumers expose and match that field as an address, while a CKB script hash is not an address. The matched script hash remains available in the event payload. The CKB event does not imply an application action or trustless proof.

EffectStream's page-height and block-number types are JavaScript numbers. The CKB adapter checks block heights and timestamps against `Number.MAX_SAFE_INTEGER` and rejects values it cannot represent without loss. It adds CKB-specific block-number and block-hash nominal types to `@effectstream/utils`. Since the upstream config has no registered CKB CAIP-2 namespace, its local namespace is `ckb:` plus the full 64-hex configured genesis hash. This local identifier distinguishes different genesis hashes; it is not a claim of formal CAIP-2 registration.

## Cursor, failures, and canonical changes

The native CKB page contains `{ height, cursor }`. The page relation compares heights; the cursor contains the observer's bounded block checkpoints, retained event IDs, and pending invalidations. The fetcher asks the observer to scan through one height at a time, so each native output carries the cursor for that block. EffectStream persists that marker with the root block transaction. On restart, the restored page resumes at the next height. A failed block parse returns no last page, so the same range is retried.

Before waiting for another height and before reading each block, the adapter checks committed checkpoint hashes. A changed checkpoint fails closed, even when the replaced block had no matching cell. By the time this is detected, earlier root block transactions and their primitive/state-machine transitions may already be committed. The affected data can include root block hashes, primitive accounting rows, state-machine changes, scheduled inputs, and pagination cursors. Which rows exist depends on the primitive and when the mismatch is found.

The runtime has no transaction to reverse already committed root or state-machine effects. There is not yet a validated production recovery procedure. On detection, stop the affected sync/runtime process and preserve a database backup or snapshot before investigation. `startSync` catches `readData` errors, logs them, sleeps, and retries; it does not terminate the process, so an operator must stop it explicitly while investigating. Use the error's checkpoint height and protocol name, read the corresponding `effectstream.sync_protocol_pagination` row and its `page` JSON cursor, then compare retained CKB checkpoint hashes against canonical headers with read-only RPC calls. The potential source range starts at the first changed checkpoint and extends through the highest CKB height already committed for that protocol. Cross-reference those heights with persisted root block hashes and application-specific primitive/accounting records; the cursor's retained event IDs help only while retained, and the runtime does not provide a universal event-to-effect index. Validate any proposed repair against a copy of the database and the application's own state model before separately authorizing production recovery. Do not delete pagination, root, accounting, or state-machine rows as a generic repair.

### Recovery runbook candidate (not production-validated)

The safest currently supportable recovery is a database restore or full rebuild, not an in-place cursor rewind:

1. Stop every process that can read or write the affected database. Preserve a forensic copy of the live database, logs, runtime configuration, CKB RPC endpoint, and the CKB failure message. Do not restart against the replacement chain.
2. Identify the earliest changed retained checkpoint and determine the highest root block whose committed resume marker includes the affected CKB protocol. Compare that range with the application-specific outputs and any external actions triggered from them.
3. Choose a consistent database snapshot from before the first affected root effect. Restore it into a separate database using `pg_restore`, and configure a separate EffectStream instance to use that database. Never overwrite the only copy of production data during rehearsal.
4. Point the isolated instance at the canonical CKB RPC and replay from the restored marker. Compare root block hashes, primitive/state-machine state, and application-specific accounting against an independently derived expected result. Reconcile any external effects (for example, submitted transactions) separately; a database restore cannot undo them.
5. Cut over only after the restored instance and application owner verify the replay. If no suitable pre-incident snapshot exists, rebuild into a new database from the configured start height and perform the same comparisons. Keep the original database read-only until reconciliation is complete.

This procedure is an operational proposal based on the runtime's atomic block commits and documented PostgreSQL snapshot restore support. It has **not** been exercised end to end with a deliberately reorganized CKB history, a production-shaped database, and application-specific external effects. No SQL cursor deletion/update procedure is approved or provided. Production recovery validation remains an acceptance blocker.

The confirmation depth and bounded window are risk controls, not finality guarantees. Until a recovery procedure is validated for the deployed application, this failure mode remains an operational limitation and the acceptance gate remains open.

## Package boundary and reproduction

The upstream change is based on `5604043213df01beccebe253fbb479e387a514bb` in branch `feat/ckb-native-sync`; the original pinned checkout remains clean and untouched. The sync package uses a Bun Git dependency pinned to connector commit `c07f860030dd5c94725e66ad58c57e0a5b0a8bd0` from `https://github.com/bratipah/ckb-multichain-connector.git`. The commit is present on the connector's `main` and `feat/ckb-effectstream-sync` refs. The repository's release workflow pins Bun 1.4.0. The lockfile preserves its v1 format and records the Git dependency, package integrity, and `@noble/hashes` resolution for this commit. A clean copied worktree with no `node_modules` and no sibling connector passed `bun install --frozen-lockfile --ignore-scripts` with Bun 1.4.0. See Bun's [Git dependency guide](https://bun.sh/guides/install/add-git) and [install documentation](https://bun.sh/docs/pm/cli/install).

From an EffectStream checkout with Bun 1.4.0, as pinned in CI:

```sh
bun install --frozen-lockfile
bun test ./packages/effectstream-sdk/config/test
bun test ./packages/node-sdk/sync/src/sync-protocols/ckb/fetcher.test.ts
bun test ./packages/node-sdk/runtime/test/config-snapshot.unit.test.ts
cd packages/effectstream-sdk/config && bun run typecheck
cd ../../..
bun test ./packages
```

The repository has no root lint script or sync package typecheck script. The config package's typecheck script filters two known baseline diagnostics and fails on new diagnostics. To export a review patch from the local worktree, use:

```sh
git format-patch --stdout 5604043213df01beccebe253fbb479e387a514bb..feat/ckb-native-sync
```

The connector Git dependency is immutable by commit SHA and does not require a sibling checkout. At the time of the recorded verification, the EffectStream changes remained local to `feat/ckb-native-sync`; no push or package publication had yet been performed.

## Verification status and next work

The reproducible live smoke script is `packages/node-sdk/sync/scripts/ckb-live-smoke.ts`. With OffCKB running, confirm readiness, save the disposable local account 0 test key to a private temporary file, and scan:

```sh
offckb node --daemon
offckb devnet info --json
offckb accounts --show-private-keys 2>/dev/null | awk '/^privkey: / { print $2; exit }' > /tmp/effectstream-offckb-account0.key
chmod 600 /tmp/effectstream-offckb-account0.key
bun run packages/node-sdk/sync/scripts/ckb-live-smoke.ts scan /tmp/effectstream-ckb-live-cursor.json
```

Read account 0's address from `offckb accounts`, submit a real matching devnet output with OffCKB, and resume in a separate process using the returned transaction hash:

```sh
offckb --json transfer <account-0-address> 1 --privkey-file /tmp/effectstream-offckb-account0.key
bun run packages/node-sdk/sync/scripts/ckb-live-smoke.ts resume /tmp/effectstream-ckb-live-cursor.json <transaction-hash>
offckb node stop
rm /tmp/effectstream-offckb-account0.key
```

The default RPC is OffCKB devnet, and the script reads the genesis hash from block 0 and filters the funded account 0 lock script. Override these with `CKB_RPC_URL`, `CKB_GENESIS_BLOCK_HASH`, `CKB_TARGET_SCRIPT_ROLE`, `CKB_TARGET_SCRIPT_CODE_HASH`, `CKB_TARGET_SCRIPT_HASH_TYPE`, and `CKB_TARGET_SCRIPT_ARGS` when needed. It exercises the native fetcher and `CkbSyncState` page/resume mapping. Signing is performed only by the external OffCKB devnet transfer command with its disposable test key; the observer remains read-only.

On 2026-10-24, OffCKB 0.4.13 reported ready at `http://127.0.0.1:8114`. The initial process scanned blocks 0–117 and persisted native resume marker 117. The scan included the real genesis cell at transaction `0x1bb87da347a776a927ab6593e1e10304ca195f8e24279f039008d5e3115b1bf7`, output index `22`, event ID `ckb-cell-created:a9f4e60852f0c16781125bb8f9165c4c51227a98c5bb9016bbc73dd254087f17`. After restart, a real OffCKB transfer committed as transaction `0x1b069dfee0224ca98ad615863976aeba56a20ba63610eaef817fa20915956701`; the resumed scan found both matching outputs at block 126, hash `0x2e4fcc574a9e3f81a358672ebe2e501eafaa93743dc7418d1c2eac309352e844`, with event IDs `ckb-cell-created:ce5fbbb5172ab3e8c38b1142afed69865f0dbf3c59a8630e8cba0a3774a1b409` and `ckb-cell-created:71ccc36182ea1735bcf4c1aa842102c5cd31ca35fd7ab09bda3c3921e8b80bd3`, outpoint indexes 0 and 1. It emitted zero previously retained event IDs and advanced the marker to 126. This live check exposed and fixed the connector parser's assumption that RPC transactions always carry an `inner` object; the flattened `get_block_by_number` transaction shape is now covered by a connector regression test.

The clean-copy EVM rerun initially stopped before test execution because Forge's solc 0.8.37 installation exceeded the runner's 120-second `generate-evm-mod` wait. After caching that compiler with `forge build --use 0.8.37`, the independent frozen-install copy passed the EVM runner: 39 passed, 0 failed, 0 skipped. Reproduce with Foundry on `PATH`, warming the compiler first if needed:

```sh
forge build --use 0.8.37 --root e2e/shared/contracts/evm
E2E_MAX_RETRIES=0 bun run e2e/runner.ts evm
```

This check validates the EVM suite; its passing result does not validate CKB reorganization recovery.

Sequential broad-suite comparison on Bun 1.4.4: the pinned baseline ran 610 tests (602 passed, 4 skipped, 4 failed, 2 errors); the integration ran 617 tests (609 passed, 4 skipped, 4 failed, 2 errors). The identities match: two `pool-error-tracker` timing assertions fail, and two unhandled import errors occur (`effectstream-sdk/utils/src/runtime.ts` does not export `test`; `db-emulator/patch-emulator.ts` cannot resolve `@effectstream/sm`). The seven added CKB tests pass. The final independent frozen-install copy passed config (26), CKB fetcher (4), and runtime snapshot (4) tests, plus the config package's baseline-aware typecheck. The final independent EVM E2E rerun passed 39 tests after solc 0.8.37 was cached.

The Linux database harness resolves PostgreSQL 18, 17, or 16 and sets `ALLOW_NO_PG_IVM=true`; PostgreSQL 16 is therefore sufficient for its real-PostgreSQL consistency tests without the optional `pg_ivm` extension. PostgreSQL 16 binaries were extracted into a temporary directory without installing system packages. The existing consistency test passed on that isolated server (2 passed, 0 failed), covering deterministic persistence and restart equivalence. It does not exercise a CKB fork or restore-and-replay recovery. The latest live-smoke availability check found no RPC at `127.0.0.1:8114`, so the prior OffCKB evidence above was not refreshed. The config package's baseline-aware typecheck passes; EffectStream has no root lint script or sync package typecheck script.

Milestone 4's local trusted-relayer demonstration, destination contract, transaction adapter, and reproducible E2E are documented in [CKB-TO-EVM-M4.md](./CKB-TO-EVM-M4.md). It does not change Milestone 3's recovery status: restore-and-replay remains unvalidated against persisted CKB-driven application state and application external-effect reconciliation. The recovery procedure in this runbook remains an operational proposal, not a production-validated recovery.

## Milestone 3 acceptance review (2026-10-26)

### Recovery requirements map and implementation decision

The repository does not currently satisfy the prerequisites for an isolated canonical rebuild. No recovery command or database rewind was added: invoking `processFinalizedBlock` against a database with prior History A effects would layer History B on top of state derived from A.

| Recovery concern | Current behavior and evidence | Recovery consequence |
| --- | --- | --- |
| CKB observation and fork detection | `CkbFetcher.readData` observes one height at a time through the read-only connector, carries a bounded cursor of checkpoints/event IDs, and compares retained checkpoints before polling/reading. `CkbSyncState` restores the latest `sync_protocol_pagination` page. The runtime commits each page marker with the containing root block. A detected replacement throws and does not rewind already committed blocks. | Detection is fail-closed, but it only identifies a conflict. It does not locate a universally safe root rewind boundary or reconstruct earlier committed blocks. |
| Per-block atomicity and persisted core state | `processFinalizedBlock` wraps root rows, primitive transitions, application state transitions, input-result rows, schedules touched by that root block, and `upsertPage`/`removePages` in one PostgreSQL transaction. System tables include `effectstream_blocks`, `primitive_accounting`, `sync_protocol_pagination`, `rollup_inputs` and its future/result/origin tables, `nonces`, `accounts`, `addresses`, `achievement_progress`, event registration/indexing, and migration/version history. Applications may add arbitrary tables/views/materialized views and migration effects. | SQL failure before commit rolls back that block. This does not undo prior committed roots, discover every application-owned table, or provide a canonical state rebuild mechanism. IVM/materialized views and user migrations must be replayed with the same supported configuration and ordering. |
| Replay input retention | CKB RPC blocks and matched outputs can be fetched again while the selected RPC serves the desired canonical history; the connector cursor retains only a bounded checkpoint/event-ID window. It is not a durable archive of every observed block or event. Root hashes and primitive payloads persist only where the primitive emitted them. Processed `rollup_inputs` are deleted by `deleteScheduled`; foreign-key cascades remove associated input results and origins. Consequently, scheduled input payloads, their original order/identity, and some execution metadata are not guaranteed to survive for a rebuild. | A source database snapshot alone is not a guaranteed replay journal. A node archive plus a durable, immutable input journal and a consistent replay start/snapshot point are prerequisites. Re-fetching from a live RPC is only a reconstruction source if the operator can verify complete canonical history for the required range. |
| Determinism and replay duplication | Primitive accounting inserts deduplicate identical `(primitive_name, effectstream_block_height, payload_hash)` rows, but that is not a general state transition idempotency contract. Processing a replacement block at the same root height can conflict with existing root keys, while processing later roots can apply transitions over stale application state. Scheduled execution records use generated IDs and `processFinalizedBlock` currently generates a random-looking transaction hash; random state also depends on the root hash and input order. | Replaying into a populated database can fail, duplicate effects, or compute divergent results. Repeat recovery has no safe semantics until deterministic inputs/order and a fresh isolated target are enforced. |
| External effects | `main.ts` publishes built-in `RollupBlock`/`SyncChains` and successful application events after commit; sends are fire-and-forget with no durable outbox or delivery status. The runtime EVM RPC also accepts submitted raw transactions. Downstream listeners may act on messages, and the M4 relay can submit a destination-chain transaction from an event. The M4 relay is trusted and is not reverted by PostgreSQL restore. | Rebuild must run with publishers, consumers, transaction submitters, and credentials disabled or isolated. Existing effects need an application-specific delivery/action ledger and destination reconciliation; they cannot be inferred or undone from the source database alone. |
| Configuration and database ownership | Startup applies system migrations and records a sync protocol configuration snapshot; user migrations are scheduled by block height. The runtime opens its configured PostgreSQL pool and owns per-block transactions, while database backups/restores are operator-managed. The test harness can create isolated PostgreSQL databases and disable its MQTT broker, but it does not provide a production recovery/cutover controller. | A rebuild must pin the exact runtime, app config, schema/migrations, connector, and canonical RPC identity, and write only to a newly provisioned target. Cutover is an explicit operator action after comparison and application-owner validation. |

**Decision: M3 recovery is blocked.** The smallest safe architecture-level plan is to add (1) a durable replay journal for every consumed primitive event and scheduled input, including stable identity, ordering, source block/cursor, payload, and processing outcome; (2) a recovery mode that creates a fresh isolated database at a declared snapshot/start point, uses the production transition path with outbound events and all transaction submitters disabled, and never auto-starts normal sync; (3) a recovery manifest pinning canonical CKB genesis/RPC identity, block hashes, runtime/app versions, config, and migrations; (4) deterministic IDs/seeds/order or explicit nondeterminism capture for all replayed transitions; (5) a canonical state comparison/export covering all system tables, app-owned tables, derived views, and checkpoint rows against an independently initialized clean replay; and (6) an operator validation/cutover procedure plus durable reconciliation of previously published messages and submitted EVM transactions. Tests must exercise failure and repeat recovery against throwaway databases and prove that the source stays unchanged and no outbound effects escape. Until those prerequisites exist, retain the current fail-closed behavior and use a separately rehearsed, application-specific full rebuild; do not present the runbook candidate above as an implemented recovery.

| Criterion | Status | Evidence |
| --- | --- | --- |
| Immutable connector pin and remote refs | PASS | `packages/node-sdk/sync/package.json` and `bun.lock` point to `bratipah/ckb-multichain-connector` at `c07f860030dd5c94725e66ad58c57e0a5b0a8bd0`. `git ls-remote git@github.com:bratipah/ckb-multichain-connector.git HEAD refs/heads/main refs/heads/feat/ckb-effectstream-sync` reports `main`/`HEAD` at `ea92b536e9ceccc4496434cbdd71091523502caa` and `feat/ckb-effectstream-sync` at the pinned SHA. |
| Frozen install and focused regression evidence | PASS | The dependency-pin lockfile passed `bun install --frozen-lockfile --ignore-scripts` with Bun 1.4.0 in a clean copied checkout. The config, CKB fetcher, runtime snapshot, typecheck, and EVM E2E results below are from the earlier independent audit; this lockfile review did not rerun those suites. |
| Persisted-state CKB fork recovery | BLOCKED | `packages/node-sdk/runtime/test/reproduction/ckb-fork-fail-closed.test.ts` exercises the real CKB fetcher/state mapping and `processFinalizedBlock` against two isolated real-PostgreSQL databases. It verifies History A persistence, fork rejection with no DB mutation, root-transaction rollback, and a clean History B replay containing the replacement result. The History A database is intentionally not repaired: no rollback, restore/rebuild orchestration, or canonical replay API exists in the runtime. The test shows retained A differs from clean B; it does not claim recovery equivalence. |
| Lockfile review | RESOLVED | The manifest and v1 lockfile pin the immutable connector URL/SHA. The focused lock change updates the dependency spec, connector package row, and connector-scoped `@noble/hashes@1.8.0` resolution; it preserves unrelated package resolutions. Bun 1.4.0, the CI-pinned version, passed a frozen install in a clean copied checkout, and the CKB fetcher tests passed there using the resolved connector dependency. The committed baseline still has the prior local path in its lockfile, so the lock change is required for reproducible installation without the sibling connector checkout. |
| External effects | OPEN | The test keeps MQTT disabled and its CKB accounting probe has no state-machine output, so no downstream action is triggered. In production, `runtime/src/main.ts` publishes RollupBlock/SyncChains notifications and successful STF app events after `processFinalizedBlockWithRetry` commits; delivery is fire-and-forget and has no durable outbox/status row. CKB connector events carry stable `eventId` values inside the persisted accounting payload, but the generic dispatch path does not use them as an idempotency key. The CKB adapter and tested runtime path do not submit batches directly; app consumers may take irreversible actions after these notifications. Applications must deduplicate on that ID, persist dispatch intent where needed, and reconcile submitted actions against their destination before replay. PostgreSQL restoration cannot undo delivered MQTT messages or submitted actions. |

### Reproduction commands and recorded results

Commands and evidence reused from the latest independent clean-copy audit (Bun 1.4.4):

```sh
bun install --frozen-lockfile                 # exit 0
bun test ./packages/effectstream-sdk/config/test # 26 passed
bun test ./packages/node-sdk/sync/src/sync-protocols/ckb/fetcher.test.ts # 4 passed
bun test ./packages/node-sdk/runtime/test/config-snapshot.unit.test.ts # 4 passed
cd packages/effectstream-sdk/config && bun run typecheck # exit 0
E2E_MAX_RETRIES=0 bun run e2e/runner.ts evm # 39 passed, 0 failed, 0 skipped
```

The EVM run also required `forge build --use 0.8.37 --root e2e/shared/contracts/evm` to warm the compiler cache. The real-PostgreSQL consistency harness reported 2 passed, 0 failed, but is not recovery evidence. The new focused CKB fork test reported 1 passed, 0 failed, with 13 assertions. It commits History A through real `processFinalizedBlock` transactions, confirms History B detection leaves the History A DB unchanged, confirms a SQL error after root/accounting writes rolls back that transaction, and independently commits History B into another DB. The clean B rows contain the replacement transaction hash and checkpoint; they differ from retained A, as expected without recovery. The test compares `effectstream_blocks` root hashes, `primitive_accounting` payloads, and `sync_protocol_pagination` checkpoint/cursor JSON. It does not compare an A→B recovered DB to clean B because no recovery operation exists. The new test does not invoke the long-running `startSync`/`startMerge` loops; it uses the adapter, state mapping, and actual production root transaction API directly. No production reorganization recovery pass is claimed.

To run the focused test with the already extracted PostgreSQL 16 binaries on Linux (no system install), set the paths to your extracted package root:

```sh
PG16_ROOT=/path/to/extracted/postgresql/rootfs
PGLITE=false \
REPRO_PG_BINDIR="$PG16_ROOT/usr/lib/postgresql/16/bin" \
LD_LIBRARY_PATH="$PG16_ROOT/usr/lib/x86_64-linux-gnu" \
bun test packages/node-sdk/runtime/test/reproduction/ckb-fork-fail-closed.test.ts
```

This real-PostgreSQL test is skipped unless `PGLITE=false` and `initdb`/`pg_ctl` are available. Two preliminary invocations during implementation failed before assertions (first because `PGLITE=false` was omitted, then because the extracted PostgreSQL `libpq.so.5` was not on `LD_LIBRARY_PATH`); the final command above passed. `bun install --frozen-lockfile` was also rerun locally and exited 0, installing five packages. Run `git diff --check` after this review update.

The approved publication plan groups the work into native CKB sync and connector integration, durable CKB-to-EVM relay, E2E infrastructure and regression fixes, and the live relay dashboard. The connector dependency remains pinned to its immutable Git commit; the lockfile keeps Bun's v1 format and contains only the required dependency-resolution changes.
