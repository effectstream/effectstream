---
title: "@effectstream/batcher-sdk"
description: "Cross-chain transaction batching SDK for EffectStream"
sidebar_label: "batcher-sdk"
---

<!-- Generated from packages/batcher/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. -->

> Package: **[`@effectstream/batcher-sdk`](https://www.npmjs.com/package/@effectstream/batcher-sdk)** · [Source](https://github.com/effectstream/effectstream/tree/main/packages/batcher)

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
`"ip-and-address"`, or `"composite"` - so a chain whose users share an IP can
still be limited per address.

To back the limiter with something other than process memory, implement
`RateLimitStore` (`hit(key, nowMs)` and `count(key, nowMs, windowMs)`) and pass
it as `store`. `InMemoryRateLimitStore` is the built-in implementation.

## Customising the batcher

The four interfaces you'd implement, in order of frequency:

- `BlockchainAdapter`: submit, wait for receipt, estimate fee, report chain name. New chains plug in here.
- `BatcherStorage`: persist + load inputs. The default is `FileStorage` (JSONL on disk). A `DatabaseStorage` class is exported but is **not implemented** - every method currently throws - so Postgres / Redis / S3 backends are yours to write against this interface.
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
- `DatabaseStorage`: a `BatcherStorage` shell that is **not implemented yet** - its methods throw. Use `FileStorage` or your own implementation.
- `MidnightBalancingAdapter`: a Midnight adapter variant that delegates transaction balancing, for setups where the batcher does not hold the funding wallet itself.
- `WorkerPool`: the internal concurrency primitive the Midnight adapter uses to run one transaction per wallet UTXO slot in parallel, with a per-slot mutex.
- HTTP endpoints (when enabled): `POST /send-input`, `GET /health`, `GET /status`, `GET /queue-stats`. Two more are registered only when `ENABLE_DEV_AND_DEBUG_ENDPOINTS` is set: `POST /force-batch` and `DELETE /clear-inputs`.

## Examples

End-to-end batcher flow:
[`e2e/evm/sync/batcher.test.ts`](https://github.com/effectstream/effectstream/blob/main/e2e/evm/sync/batcher.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/batcher
- Source: https://github.com/effectstream/effectstream/tree/main/packages/batcher
- Companion: [`@effectstream/wallets`](https://www.npmjs.com/package/@effectstream/wallets) for the signing side.
