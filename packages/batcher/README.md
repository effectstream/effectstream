# @effectstream/batcher-sdk

Effectstream's cross-chain input batcher. Accepts signed user inputs over HTTP, batches them per adapter, and submits each batch as a single on-chain transaction. Persists every input to storage before it acks, so a crashed batcher recovers without losing inputs.

- Storage is the source of truth. No in-memory pool; the batcher recovers from a restart by reading the same files (or DB rows) it wrote on accept.
- Per-adapter batching criteria: time window, size, value threshold, hybrid, or a function you provide.
- Pluggable everywhere: storage backend, blockchain adapter, batch builder, lifecycle listeners.
- Default chain adapters for Effectstream's L2, generic EVM (viem + Hardhat artifacts), Midnight, and Bitcoin regtest.
- Optional REST API on Fastify; bypassable if you want to drive the batcher from your own runtime.

## Install

```bash
bun add @effectstream/batcher-sdk
# or
npm install @effectstream/batcher-sdk
```

> **Midnight fee wallets:** the batcher tunes the dust wallet's sync batching
> for backend throughput via the `batchUpdates` config (supported natively by
> `@midnightntwrk/wallet-sdk-dust-wallet` >= 4.0.0). Override with the
> `MIDNIGHT_DUST_SYNC_BATCH_{SIZE,TIMEOUT_MS,SPACING_MS}` env vars.

### Midnight wallet sync and funding timeouts

A dust cold sync is the expensive part of starting a Midnight fee wallet: on
preprod it measures ~66 minutes (~1.44 M dust indices), while the unshielded
sync takes about a second. The three deadlines below are deliberately separate,
because "the chain is still replaying" and "nobody has sent this wallet any
NIGHT" want very different answers.

| Env var | Default | What it bounds |
| --- | --- | --- |
| `MIDNIGHT_WALLET_SYNC_TIMEOUT_MS` | `14400000` (4 h) | A full chain replay. A backstop, not a health check — a genuinely stuck sync is caught within ~60 s by emission-silence detection, so this only needs to exceed a real cold sync with headroom. Raise it for chains longer than preprod. |
| `MIDNIGHT_WALLET_FUNDING_TIMEOUT_MS` | `600000` (10 min) | Waiting for funds to arrive once the wallet is synced. Keep it short: an unfunded wallet should fail in minutes rather than inherit the sync budget. |
| `MIDNIGHT_DUST_REGISTRATION_PRECHECK_TIMEOUT_MS` | `600000` (10 min) | The NIGHT→dust registration precheck ("unshielded and dust are both strictly complete"). In `dust-only` sync mode the unshielded sub-wallet has been stopped, so this wait can never succeed — it exists to give up in bounded time. |
| `MIDNIGHT_DUST_STATE_SAVE_INTERVAL_MS` | `300000` (5 min) | How often a running wallet checkpoints its dust state. Bounds how much chain a crash makes it replay. `0` keeps only the shutdown checkpoint. |

A stalled sync is detected separately and much sooner: if the dust wallet stops
emitting state for 60 seconds the wallet is rebuilt from its last checkpoint and
the sync retried. That is a *silence* check, not an elapsed-time one, so a cold
sync that is progressing normally is never interrupted no matter how long it
takes.

### Midnight dust sync batching

The dust wallet's sync batching is tuned for backend throughput rather than UI
responsiveness. Dust sync runs on the main event loop, so these trade sync speed
against how responsive the rest of the process (including the HTTP server, which
accepts requests while wallets are still syncing) stays during a cold start.

| Env var | Default | Browser SDK default |
| --- | --- | --- |
| `MIDNIGHT_DUST_SYNC_BATCH_SIZE` | `100` | 10 |
| `MIDNIGHT_DUST_SYNC_BATCH_TIMEOUT_MS` | `1` | 1 |
| `MIDNIGHT_DUST_SYNC_BATCH_SPACING_MS` | `1` | 4 |

Larger batches mean fewer intermediate state snapshots and less memory churn.
Keep spacing above `0`: at `0` the catch-up sync starves everything else on the
loop.

**These defaults are now measured on preprod (1.44 M dust indices) and every
direction of change is worse for a process that serves HTTP while syncing.**
Raising `size` to 500 buys 21% throughput and costs 3.7× the worst event-loop
stall (430 ms → 1 577 ms); 2000 buys 18% and costs 3 814 ms, and is unreachable
anyway because the 1 ms batch window closes batches long before 2 000 events
arrive. Dropping `size` to 50 costs 12% throughput for a 246 ms worst stall —
offered as a deliberate latency-first setting, not a better default. `timeout`
1 → 25 is noise and 1 → 100 costs 5%. `spacing` 1 → 0 buys 2.4% and costs 5×
the median stall; 1 → 5 or 25 costs 3% for no tail-latency benefit.

Dust wallet state is checkpointed to disk (`dust-state/`, one file per network
and seed) so a restart resumes from the last snapshot instead of replaying the
chain. A snapshot recorded on another network, one that fails to decode after
an SDK upgrade, or one whose offset sits past the indexer's event log is
rejected: it is renamed to `<snapshot>.rejected` and the wallet cold-syncs.
That costs a resync, and it is logged at error level for exactly that reason —
but it never wedges wallet init, which is what those cases used to do.

### The HTTP port waits for adapters to be servable

Restoring a preprod dust snapshot is one **synchronous** WASM deserialize —
measured at ~46 s for 5.1 MB — during which no request handler can run at all.
The server used to be listening throughout, so every restart was a ~46-second
window where connections were accepted and nothing answered.

`Batcher.init()` therefore holds the port closed until every adapter that
implements `whenServable()` reports it is past that work, then starts the
server for the rest of startup — including the ~58-minute cold sync, which
yields between batches and stays serveable (and is precisely when `/health` and
`/queue-stats` matter most). A refused connection is a better answer than a
hung one: the client finds out immediately and can retry or fail over.

`httpServerReadinessTimeoutMs` (default `300000`, 5 min) bounds that wait; on
expiry the server starts anyway and says so. It is a backstop against a broken
adapter, not a startup knob — while the loop is inside a synchronous restore
this timer cannot fire either, so it effectively expires the moment the block
ends. Adapters that do not implement `whenServable()` are unaffected.

`getHealthInfo()` (served by `/queue-stats`) reports a `dustSync` entry per
wallet so a slow start is distinguishable from a broken one — `state` is
`syncing` / `stalled` / `complete` / `unknown`, alongside `restoredFrom` (0
means a full replay), `appliedIndex`, `target`, `behind`, `lastAdvanceAgeMs`,
and `snapshot` (`cold` / `restored` / `rejected`). `dustClock` reports whether
dust generation is being projected at wall clock (`live`) or has fallen back to
the wallet's last applied event (`sync-time`), which on a quiet chain can look
like starvation.

## Standalone usage

A minimal end-to-end example using `FileStorage`, the EffectstreamL2 adapter, and the bundled HTTP server.

```typescript
import { main, suspend } from "effection";
import {
  BatcherConfig,
  createNewBatcher,
  EffectstreamL2DefaultAdapter,
  FileStorage,
} from "@effectstream/batcher-sdk";

const adapter = new EffectstreamL2DefaultAdapter(
  "0x...",            // contract address
  "0x...",            // submitter private key
  0n,                  // fee
  "parallelEvmRPC_fast",
);

const config: BatcherConfig = {
  pollingIntervalMs: 1000,
  enableHttpServer: true,
  confirmationLevel: "wait-effectstream-processed",
  enableEventSystem: true,
  port: 3334,
};

const storage = new FileStorage("./batcher-data");

main(function* () {
  const batcher = createNewBatcher(config, storage);

  batcher.addBlockchainAdapter("effectstream-l2", adapter, {
    criteriaType: "time",
    timeWindowMs: 1000,
  });

  batcher.addStateTransition("startup", ({ publicConfig }) => {
    console.log(`batcher up, polling every ${publicConfig.pollingIntervalMs}ms`);
  });

  yield* batcher.runBatcher();
  yield* suspend();
});
```

That accepts inputs on `http://localhost:3334`, batches them on a 1s window, submits via the adapter, and stays up until you cancel the operation.

### Submitting an input

```bash
curl -X POST http://localhost:3334/send-input \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "address": "0x...",
      "addressType": 0,
      "input": "myGameInput",
      "signature": "0x...",
      "timestamp": "1234567890"
    },
    "confirmationLevel": "wait-receipt"
  }'
```

The input is wrapped in a `data` object. `addressType` is the numeric `AddressType`, and `timestamp` is a string. `confirmationLevel` is one of `no-wait`, `wait-receipt` (default), or `wait-effectstream-processed`; an optional `timeoutMs` bounds receipt confirmation.

`timestamp` must be recent — see [Request tracking](#request-tracking). Both epoch milliseconds (`"1734000000000"`) and ISO-8601 (`"2026-08-18T12:00:00.000Z"`) are accepted.

Every 200 carries a `requestId`:

```json
{
  "success": true,
  "message": "Input queued for batching",
  "inputsProcessed": 1,
  "requestId": "3f9a…64 hex chars"
}
```

`signature` is required for the EVM and Cardano adapters. Adapters that override `verifySignature` (Midnight and Solana, for example) accept inputs without it but must implement their own check - the Solana adapter verifies the Ed25519 signatures carried inside the submitted transaction and requires the claimed address to be one of its signers.

### Batching criteria

Per-adapter, you choose how `runBatcher` decides to submit:

- `time`: every `timeWindowMs` milliseconds.
- `size`: when `maxBatchSize` inputs are queued.
- `value`: when accumulated value (via `valueAccumulatorFn`) reaches `targetValue`.
- `hybrid`: time OR size, whichever comes first.
- `custom`: your `isBatchReadyFn(inputs, lastProcessTime)` returns `true`.

### Confirmation levels

`batcher.batchInput(input, level?)` returns when the chosen level is reached:

- `no-wait`: returns once the input is queued.
- `wait-receipt`: waits for the blockchain transaction receipt.
- `wait-effectstream-processed`: waits until Effectstream has processed the resulting rollup block.

It resolves to `{ requestId, receipt, duplicate? }` — never to a bare receipt.
`receipt` is `null` for `no-wait` and for a duplicate; `requestId` is always
present, because it is a pure function of the payload and exists the moment the
input is journaled.

> **Breaking change (was: the receipt itself).** Callers that did
> `const receipt = await batcher.batchInput(...)` now need
> `const { receipt } = await batcher.batchInput(...)`. The envelope exists
> because `no-wait` is the level that most needs an id and has no receipt to
> attach one to.

### Rate limiting

> **Breaking change for custom stores:** `RateLimitStore` now requires the
> atomic `consume(buckets, nowMs, windowMs)` operation. Implementations of the
> former split `count`/`hit` contract are incompatible and must be migrated
> before upgrading. A store must also honour each `RateLimitBucket.weight`;
> treating every bucket as one request undercharges proof-heavy transactions.

`POST /send-input` is rate limited. Configure it with the optional `rateLimit`
block:

```typescript
const config: BatcherConfig = {
  // …
  rateLimit: {
    preAuthMaxRequests: 1000, // all requests per source IP before verification
    maxRequests: 100,     // authenticated requests per identity
    globalMaxRequests: 1000, // total authenticated requests for this target
    windowMs: 86_400_000, // window size in ms
    // store: myRateLimitStore,  // optional; in-memory by default
  },
};
```

Rate limiting has two phases. First, every schema-valid request consumes a
server-scoped IP bucket before signature verification. Its key never includes
the untrusted target or address from the request body, so changing those fields
cannot evade the ceiling or poison another identity. Invalid signatures still
consume this pre-authentication allowance, bounding verification work. Second,
a verified request atomically consumes the authenticated target-global and
identity buckets before semantic validation and queuing.

When `globalMaxRequests` is omitted it defaults to `maxRequests`, so the
identity allowance is also a hard target-wide ceiling. When
`preAuthMaxRequests` is omitted it defaults to that effective global value. The
built-in defaults are 1000 for all three limits over 24 hours. A limited
request in either phase gets HTTP 429 with a `Retry-After` header and
`retryAfter` value in the body.

An application-level IP ceiling cannot stop a distributed source that rotates
addresses. Public deployments should also enforce connection and request-rate
controls at a trusted load balancer or WAF.

Each adapter chooses how requests are keyed by implementing the optional
`getRateLimitKeyStrategy()`, returning one of `"ip"` (the default),
`"ip-and-address"`, or `"composite"`. Every strategy also consumes a bucket
scoped to the validated adapter target, enforcing `globalMaxRequests` across
all IPs and wallets for that sponsor.

`SolanaAdapter` exposes this as a `rateLimitKeyStrategy` config field, still
defaulting to `"ip"`. For a sponsored batcher, set `globalMaxRequests` to the
total volume the sponsor can fund and a lower `maxRequests` per wallet, then use
`"ip-and-address"`. Its shared-IP bucket uses the global ceiling while each
verified address uses the lower identity ceiling, so one wallet can exhaust its
own allowance without blocking everyone behind the same NAT. Identity buckets
are created only after `SolanaAdapter.verifySignature` binds the claimed
address to a real signer.

To back the limiter with something other than process memory, implement the
atomic `RateLimitStore.consume(buckets, nowMs, windowMs)` operation and pass it
as `store`. Redis implementations should use a transaction or Lua script; SQL
implementations should use a transaction with row/advisory locks. The operation
must check and record every bucket in one phase together; the pre-authentication
and authenticated phases are intentionally separate calls. `InMemoryRateLimitStore`
is the built-in single-process implementation.

## Request tracking

A 200 from `/send-input` is a promise: the request is durably journaled, it will
be retried up to `maxRetries`, it will never be silently dropped, and whatever
happens to it is answerable by id.

### Request ids

`requestId` is the SHA-256 of the request's content key —
`addressType|target|address|timestamp|signature|input` — hex encoded. It is
therefore:

- **Deterministic.** The same payload always yields the same id, and a client
  can compute it before submitting.
- **Target-scoped.** The same payload sent to two products is two different
  requests, because `target` is part of the key.
- **Not a secret.** Everything it hashes is public on chain. Statuses are not
  private data; the id is not a capability token.
- **What the queue is keyed on.** `pending_inputs` has `PRIMARY KEY
  (request_id, seq)`. The id is what gets indexed, never the content key it
  hashes — the content key embeds the whole submitted payload, and a btree
  tuple may not exceed 2704 bytes, so a real Midnight transaction (~3.3 KB,
  a ~6.7 KB key) could not be indexed at all: acceptance failed with
  `index row size … exceeds btree version 4 maximum 2704` and the caller got a
  500 rather than an id. A 64-character hash has no such ceiling. `content_key`
  is still stored, unindexed, for diagnostics. `seq` orders the queue and lets
  one id own several rows, which is what a resubmission without a replay key
  legitimately produces.

### Polling

```bash
curl http://localhost:3334/input-status/<requestId>
```

```json
{
  "status": "incomplete",
  "subState": "submitted",
  "transactionHash": "0x…",
  "retryCount": 0,
  "acceptedAt": "2026-08-18T12:00:00.000Z"
}
```

`status` is one of three answers; `subState` carries the detail:

| `status` | `subState` | meaning |
|---|---|---|
| `incomplete` | `queued` | accepted, waiting for a batch |
| `incomplete` | `batching` | selected into a batch being built |
| `incomplete` | `submitted` | on chain, not yet confirmed (`transactionHash` present) |
| `complete` | `confirmed` | confirmed, with `transactionHash` and `blockNumber` |
| `failed` | `failed` | terminal, with a stable `errorCode` and `message` |

Terminal `errorCode`s include `RETRIES_EXHAUSTED` (the input was dropped at
`maxRetries`), `ONCHAIN_FAILED` (the transaction reverted), and whatever code
the adapter returned when it permanently rejected an input.

Retryable deferrals and infrastructure parking write **no** transition — a
request waiting on a busy target stays `incomplete/queued`, which is the truth.

Other responses:

- **400** `{ "reason": "malformed-id" }` — not 64 lowercase hex characters. The
  id is rejected before any lookup happens.
- **404** `{ "reason": "unknown-or-expired" }` — one reason, not two. Retention
  deletes a record and its replay key together, so nothing survives a prune to
  distinguish "never accepted here" from "aged out". Both have the same remedy:
  submit again.
- **429** — the endpoint draws down the same pre-authentication IP bucket as
  `/send-input`, so polling cannot be used as an amplification vector.
- **501** `{ "reason": "request-tracking-disabled", "enableWith":
  "BATCHER_DB_SCHEMA" }` — this deployment keeps no statuses (see
  [Choosing a storage backend](#choosing-a-storage-backend)). The route is
  always registered so that this answer is distinguishable from the 404: an
  expired id and a batcher that tracks nothing have completely different
  remedies. `/send-input` still returns a `requestId`, and the same fact is
  readable from `GET /queue-stats` as `requestTracking`.

### Duplicate submissions

The batcher must never pay twice for one signed spend. Each accepted request
claims a *replay key*, and a submission whose key is already claimed is not
queued again:

```json
{
  "success": true,
  "message": "Duplicate submission: this request is already tracked. …",
  "inputsProcessed": 1,
  "requestId": "<the ORIGINAL request's id>",
  "duplicate": true
}
```

This is a success, not an error: the caller's retry cost nothing, and the id it
gets back is the one with a fate to report. A duplicate always comes back with
no `transactionHash`, whatever confirmation level was requested — there is
nothing left to wait for.

Where the key comes from is a per-adapter decision:

- **Default** (no `getReplayKey` on the adapter): SHA-256 of `signature`. The
  signature is the one part of a request an attacker cannot re-mint, which is
  why replaying it under a rewritten `target` — a different `requestId`, the
  same spend — is caught.
- **`MidnightBalancingAdapter`**: the transaction's own chain-level
  `identifiers()`, so two serializations of the same spend collide. Derived
  during validation, which already deserializes the transaction.
- **Custom adapters**: implement `getReplayKey(input)`. Return `undefined` to
  disable dedup for that input; the batcher warns once per target that
  submissions there have no duplicate protection, and says which of the two
  cases it is — no hook at all, or a hook that answered `undefined`.

  If your key comes from WASM bindings (ledger, wallet, anything wasm-bindgen
  generated), call their accessors **on** the object — `tx.identifiers()`, or
  `fn.call(tx)` — never detached. Such a method reads `this.__wbg_ptr` first, so
  a detached call throws before it reaches the chain code, and a `try/catch`
  around it turns that into "no key" for every transaction you will ever see.

Note that a single signature reused across two targets is one paid request, not
two. Real wallets do not do this — the default signing message includes the
target — but a custom `verifySignature` could accept such a payload.

### Freshness window and retention

Two knobs that are **not independent**:

| Config | Default | What it does |
|---|---|---|
| `maxInputAgeMs` | 1 h | How old a signed `timestamp` may be at admission |
| `statusRetentionTtlMs` | 24 h | How long terminal records (and their replay keys) are kept |
| `statusRetentionKeepCount` | 1,000,000 | Terminal records kept regardless of age |
| `statusPruneIntervalMs` | 10 min | How often the retention sweep runs |

The batcher **refuses to construct** unless
`statusRetentionTtlMs >= 4 × maxInputAgeMs`. Retention and replay protection
share fate: a replayed signature is only recognised while the original's record
still exists, so retention shorter than the window in which a signature is still
*accepted* would mean duplicate protection that quietly does not hold. Failing
at startup is better than advertising a guarantee that has a hole in it.

An input outside the window is refused with 400 and a stable code:
`INPUT_TIMESTAMP_EXPIRED` (too old), `INPUT_TIMESTAMP_IN_FUTURE` (more than five
minutes ahead of the batcher's clock — check the signing client), or
`INPUT_TIMESTAMP_UNREADABLE` (not a time in any accepted format). All are
`retryable: false`.

`GET /queue-stats` reports what retention has actually done, so a sweep that
stopped working does not look like a sweep with nothing to do:

```json
{
  "totalPendingInputs": 3,
  "targets": [ … ],
  "retention": {
    "enabled": true, "keepCount": 1000000, "ttlMs": 86400000,
    "intervalMs": 600000, "prunedLastRun": 0, "prunedTotal": 412,
    "lastRunAt": "2026-08-18T12:00:00.000Z"
  },
  "reconciliation": { "synthesizedFromRows": 0, "orphanedStatuses": 0 }
}
```

`reconciliation` counters that moved are evidence the previous process did not
stop cleanly.

### Choosing a storage backend

When you construct a `Batcher` **without** passing `storage`, the backend is
resolved from the environment:

| environment | backend | request tracking |
|---|---|---|
| `BATCHER_PGLITE=true` | this batcher's **own embedded** PgLite database in `BATCHER_PGLITE_DATA_DIR` (default `./batcher-data`) | **on** — development only |
| `BATCHER_DB_SCHEMA=chess_v2` | connected `DatabaseStorage` on `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_NAME`, owning the schema `batcher_chess_v2` | **on** |
| neither set | `FileStorage` in `./batcher-data` | off — announced at startup |
| **both** set | **refuses to boot**, naming both keys | — |
| `BATCHER_DB_SCHEMA` set but invalid, or set and the database unreachable | **refuses to boot** | — |

`BATCHER_PGLITE` is checked first, and it is not the engine's `PGLITE` key —
that one describes the *engine's* database, defaults to `true` in development,
and selects nothing here. Setting both `BATCHER_PGLITE` and `BATCHER_DB_SCHEMA`
is refused rather than resolved by precedence: they name two different
databases, and whichever way a precedence rule fell, one of the two operators
who set them would be running something other than what they asked for.

**The embedded rung is for development.** It exists because the launcher's
PgLite gateway cannot host a batcher's tables (see the refusal note below), so
a developer who wants request tracking locally gets a private database instead
of a shared one. It is Phase-1-vintage, well-travelled code: the database lives
in `<dir>/pglite`, a `pending-inputs.jsonl` beside it is imported once, and a
`kill -9` leaves a directory that reopens cleanly.

> **One directory per batcher, always.** The embedded engine is an in-process
> WASM library: it binds **no network socket** and opens no port, so two
> embedded batchers on one host need no port coordination — the only port a
> batcher opens is its own `BATCHER_PORT`. The flip side is that the *data
> directory* is the entire isolation boundary. PgLite does **not** lock its data
> directory, and two instances sharing one will each load it, diverge, and flush
> their own copy back, leaving a database that no longer opens. The batcher
> therefore takes its own lock (`<dir>/pglite.lock`, holding the owning pid) and
> refuses to start on a directory another batcher is using. Stale locks left by
> a crash are reclaimed automatically.

The `BATCHER_DB_SCHEMA` value is a *suffix*: the code applies the fixed `batcher_` prefix, so the
effective schema can never be `public` (where the engine's tables live) and can
never collide with another component's. It must match `^[a-z0-9_]{1,55}$` — 55
characters is Postgres' 63-character identifier budget minus the prefix.

**The neither-set case is for development only.** It is exactly what this
package defaulted to before request tracking existed: inputs are queued,
batched, retried and submitted as always, but there is no status to poll, no
replay/dedup protection against paying twice for one signed request, and
`/input-status` answers 501. Production deployments must set
`BATCHER_DB_SCHEMA`; developers who want tracking locally set
`BATCHER_PGLITE=true` instead.

**Never falls back.** A set-but-invalid value is refused at construction, and a
set-but-unreachable database is refused at `init()`. Falling back there would
leave an operator who deliberately enabled tracking running without it.

**Schema isolation.** Each batcher owns its schema: `CREATE SCHEMA IF NOT
EXISTS` at connect, then `search_path` pinned on *every* pooled connection —
including replacements opened after a reconnect. All table names stay
unqualified, so nothing about the SQL changes. This is what makes several
batchers safe on one database even though target names collide across products
(`paimaL2` is used by four of them).

> **Development databases that multiplex clients onto one session are refused.**
> The launcher's PgLite gateway forwards every client into a single Postgres
> session, so `SET search_path` there would repoint *every other client of that
> database*, including the engine — whose queries then fail with `relation ...
> does not exist`. The batcher probes for this at boot (a canary setting made on
> one connection and read on another) and refuses rather than break a bystander.
> There are three ways out: point `DB_HOST`/`DB_PORT` at a real PostgreSQL
> server (production), set `BATCHER_PGLITE=true` and unset `BATCHER_DB_SCHEMA`
> to get tracking from this batcher's own embedded database (development), or
> leave both unset for queue-only mode.

**Constructing storage explicitly bypasses all of this** — the environment is
never consulted when you pass a `storage` argument:

- `new FileStorage("./dir")` — the JSONL queue, no tracking.
- `new DatabaseStorage("./dir")` — an **embedded** PgLite database in that
  directory. Standalone SDK use: one process, one private database, nothing to
  install. This is the same backend `BATCHER_PGLITE=true` selects, and it takes
  the same directory lock.
- `new DatabaseStorage({ connection, schema })` or
  `new DatabaseStorage({ connectionString })` — connected, with or without a
  schema of its own.

**Legacy queue files.** A `pending-inputs.jsonl` left by `FileStorage` is
imported into a database backend on first `init()` and renamed to `.imported`;
it is never imported twice, and an untargeted queue with no configured
`defaultTarget` is refused rather than guessed at. A *connected* storage only
does this when you pass `dataDirectory` explicitly — it defaults no directory
and touches no filesystem, so it can never adopt a stale queue it was not
pointed at.

**Breaking changes** in this area, for anyone upgrading:

1. With `BATCHER_DB_SCHEMA` and `BATCHER_PGLITE` **both unset**, the default
   backend is unchanged from before this feature: `FileStorage` in
   `./batcher-data`, queue-only. Set one of them (or pass `storage` explicitly)
   to enable request tracking.
2. `batchInput` resolves to `{ requestId, receipt, duplicate? }`, not a receipt.
3. `BatcherStorage.incrementRetryCount` returns the inputs it dropped. A backend
   still returning `void` keeps working and is warned once per batch.
4. Inputs older than `maxInputAgeMs` are refused at admission. Nothing enforced
   an input-age bound before.

## One batcher, many products

A single batcher process can serve every product on a network. A *product* is a
`target` plus its own adapter instance, its own wallet seed(s) and its own
policy. The queue is shared; **fee capacity is not** — each product gets its own
worker pool and dust lanes, so one product can never spend or starve another's.

Two rules the design depends on:

- **One network per process.** Midnight's `setNetworkId` is module-global, so
  run one batcher per environment, hosting that environment's products.
- **Never share a wallet between adapters.** Two instances on one wallet keep
  independent pending-spend ledgers, which is a double-spend. Constructing a
  second adapter on a seed already in use throws, and so does handing the same
  `walletResult` to two adapters — an injected wallet never goes through the
  seed path, so it is claimed by instance identity instead. A wallet you pass in
  stays yours: `close()` releases the claim but does not stop it.

### Authorizing work by content

There are no API keys and no client-side changes: the batcher decides from the
**transaction itself** whether it will sponsor it. Rules are declared per
product and are static.

```ts
new MidnightBalancingAdapter(seed, {
  /* … */
  policy: {
    allowZswapTransfers: true,            // plain shielded/unshielded transfers
    allowedTokenTypes: [myToken],         // …optionally only these tokens
    allowedContracts: [counterAddress],   // any circuit CALL on these contracts
    allowedCircuits: [{ contract, entryPoint: "increment" }],
    allowCustomFinalFilter: ({ tx, declarativeVerdict }) => {
      if (!declarativeVerdict.valid) return false;
      return isMatchedDeltaSwap(tx) ||
        { valid: false, error: "not a matched swap" };
    },
  },
});
```

Evaluation order is fixed: size cap → deserialize → declarative rules →
`allowCustomFinalFilter`. The custom filter runs **last** and its verdict is
final, so it can tighten *or* override the declarative result. It may be async;
throwing rejects the input (fail closed). It runs at intake **and** again before
any dust is spent, so it must be deterministic. No `policy` at all means
allow-all — existing single-product batchers are unaffected.

Custom filters are written against the same helpers the declarative rules are
built from, exported at `@effectstream/batcher-sdk/midnight-policy`:
`contractCalls`, `isZswapOnly`, `zswapTokenDeltas`, `zswapOfferShape`,
`zswapNullifiers`, `callsOnlyContracts`, `callsOnlyCircuits`,
`usesOnlyTokenTypes`, `isMatchedDeltaSwap`, `evaluateDeclarativePolicy`.

> **Deploys and maintenance updates are never authorized by these rules.**
> Both are contract actions carrying a contract's address but no entry point, so
> an address allowlist would otherwise cover them — and a maintenance update can
> rotate a contract's verifier keys and its maintenance authority. Sponsoring
> that is nothing like sponsoring a circuit call, so `allowedContracts` matches
> calls only, and an `allowedCircuits` entry with an empty `entryPoint` is
> ignored rather than honoured. Supporting them would need its own explicit
> option.

**What a policy can and cannot see.** Shielded amounts are hidden, so value
caps are impossible. Readable instead: contract addresses and entry points;
per-token net deltas (a *balanced* transfer reports none — a swap offer's
imbalance is exactly its signature); offer structure; and **nullifiers**, the
spend tags. A nullifier already on chain means the coin is spent and the
transaction can never apply — the one chain-state check worth a sponsor's time,
since a doomed transaction still costs it proving and dust to find out. It is
safe in a filter that runs twice because "spent" is monotone.

> **`allowedTokenTypes` constrains unshielded offers only.**
> Shielded token types are visible solely through an offer's deltas, and deltas
> are *net sums*: they show that some tokens moved, never every token the coins
> span, because anything balancing inside the offer cancels to zero and
> disappears. A balanced transfer shows no deltas at all; an unbalanced swap
> shows two and may still be carrying a third. Both are equally unenumerable —
> only the second looks otherwise, which is what makes it the dangerous case.
>
> So any transaction carrying shielded coins is **rejected** under this rule
> rather than checked against an allowlist that cannot see its contents. If you
> need a product to accept arbitrary shielded transfers, leave
> `allowedTokenTypes` unset; if you need real per-token control, gate on an
> allowlisted contract or circuit whose proof binds the token type.

### Midnight validation boundaries and resource limits

`MidnightBalancingAdapter` applies a cheap structural gate at intake, then
rechecks untrusted stored rows and runs ledger well-formedness before spending
dust. The default structural ceiling is
`shapeLimits: { maxProofElements: 64 }`, where proof elements are shielded
inputs, outputs and transients. Byte size alone does not bound validation work:
each of those elements carries a zswap proof. Raise `maxProofElements` (or set
the per-field `maxInputs`, `maxOutputs` and `maxTransients`) for a legitimate
heavier product. Set `shapeLimits: {}` only when deliberately disabling the
default ceiling.

The HTTP outcomes distinguish permanent cost from temporary capacity:

- `413 TRANSACTION_TOO_EXPENSIVE`, with `retryable: false`, means the
  transaction's measured weight cannot fit inside the target's entire
  admission budget. Waiting will not help.
- `429` means the configured rate window is currently exhausted. It includes
  `Retry-After` and can be retried after that delay.
- `503 LEDGER_PARAMS_UNAVAILABLE`, with `retryable: true`, means the adapter
  could not obtain fresh live ledger parameters and therefore refused to make
  a transaction verdict.

Three validation limits are security-relevant:

1. Contract proofs and dust proofs are **not verified in this build**. Zswap
   offer proofs are still verified unconditionally by the ledger binding.
2. Well-formedness is checked against a blank ledger state carrying the live
   parameters. That bounds and rejects malformed work, but it is not a promise
   of node acceptance: a later state conflict can still reject a sponsored
   transaction.
3. As described above, `allowedTokenTypes` constrains unshielded offers only;
   shielded deltas are net sums and cannot enumerate every coin type involved.

If reverting the batcher's own finalized transaction fails, continuing could
double-book a dust lane. The adapter therefore hard-pauses before touching any
wallet again. Per-target `/queue-stats` exposes this as
`health.hardPause: { active: true, reason: "..." }`; the reason is intended for
manual recovery and must not be treated as an ordinary retry cooldown.

Accepting that anyone may submit a *policy-conforming* transaction is the
trade-off of tokenless authorization. Bound the blast radius with
`allowedTokenTypes`, the target-scoped rate limits (`globalMaxRequests` caps a
sponsor's total volume), and network ACLs in front of the port.

### Per-target controls

```ts
const config: BatcherConfig<DefaultBatcherInput> = {
  requireExplicitTarget: true,   // refuse input that doesn't name its target
  perTarget: {
    "product-a": { maxRetries: 5, retryDelayMs: 2_000 },
  },
};
```

Left unset, this turns itself on when there is more than one adapter **and** no
default target was named. The distinction matters: `addBlockchainAdapter()`
auto-assigns `defaultTarget` to whichever adapter registered first, and routing
to a default nobody chose is the hazard. A default you set yourself — via
`defaultTarget` or `setDefaultTarget()` — is a statement of intent and is
honoured, so existing multi-adapter setups keep working.

Retry policy, dedup keys, `/queue-stats` entries and the `?target=`-scoped
`POST /force-batch` and `DELETE /clear-inputs` are all per-target. Rate limiting
is target-scoped too, but it is configured under `rateLimit` rather than here —
the limiter derives a `target:<name>:…` bucket per request plus a target-global
ceiling, so a second knob on `perTarget` would do nothing. `adapter.getHealthInfo()` surfaces each product's wallet, dust and
worker state in `/queue-stats`.

Worked example: [`templates/multi-batcher`](https://github.com/effectstream/effectstream/tree/main/templates/multi-batcher)
— three products (contract calls, transfers, custom-filtered swaps) on one
batcher, with fast and deep test suites.

## Customising the batcher

The four interfaces you'd implement, in order of frequency:

- `BlockchainAdapter`: submit, wait for receipt, estimate fee, report chain name. New chains plug in here.
- `BatcherStorage`: persist + load inputs. Two implementations ship — `FileStorage` (JSONL on disk, queue only) and `DatabaseStorage` (queue, request status and replay keys in one Postgres schema, embedded or connected); which one a bare `new Batcher()` gets is decided by `BATCHER_PGLITE` and `BATCHER_DB_SCHEMA`, see [Choosing a storage backend](#choosing-a-storage-backend). Redis / S3 / anything else are yours to write against this interface; implement the optional `TrackingStorage` half too if you want `/input-status` to work on it.
- `BatchDataBuilder<T>`: control how inputs are serialised into the bytes the adapter submits.
- State-transition listeners: hook into `startup`, `batch:process:start`, `batch:submit`, `batch:confirmed`, `error`, and others for metrics or custom behaviour.

## Inside Effectstream

The batcher is the on-ramp between user wallets and Effectstream's state machine. Frontends sign inputs through `@effectstream/wallets`, POST them here, and wait on the confirmation level they need. On submission, `@effectstream/sync`'s fetchers pick up the resulting on-chain transaction and the state machine (`@effectstream/sm`) processes the contained subunits in a per-block transaction.

## Key exports

- `createNewBatcher(config, storage)`: build a batcher instance.
- `BatcherConfig`: configuration type. See `pollingIntervalMs`, `adapters`, `defaultTarget`, `batchingCriteria`, `confirmationLevel`, `enableHttpServer`, `port`, `enableEventSystem`, `namespace`, `batchBuilding`.
- `DatabaseStorage(dir | options)`: queue, request status and replay keys in one database — a connected Postgres via `{ connection, schema }` or `{ connectionString }` (the default when `BATCHER_DB_SCHEMA` is set), or an embedded PgLite database when given a directory (the default when `BATCHER_PGLITE=true`). See [Choosing a storage backend](#choosing-a-storage-backend).
- `BatcherFileStorage(dir)` (exported as `FileStorage` from `core/storage.ts`): the JSONL queue, and the default when `BATCHER_DB_SCHEMA` is unset. Fully supported, but queue-only: no request tracking, and development-only by policy.
- Adapters: `EffectstreamL2DefaultAdapter`, `EvmContractAdapter`, `MidnightAdapter`, `MidnightBalancingAdapter`, `BitcoinAdapter`, `CelestiaAdapter`, `SolanaAdapter`, `NearAdapter`, `NearIntentAdapter`.
- Batcher operations: `runBatcher`, `batchInput`, `addStateTransition`, `gracefulShutdownOp`, `getPublicConfig`, `getBatchingStatus`.
- Rate limiting: `RateLimiter`, `InMemoryRateLimitStore`, and the `RateLimitStore` / `RateLimitBucket` / `RateLimitKeyStrategy` / `RateLimitCheckResult` types. See [Rate limiting](#rate-limiting).
- `MidnightBalancingAdapter`: a Midnight adapter variant that delegates transaction balancing, for setups where the batcher does not hold the funding wallet itself.
- `WorkerPool`: the internal concurrency primitive the Midnight adapter uses to run one transaction per wallet UTXO slot in parallel, with a per-slot mutex.
- HTTP endpoints (when enabled): `POST /send-input`, `GET /input-status/:requestId` (answers 501 on a queue-only backend — see [Request tracking](#request-tracking)), `GET /health`, `GET /status`, `GET /queue-stats`. Two more are registered only when `ENABLE_DEV_AND_DEBUG_ENDPOINTS` is set: `POST /force-batch` and `DELETE /clear-inputs`. Both accept `?target=` to scope to one product.
- Policy helpers at `@effectstream/batcher-sdk/midnight-policy`: transaction introspection plus the declarative rule engine, shared by the built-in rules and your own `allowCustomFinalFilter`. See [One batcher, many products](#one-batcher-many-products).

## Examples

End-to-end batcher flow:
[`e2e/evm/sync/batcher.test.ts`](https://github.com/effectstream/effectstream/blob/main/e2e/evm/sync/batcher.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/batcher
- Source: https://github.com/effectstream/effectstream/tree/main/packages/batcher
- Companion: [`@effectstream/wallets`](https://www.npmjs.com/package/@effectstream/wallets) for the signing side.
