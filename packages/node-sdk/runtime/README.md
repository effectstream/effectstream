# @effectstream/runtime

The state-machine runtime ties sync, state machine, database, events, and HTTP
API together inside an EffectStream node. `runEffectstream()` is the canonical
application entry: it accepts one built config and one `StateMachine`, owns the
process resources, and settles only after cleanup finishes.

- The state-machine runtime that owns an Effectstream node's process model.
- `runEffectstream(options)` is the canonical Promise entry for new and migrated applications.
- It owns structured startup, cancellation, signals, database, messaging, HTTP, telemetry, and cleanup.
- Public `init()` / `start()` remain transitional compatibility APIs for gradual migration.
- Also reachable through `@effectstream/node-sdk/runtime`.

## Install

```bash
bun add @effectstream/runtime
# or
npm install @effectstream/runtime
```

Import the canonical runner from `@effectstream/runtime`, or from the identical
`@effectstream/node-sdk/runtime` umbrella subpath.

## Standalone usage

This package owns the node's process model. For an ordinary async application,
pass the object returned by `ConfigBuilder.build()` and the application's one
`StateMachine` directly to `runEffectstream()`:

```typescript
import { runEffectstream } from "@effectstream/runtime";

await runEffectstream({
  appName: "my-app",
  appVersion: "1.0.0",
  config,
  stateMachine,
  apiRouter: async (server) => {
    server.get("/status", async () => ({ ready: true }));
  },
});
```

The five fields above are required. `config` is the built builder object—the
runner mechanically derives runtime sync information and does not introduce a
second topology schema. It binds the grammars from the configured primitives to
the same `stateMachine`, validates prefix coverage before sync, exposes that
grammar to HTTP metadata, and dispatches inputs through that object directly.
The built config and options are not mutated.

There are exactly four optional general controls:

```typescript
await runEffectstream({
  appName: "supervised-app",
  appVersion: "1.0.0",
  config,
  stateMachine,
  apiRouter,
  database: {
    type: "postgres",
    host: "127.0.0.1",
    port: 5432,
    user: "postgres",
    database: "app",
    password: "secret",
  },
  messaging: true,
  signal: abortController.signal,
  // Default is ["SIGINT", "SIGTERM"]; false delegates signals to a supervisor.
  processSignals: false,
});
```

`database` is exactly `{ type: "pglite"; dataDir?: string; port?: number }` or
`{ type: "postgres"; host: string; port: number; user: string;
database: string; password?: string }`. Omission is embedded PGlite.

This entry point is process-wide and one-shot. Concurrent calls reject with
`RunEffectstreamError` code `ALREADY_RUNNING`; calls after settlement reject
with `ALREADY_USED`. A caller abort rejects as `ABORTED` and keeps the abort
reason in `cause`, while configured process signals are successful controlled
shutdowns. Runtime or cleanup errors take priority and reject as `RUN_FAILED`;
its frozen, identity-deduplicated `failures` list contains the errors surfaced
by the runtime and cleanup boundaries. Invalid options fail before the one-shot
process slot is claimed. The helper never calls `process.exit()`.

The runner snapshots and restores exact presence/value for its eight owned
environment keys: `PGLITE`, `PGLITE_DATA_DIR`, `DB_HOST`, `DB_PORT`, `DB_USER`,
`DB_NAME`, `DB_PW`, and `MQTT_BROKER`. It does not write
`EFFECTSTREAM_API_PORT` or unrelated keys. In embedded mode it starts PGlite on
loopback, gives the existing pool the actual returned port, closes that pool
before `close({ force: true })`, and restores the environment after both. In
external PostgreSQL mode it starts or closes no database server. Distinct
runtime, pool, PGlite, and restoration failures remain available in
`RunEffectstreamError.failures`.

`messaging: true` enables both the local broker and outbound event publication;
omitted or false disables both even when ambient `MQTT_BROKER` says otherwise.
The runner owns configured process listeners and AbortSignal cleanup. A
third-party Promise may still have its own non-cancellable work, but the runner
does not settle until its owned telemetry, broker, HTTP, pool, and embedded
database resources have unwound.

## Canonical getting-started defaults matrix

These defaults are general application behavior. Application identity,
network selection, contract addresses, ledger schemas, transition logic, and
HTTP responses remain explicit application facts.

| Omitted input | Owner | Exact value or behavior | General rationale | Override | Persistence impact | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| Config namespace | Runtime | `config.securityNamespace ?? appName` | One stable application identity without repeating it in config | `ConfigBuilder.setNamespace(...)`; string and historical objects win unchanged | Namespace changes affect state separation; config is not mutated | `canonical-runner.test.ts`, `run-quiescence.test.ts` |
| NTP network name | Config | `"ntp"` | Conventional name and inferred `networks.ntp` key | Explicit unique `name` | Name is part of persisted protocol identity | `canonical-defaults.test.ts`, type fixture |
| NTP `startTime` | Config | One `Date.now()` sample when the network is added | Immediate useful clock for a fresh node | Explicit stable `startTime` | Persistent deployments must provide/persist a stable value; the convenience value is not a production genesis | `canonical-defaults.test.ts`, snapshot tests |
| NTP `blockTimeMS` | Config | `1_000` ms | Ordinary one-second application clock | Explicit `blockTimeMS` | Changes time-to-height mapping | `canonical-defaults.test.ts` |
| NTP servers | Sync integration | `ntp-time-sync` public-pool behavior | Works without private clock infrastructure | Network `servers` list | Does not replace the persisted NTP mapping | `ntp-config.test.ts` |
| Midnight network name | Config | `"midnight"` | Conventional name and inferred `networks.midnight` key | Explicit unique `name`; `networkId` always remains required | Name is part of protocol selection; no chain is silently selected | `canonical-defaults.test.ts`, type fixture |
| Deployment stage | Config | Typed empty deployment map | Read-only and address-in-config applications need no no-op stage | `buildDeployments(...)` for real mappings | Real mappings remain explicit persisted application facts | `canonical-defaults.test.ts` |
| NTP polling | Config/NTP | `1_000` ms | Matches its ordinary clock cadence | Protocol `pollingInterval` | Scheduling only | `canonical-defaults.test.ts` |
| Midnight polling | Config/Midnight | `6_000` ms | Matches the ordinary Midnight block cadence | Protocol `pollingInterval` | Scheduling only | `canonical-defaults.test.ts` |
| Midnight indexer | Config profile | Selected Midnight network's profile HTTP URL; Stagenet resolves to `https://indexer.stagenet.shielded.tools/api/v4/graphql` | Keeps service metadata with the selected network | Protocol `indexer` | Endpoint selection is explicit through `networkId` or override | `midnight-network-profile.test.ts`, migration tests |
| NTP page size | Config/NTP | `stepSize: 1_000` | Bounded ordinary clock pagination | Protocol `stepSize` | No start-boundary change | sync/config regression tests |
| Midnight page size/limit | Config/Midnight | `stepSize: 10`, `paginationLimit: 50` | Bounded public-indexer queries | Protocol fields | No start-boundary change | sync/config regression tests |
| Midnight finality wait | Config/Midnight | `confirmationDepth: 3`, `delayMs: 20_000` | Wait for the ordinary 2–3 block finality window plus latency | Protocol fields | Changes when data becomes eligible, not its stored start | sync/config regression tests |
| Per-request timeout | Config/sync | `15_000` ms where request/response integrations support it; NTP uses bounded UDP sampling | A blackholed endpoint must not stall forever | Protocol `requestTimeoutMs` | No persisted boundary change | sync timeout tests |
| Buffered pages | Sync | `max(4 × stepSize, stepSize + 1)` | Bounded catch-up without starving one fetch chunk | Protocol `maxBufferedPages` | In-memory only | `buffering.test.ts` |
| Primitive start | Runtime/config | Resolved numeric start of its owning protocol | Primitive and protocol observe one committed boundary | Explicit primitive `startBlockHeight` | Inherited numeric value follows snapshot restart rules | `config-snapshot.unit.test.ts`, `start-policy.unit.test.ts` |
| Midnight primitive network | Runtime/config | Owning Midnight network's `networkId` | Avoids repeating routing metadata | Explicit primitive `networkId` | Must remain compatible with the selected chain | `config-snapshot.unit.test.ts`, `start-policy.unit.test.ts` |
| Database | Runtime | `{ type: "pglite" }` | Zero external database setup for a fresh process | Complete PostgreSQL object or explicit PGlite object | Default data is in memory unless a data directory is selected | `canonical-runner.test.ts` |
| PGlite data directory | Runtime | Explicit option; else original nonempty `PGLITE_DATA_DIR`; else `"memory://"` | Easy ephemeral start with a clear persistence seam | `database.dataDir`, including `""` | `memory://` is not durable; supply a persistent directory when state must survive | `canonical-runner.test.ts` |
| PGlite gateway | Runtime/DB | Requested port or `0`; host `127.0.0.1`; pool receives actual returned port | Avoids fixed-port collisions and keeps the gateway local | `database.port` | No data-format impact | `canonical-runner.test.ts`, DB gateway tests |
| PGlite DB identity | Runtime | Original nonempty `DB_USER`/`DB_NAME`, else `"postgres"`; password absent | Compatible ordinary local credentials without ambient host/password control | Original nonempty values for embedded mode | Database/user select the stored namespace inside a persistent directory | `canonical-runner.test.ts` |
| Messaging | Runtime | Broker and outbound events both off | No message infrastructure or reconnect loop unless requested | `messaging: true` | Does not change indexed state | `canonical-runner.test.ts`, broker lifecycle tests |
| API port | Existing node environment | `EFFECTSTREAM_API_PORT`, else `9999`; runner leaves it untouched | Retains the common deployment/environment seam | Set `EFFECTSTREAM_API_PORT` | No database impact | `canonical-runner.test.ts`, HTTP lifecycle tests |
| Process signals | Runtime | `SIGINT` and `SIGTERM` | Structured CLI shutdown | `processSignals: false` or an explicit signal list | Cleanup completes before settlement | `process.test.ts` |
| AbortSignal | Caller/runtime | No caller signal | Ordinary CLI use needs no controller | `signal` | Abort does not bypass cleanup | `process.test.ts`, `canonical-runner.test.ts` |

While running, the runtime:

- Reads finalized blocks via `@effectstream/sync`.
- Routes batcher inputs through the passed `StateMachine`.
- Commits all yielded SQL inside a per-block transaction.
- Publishes lifecycle and app events via `@effectstream/event-server`.
- Serves the optional Fastify API.
- Emits OpenTelemetry traces and logs through `@effectstream/log`.

These resources are scope-owned. Telemetry registers SDK shutdown before it
starts. When the local MQTT broker is enabled, runtime startup awaits both of
its listeners before launching sync workers and shutdown awaits their release.
HTTP startup also owns a pending Fastify listen attempt, so halt during bind
waits for the attempt and cannot leave a late listener behind. Bind and cleanup
failures remain structural errors instead of being logged and swallowed.

## Inside EffectStream

`@effectstream/runtime` is the conductor: it does not define chain integrations
or queries itself, but every other node package is exercised through this loop.
The canonical options carry application facts plus the built config and state
machine. `StartConfig` remains the lower-level legacy runtime contract.

## Transitional legacy APIs

Public `init()` and `start(config)` remain behavior-compatible while maintained
callers migrate gradually. They are Effection operations and keep their existing
environment, null-prefix namespace, grammar/transition, migration, and resource
semantics. They are not a second recommended application entry and receive no
new canonical application behavior. New and migrated application entry points
should use `runEffectstream()`.

The former `runEffectstream({ staticConfig, startConfig })` aggregate shape is
replaced by the five required canonical fields and four optional controls above.
That options change is breaking for external callers; migrate topology into one
built config, pass one `StateMachine`, and let the runner own process resources.

## Empty-block coalescing (catch-up)

The runtime replays one Effectstream block per main-clock tick, each in its
own DB transaction. During a deep catch-up over an idle gap (e.g. an NTP main
chain at one block/second across days), most of those blocks are **empty** — no
on-chain content, no scheduled input, no migration — yet still cost a full
`BEGIN…COMMIT` round-trip.
Empty-block coalescing folds a run of consecutive empty blocks into a **single
transaction** that writes only the run's endpoint. It is **opt-in** and off by
default:

```bash
EFFECTSTREAM_COALESCE_EMPTY_BLOCKS=true
```

The lag threshold that defines "behind the chain tip" defaults to **20× the
main clock's block time** (falling back to 60 s when no `blockTimeMS` is
exposed by the network config). Override it with
`EFFECTSTREAM_LAG_THRESHOLD_MS` (milliseconds), e.g. for chains whose main
clock fires faster than the runtime can keep up with one transaction per block:

```bash
EFFECTSTREAM_LAG_THRESHOLD_MS=30000   # engage coalescing past 30 s of lag
```

Behavior and guarantees:

- **Catch-up only.** Coalescing engages only while behind the chain tip
  (`now - block.timestamp` greater than the lag threshold) and disengages at
  the tip, so steady-state stays one block per transaction.
- **Identical database.** A coalesced sync produces a byte-for-byte identical
  database to a non-coalesced one. Empty blocks already never advance the block
  hash or RNG seed, so only the endpoint's block row and the per-protocol resume
  watermark are written — exactly as the normal path would leave them.
- **Never skips work.** A run is flushed before any block that has on-chain
  content, a migration at its height, or a due block-height/timestamp-scheduled
  input — so nothing that mutates state is ever folded away.
- **Tip stays visible.** If the producer goes quiet on an empty tail, the run is
  flushed on a short idle timeout so the latest height still commits.
- A run is also capped (`MAX_EMPTY_RUN`) to bound transaction size and recovery.

Implementation: [`src/coalesce.ts`](./src/coalesce.ts) (the `createEmptyBlockCoalescer`
coordinator the main loop drives).

## Key exports

- `runEffectstream(options)` - canonical process-wide one-shot Promise runner.
- `RunEffectstreamError`, `RunEffectstreamOptions`,
  `RunEffectstreamDatabase` - canonical error, application, and database
  contracts.
- `init()` / `start(config: StartConfig)` - transitional Effection compatibility
  operations for gradual migration.

Types and helpers re-exported alongside `init` / `start`:

- `DBMigrations` - versioned SQL migrations passed into `start`.
- `StartConfig`, `StartConfigGameStateTransitions`, `StartConfigApiRouter` - `start`'s config types. Templates type-check against these implicitly but don't usually import them by name.
- `PrimitiveConstructor<T>` - extension point for new primitives.
- `VERSION` - `${number}.${number}.${number}` literal type for version pinning.
- Pagination helpers re-exported from `./api/pagination.ts`.

## Examples

Runnable public-surface examples live in
[`test/examples.test.ts`](./test/examples.test.ts); canonical lifecycle and
resource examples are covered by `canonical-runner.test.ts`.

End-to-end EVM sync test:
[`e2e/evm/sync/`](https://github.com/effectstream/effectstream/tree/main/e2e/evm/sync).

## Links

- Docs: https://effectstream.github.io/docs/packages/node/runtime
- Source: https://github.com/effectstream/effectstream/tree/main/packages/node-sdk/runtime
