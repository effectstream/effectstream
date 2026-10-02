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

> **Breaking change for custom stores:** `RateLimitStore` now requires the
> atomic `consume(buckets, nowMs, windowMs)` operation. Implementations of the
> former split `count`/`hit` contract are incompatible and must be migrated
> before upgrading.

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

## Solana operator signer

`SolanaAdapter` co-signs, as fee payer, transactions a user already built and
signed. `SolanaSignerAdapter` is for the other case: the batcher holds an
**operator** key and builds, signs and submits transactions from instruction
lists, for example a bridge relayer that releases SPL tokens from a vault. The
operator is the fee payer and the only signer of every transaction.

```typescript
// `createAtaIdempotentIx` and `releaseIx` are ordinary @solana/web3.js
// TransactionInstructions built by your program's client code.
import {
  createNewBatcher,
  FileStorage,
  signSolanaSignerInput,
  SolanaSignerAdapter,
} from "@effectstream/batcher-sdk";

const adapter = new SolanaSignerAdapter({
  rpcUrl: "http://127.0.0.1:8899",
  operatorSecretKey: process.env.SOLANA_OPERATOR_SECRET_KEY!, // base58, 64 bytes
  // Every top-level instruction must target one of these (ComputeBudget is
  // always allowed). List the associated-token-account program explicitly if
  // a transaction creates the recipient's token account.
  allowedProgramIds: [BRIDGE_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID],
  syncProtocolName: "parallelSolanaRPC",
});

const batcher = createNewBatcher(
  { pollingIntervalMs: 1000, enableHttpServer: false, confirmationLevel: "wait-receipt" },
  new FileStorage("./batcher-data"),
);
batcher.addBlockchainAdapter("solanaOperator", adapter, { criteriaType: "size", maxBatchSize: 1 });
await batcher.init();

// One input = one transaction. Sign it with the operator key.
const input = signSolanaSignerInput({
  input: { instructions: [createAtaIdempotentIx, releaseIx], computeUnitLimit: 100_000 },
  operatorSecretKey: process.env.SOLANA_OPERATOR_SECRET_KEY!,
  target: "solanaOperator",
});
const receipt = await batcher.batchInput(input, "wait-receipt");
// receipt.hash is the transaction signature; receipt.status is 1 if it succeeded on chain.
```

**Input** (`DefaultBatcherInput.input`, JSON):
`{"instructions":[{"programId","keys":[{"pubkey","isSigner","isWritable"}],"dataBase64"}],"computeUnitLimit"?}`.
`encodeSolanaSignerInput` writes it from web3.js instructions, and
`signSolanaSignerInput` returns a complete input. Unknown fields are refused.

**What it refuses**:
- an input whose `signature` is not the operator's Ed25519 signature over
  `buildSolanaSignerMessage(input)` (domain tag, `target`, `timestamp`,
  `input`), or whose `address` is not the operator. A batcher with the HTTP
  server enabled therefore cannot be used by anyone else to make the operator
  sign instructions;
- an instruction to a program outside `allowedProgramIds` (plus ComputeBudget);
- any signer other than the operator;
- a `SetComputeUnitPrice` above `maxPriorityFeeMicroLamports` (default 0, so
  priority fees are refused unless you allow them), unknown or duplicate
  ComputeBudget instructions;
- malformed JSON, keys or base64, and a transaction larger than a Solana packet.

**Submission**: each attempt fetches a fresh blockhash; preflight simulation is
on. If no transaction of a batch can be sent, the error carries the RPC's error
texts, so an outage of your own RPC parks the inputs instead of spending their
retries. Delivery is **at-least-once**: make the instructions idempotent (for
example a receipt PDA per withdrawal id). For a transaction it submitted, the
receipt wait runs until it has landed or its blockhash has expired (then it can
never land, and a retry is safe). Identical instructions submitted within one
blockhash window produce the same transaction and land once.

**Replays**: the batcher keeps no record of the signed inputs it has executed.
Anyone who sees one can POST it again to a batcher with the HTTP server enabled,
and its instructions run again (bounded by the rate limit). Idempotent
instructions are refused by preflight simulation and cost nothing; others cost
the operator a fee per replay. Prefer an embedded batcher
(`enableHttpServer: false`), or keep an HTTP-enabled one private.

**Batch size**: `maxBatchSize` defaults to 1, so each receipt belongs to exactly
one input. With more, inputs that could not be sent are retried on their own,
each input gets its own signature, and `status` is 0 if any transaction of the
batch failed on chain (per-transaction outcomes are in `receipt.signatures`).

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
- Adapters: `EffectstreamL2DefaultAdapter`, `EvmContractAdapter`, `MidnightAdapter`, `MidnightBalancingAdapter`, `BitcoinAdapter`, `CelestiaAdapter`, `SolanaAdapter`, `SolanaSignerAdapter` (operator-signed; helpers `signSolanaSignerInput`, `encodeSolanaSignerInput`, `buildSolanaSignerMessage`, `toSolanaSignerInstruction`), `NearAdapter`, `NearIntentAdapter`.
- Batcher operations: `runBatcher`, `batchInput`, `addStateTransition`, `gracefulShutdownOp`, `getPublicConfig`, `getBatchingStatus`.
- Rate limiting: `RateLimiter`, `InMemoryRateLimitStore`, and the `RateLimitStore` / `RateLimitBucket` / `RateLimitKeyStrategy` / `RateLimitCheckResult` types. See [Rate limiting](#rate-limiting).
- `DatabaseStorage`: a `BatcherStorage` shell that is **not implemented yet** — its methods throw. Use `FileStorage` or your own implementation.
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
