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

`POST /send-input` is rate limited. Configure it with the optional `rateLimit`
block:

```typescript
const config: BatcherConfig = {
  // …
  rateLimit: {
    maxRequests: 1000,   // requests allowed per window
    windowMs: 86_400_000, // window size in ms
    // store: myRateLimitStore,  // optional; in-memory by default
  },
};
```

Those are the defaults applied when you omit the block. Validation rejects
`maxRequests < 1` or `windowMs < 1000`. A limited request gets HTTP 429 with a
`retryAfter` value in the body.

Each adapter chooses how requests are keyed by implementing the optional
`getRateLimitKeyStrategy()`, returning one of `"ip"` (the default),
`"ip-and-address"`, or `"composite"` — so a chain whose users share an IP can
still be limited per address.

To back the limiter with something other than process memory, implement
`RateLimitStore` (`hit(key, nowMs)` and `count(key, nowMs, windowMs)`) and pass
it as `store`. `InMemoryRateLimitStore` is the built-in implementation.

## One batcher, many products

A single batcher process can serve every product on a network. A *product* is a
`target` plus its own adapter instance, its own wallet seed(s) and its own
policy. The queue is shared; **fee capacity is not** — each product gets its own
worker pool and dust lanes, so one product can never spend or starve another's.

Two rules the design depends on:

- **One network per process.** Midnight's `setNetworkId` is module-global, so
  run one batcher per environment, hosting that environment's products.
- **Never share a wallet seed between adapters.** Two instances on one seed keep
  independent pending-spend ledgers, which is a double-spend. Constructing a
  second adapter on a seed already in use throws.

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
    allowedContracts: [counterAddress],   // any circuit on these contracts
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

**What a policy can and cannot see.** Shielded amounts are hidden, so value
caps are impossible. Readable instead: contract addresses and entry points;
per-token net deltas (a *balanced* transfer reports none — a swap offer's
imbalance is exactly its signature); offer structure; and **nullifiers**, the
spend tags. A nullifier already on chain means the coin is spent and the
transaction can never apply — the one chain-state check worth a sponsor's time,
since a doomed transaction still costs it proving and dust to find out. It is
safe in a filter that runs twice because "spent" is monotone.

Accepting that anyone may submit a *policy-conforming* transaction is the
trade-off of tokenless authorization. Bound the blast radius with
`allowedTokenTypes`, per-target rate limits, and network ACLs in front of the
port.

### Per-target controls

```ts
const config: BatcherConfig<DefaultBatcherInput> = {
  requireExplicitTarget: true,   // refuse input that doesn't name its target
  perTarget: {
    "product-a": { rateLimit: { maxRequests: 60, windowMs: 60_000 }, maxRetries: 5 },
  },
};
```

Left unset, this turns itself on when there is more than one adapter **and** no
default target was named. The distinction matters: `addBlockchainAdapter()`
auto-assigns `defaultTarget` to whichever adapter registered first, and routing
to a default nobody chose is the hazard. A default you set yourself — via
`defaultTarget` or `setDefaultTarget()` — is a statement of intent and is
honoured, so existing multi-adapter setups keep working.

Rate-limit buckets, retry policy, dedup keys, `/queue-stats` entries and the
`?target=`-scoped `POST /force-batch` and `DELETE /clear-inputs` are all
per-target. `adapter.getHealthInfo()` surfaces each product's wallet, dust and
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
- Rate limiting: `RateLimiter`, `InMemoryRateLimitStore`, and the `RateLimitStore` / `RateLimitKeyStrategy` / `RateLimitCheckResult` types. See [Rate limiting](#rate-limiting).
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
