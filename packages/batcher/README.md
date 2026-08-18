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
- `BatcherStorage`: persist + load inputs. The default is `FileStorage` (JSONL on disk). A `DatabaseStorage` class is exported but is **not implemented** — every method currently throws — so Postgres / Redis / S3 backends are yours to write against this interface.
- `BatchDataBuilder<T>`: control how inputs are serialised into the bytes the adapter submits.
- State-transition listeners: hook into `startup`, `batch:process:start`, `batch:submit`, `batch:confirmed`, `error`, and others for metrics or custom behaviour.

## Inside Effectstream

The batcher is the on-ramp between user wallets and Effectstream's state machine. Frontends sign inputs through `@effectstream/wallets`, POST them here, and wait on the confirmation level they need. On submission, `@effectstream/sync`'s fetchers pick up the resulting on-chain transaction and the state machine (`@effectstream/sm`) processes the contained subunits in a per-block transaction.

## Key exports

- `createNewBatcher(config, storage)`: build a batcher instance.
- `BatcherConfig`: configuration type. See `pollingIntervalMs`, `adapters`, `defaultTarget`, `batchingCriteria`, `confirmationLevel`, `enableHttpServer`, `port`, `enableEventSystem`, `namespace`, `batchBuilding`.
- `FileStorage(dir)`: default JSONL storage.
- Adapters: `EffectstreamL2DefaultAdapter`, `EvmContractAdapter`, `MidnightAdapter`, `MidnightBalancingAdapter`, `BitcoinAdapter`, `CelestiaAdapter`, `SolanaAdapter`, `NearAdapter`, `NearIntentAdapter`.
- Batcher operations: `runBatcher`, `batchInput`, `addStateTransition`, `gracefulShutdownOp`, `getPublicConfig`, `getBatchingStatus`.
- Rate limiting: `RateLimiter`, `InMemoryRateLimitStore`, and the `RateLimitStore` / `RateLimitBucket` / `RateLimitKeyStrategy` / `RateLimitCheckResult` types. See [Rate limiting](#rate-limiting).
- `DatabaseStorage`: a `BatcherStorage` shell that is **not implemented yet** — its methods throw. Use `FileStorage` or your own implementation.
- `MidnightBalancingAdapter`: a Midnight adapter variant that delegates transaction balancing, for setups where the batcher does not hold the funding wallet itself.
- `WorkerPool`: the internal concurrency primitive the Midnight adapter uses to run one transaction per wallet UTXO slot in parallel, with a per-slot mutex.
- HTTP endpoints (when enabled): `POST /send-input`, `GET /health`, `GET /status`, `GET /queue-stats`. Two more are registered only when `ENABLE_DEV_AND_DEBUG_ENDPOINTS` is set: `POST /force-batch` and `DELETE /clear-inputs`. Both accept `?target=` to scope to one product.
- Policy helpers at `@effectstream/batcher-sdk/midnight-policy`: transaction introspection plus the declarative rule engine, shared by the built-in rules and your own `allowCustomFinalFilter`. See [One batcher, many products](#one-batcher-many-products).

## Examples

End-to-end batcher flow:
[`e2e/evm/sync/batcher.test.ts`](https://github.com/effectstream/effectstream/blob/main/e2e/evm/sync/batcher.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/batcher
- Source: https://github.com/effectstream/effectstream/tree/main/packages/batcher
- Companion: [`@effectstream/wallets`](https://www.npmjs.com/package/@effectstream/wallets) for the signing side.
