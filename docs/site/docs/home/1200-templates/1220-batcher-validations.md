---
title: "Batcher Validations"
description: "Shows how to reject inputs at the batcher before they are queued, by wrapping a blockchain adapter with a custom `validateInput` hook."
sidebar_label: "Batcher Validations"
sidebar_position: 18
---

<!-- Generated from templates/batcher-validations/README.md by docs/site/scripts/sync-template-readmes.ts. Do not edit directly. -->

> Template: **[`templates/batcher-validations`](https://github.com/effectstream/effectstream/tree/main/templates/batcher-validations)**

A batcher sits between your users and the chain: it takes signed inputs over HTTP, groups them, and pays to submit them. That makes it the only place where you can refuse an input *before* it costs anyone gas — and the only place where an application-defined policy ("no submissions during maintenance", "this address is not on the allowlist", "this payload is malformed") can be enforced cheaply.

This template is the smallest complete example of that. It has one grammar action, one state transition, one table of messages — and a second table holding a boolean gate that the batcher consults on every incoming input. Flip the gate off in the UI and the batcher starts rejecting submissions with an error; flip it back on and they flow again. The interesting code is about twenty lines.

## What this template shows

**Validation is an adapter concern, not a batcher fork.** `BlockchainAdapter` declares two optional hooks — `verifySignature` and `validateInput` — and the batcher core calls them in `batchInput()` before an input reaches storage. Implementing `validateInput` is all it takes to add a policy; the rest of the adapter surface is untouched. In `packages/batcher/gated-adapter.ts` the template adds the policy by *decorating* an existing adapter rather than subclassing it:

```ts
export class GatedAdapter implements BlockchainAdapter<string> {
  constructor(
    private readonly inner: BlockchainAdapter<string>,
    private readonly gateUrl: string = "http://localhost:9999/api/gate",
  ) {}

  async validateInput(_input: DefaultBatcherInput): Promise<ValidationResult> {
    try {
      const res = await fetch(this.gateUrl);
      const data = (await res.json()) as { accepting: boolean };
      if (!data.accepting) {
        return { valid: false, error: "Gate is closed — inputs are currently disabled" };
      }
    } catch {
      return { valid: false, error: "Could not reach gate API" };
    }
    if (this.inner.validateInput) {
      return this.inner.validateInput(_input);
    }
    return { valid: true };
  }

  // every other method delegates to `inner`
}
```

Two details are the point of the whole template. The `catch` **fails closed** — an unreachable policy service rejects rather than admits. And the tail call chains to `inner.validateInput` when the wrapped adapter has one, so decorators compose: several policies can be stacked around a single chain adapter, each unaware of the others.

**Rejection happens pre-queue, so it is cheap and it is visible.** `batchInput()` verifies the signature, then calls `validateInput`, and only then writes to storage; a `false` result becomes an `InputValidationError` returned from the batcher's `POST /send-input`. Nothing is stored, no batch is built, no gas is spent, and the submitting client gets the `error` string you returned rather than a silent drop.

**The policy is application state, read at submission time.** The gate is not a batcher config value. It is a row in the sync node's own database (`gate_config`), exposed by the node's API at `GET/POST /api/gate`, and fetched by the adapter on every input. That is the shape worth copying: the batcher stays a dumb, restartable process, while the policy it enforces lives in — and is versioned with — your application state, and can be changed at runtime by anything that can write that row.

## Effectstream features used

| Feature | Where | Used for |
| --- | --- | --- |
| `@effectstream/batcher-sdk` — `BlockchainAdapter` decorator | `packages/batcher/gated-adapter.ts` | The custom `validateInput` policy, wrapping any inner adapter |
| `@effectstream/batcher-sdk` — `createNewBatcher` + `FileStorage` | `packages/batcher/batcher.dev.ts` | Batcher process: time-window batching, HTTP server, event system |
| `@effectstream/batcher-sdk` — `EffectstreamL2DefaultAdapter` | `packages/batcher/effectstream-l2.ts` | The wrapped adapter that actually submits batches to `MyEffectstreamL2` |
| `@effectstream/sm` state machine (`Stm`) | `packages/node/state-machine.ts` | One `sendMessage` transition writing into `commands` |
| `PrimitiveTypeEVMEffectstreamL2` | `packages/node/config.dev.ts` | Ingests the batched inputs back out of the L2 contract |
| NTP main + parallel EVM sync protocols | `packages/node/config.dev.ts` | `mainNtp` orders the rollup, `mainEvmRPC` reads Hardhat |
| Custom Fastify API router | `packages/node/api.ts` | `GET`/`POST /api/gate` and `GET /api/commands` |
| `@effectstream/db` + pgtyped | `packages/database/` | `gate_config` + `commands`, with typed queries from `packages/database/sql/queries.sql` |
| `@effectstream/wallets` | `packages/frontend/client/src/App.tsx` | `walletLogin({ preferBatchedMode: true })` and `sendTransaction` through the batcher |
| `@effectstream/orchestrator` launch helpers | `start.dev.ts` | `launchPglite` and `launchEvm` plus sync, batcher and frontend processes |

## Quick start

Prerequisites beyond [Bun](https://bun.sh):

- **[Foundry](https://www.getfoundry.sh/)** — `launchEvm` checks for `forge` on PATH before starting anything and refuses to run without it.
  ```sh
  curl -L https://foundry.paradigm.xyz | bash && foundryup
  ```

```sh
git clone https://github.com/effectstream/effectstream.git
cd effectstream/templates/batcher-validations

bun install          # standalone; inside the monorepo run ./link.sh instead
bun run dev          # PGLite, Hardhat + deploy, sync node, batcher, frontend
```

`bun run dev` is `NODE_ENV=development bunx orchestrator start`, which reads `start.dev.ts`. Open [http://localhost:10599](http://localhost:10599), connect an EVM browser wallet, send a message, then toggle the gate off and try again — the second attempt fails with the adapter's error string.

| Service | URL |
| --- | --- |
| Frontend | http://localhost:10599 |
| Sync node API | http://localhost:9999 |
| Batcher | http://localhost:3334 |
| Orchestrator API | http://localhost:4747 |
| Hardhat EVM | http://localhost:8545 |
| PGLite (Postgres) | `postgres://postgres:postgres@localhost:5432/postgres` |

Individual build steps:

```sh
bun run build:evm        # Forge + Hardhat compile, deploy, regenerate TS bindings
bun run build:pgtypes    # regenerate pgtyped types after editing packages/database/sql/queries.sql
```

> The orchestrator owns every port above. Stop a previous run before starting `bun run dev` or `bun run test` again.

## Project structure

```
batcher-validations/
├── start.dev.ts                              # Orchestrator process graph for the local stack
├── link.sh                                   # Link monorepo sources into the template
└── packages/
    ├── batcher/                              # @batcher-validations/batcher
    │   ├── batcher.dev.ts                    #   Batcher entry: wraps the L2 adapter in GatedAdapter
    │   ├── gated-adapter.ts                  #   The custom validateInput decorator
    │   └── effectstream-l2.ts                #   Builds the EffectstreamL2DefaultAdapter
    ├── node/                                 # @batcher-validations/node — sync node
    │   ├── main.dev.ts                       #   Entry point
    │   ├── config.dev.ts                     #   Networks, sync protocols, L2 primitive
    │   ├── grammar.ts                        #   The single `sendMessage` action
    │   ├── state-machine.ts                  #   Writes each message into `commands`
    │   └── api.ts                            #   Gate read/write + command list
    ├── database/                             # @batcher-validations/database
    │   ├── migrations/000-init.sql           #   gate_config + commands
    │   ├── migration-order.ts                #   migrationTable consumed by the runtime
    │   └── sql/queries.sql                   #   pgtyped query definitions
    ├── contracts-evm/                        # @batcher-validations/contracts-evm
    │   ├── src/contracts/MyEffectstreamL2.sol  # Thin EffectstreamL2Contract subclass
    │   ├── ignition/modules/effectstreamL2.ts  # Ignition deployment module
    │   └── deploy.ts                         #   Deploys to the local Hardhat chain
    ├── frontend/                             # @batcher-validations/frontend
    │   ├── client/src/App.tsx                #   Wallet, gate toggle, message form, command table
    │   ├── client/src/api.ts                 #   Typed wrappers over the node's API
    │   └── server/main.ts                    #   Fastify static server on :10599
    └── tests/                                # @batcher-validations/tests — two-phase suite
```

## How it works

### Grammar

One action, one field, with the length bound expressed in the schema so the runtime rejects oversized payloads before the transition runs:

```ts
// packages/node/grammar.ts
export const grammar = {
  sendMessage: [
    ["message", Type.String({ maxLength: 280 })],
  ],
} as const satisfies GrammarDefinition;
```

### Batcher

`packages/batcher/batcher.dev.ts` builds the real adapter, wraps it, and registers the wrapper under the target name the frontend submits to:

```ts
const innerAdapter = createEffectstreamL2Adapter({
  chainId: 31337,
  contractModule: "EffectstreamL2Module#MyEffectstreamL2",
  privateKey: process.env.EVM_PRIVATE_KEY ?? "0x59c6…690d",
  fee: 0n,
  syncProtocolName: "mainEvmRPC",
});

const paimaL2 = new GatedAdapter(innerAdapter);
```

The batcher batches on a one-second time window (`batchingCriteria: { paimaL2: { criteriaType: "time", timeWindowMs: 1000 } }`), keeps its queue in `./batcher-data` via `FileStorage`, and uses `confirmationLevel: "wait-effectstream-processed"`, so a successful `/send-input` call only returns once the sync node has processed the resulting rollup block.

Note one consequence of the decorator, if you copy it: `GatedAdapter` also *defines* `verifySignature`, and the batcher core calls an adapter's implementation whenever one exists instead of falling back to its own EVM signature check. Since `EffectstreamL2DefaultAdapter` does not implement that hook, the delegation resolves to `?? true`. That is fine for a local demo where the point is the validation hook; a production decorator should forward to the batcher's default verification instead of defaulting to `true`.

### Rate limiting

Validation is not the batcher's only gate. `POST /send-input` runs a rate-limit check *before* signature verification and `validateInput`, keyed by the strategy the adapter declares through the optional `getRateLimitKeyStrategy()` (`"ip"`, `"ip-and-address"` or `"composite"`), and answers with `429` plus a `Retry-After` header when the caller is over budget.

This template exercises the defaults rather than configuring them: `packages/batcher/batcher.dev.ts` sets no `rateLimit` in its `BatcherConfig`, so the SDK's defaults apply (1000 requests per 24-hour window), and `GatedAdapter` implements no key strategy, so limits are per IP. To tighten it, add `rateLimit: { maxRequests, windowMs }` to the config — `maxRequests` must be at least 1 and `windowMs` at least 1000 — or implement `getRateLimitKeyStrategy()` on the adapter to limit per wallet address as well.

### State machine

Nothing about the gate reaches the state machine — by design. A rejected input never becomes a transaction, so the transition only ever sees inputs that passed:

```ts
// packages/node/state-machine.ts
stm.addStateTransition("sendMessage", function* (data) {
  const { parsedInput, signerAddress: sender, blockHeight } = data;

  yield* World.resolve(insertCommand, {
    sender,
    message: parsedInput.message,
    block_height: blockHeight,
  });
});
```

### Database

Two tables. `gate_config` is a single-row table — the `CHECK (id = 1)` makes that structural — holding the policy the batcher reads:

```sql
-- packages/database/migrations/000-init.sql
CREATE TABLE gate_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  accepting BOOLEAN NOT NULL DEFAULT true,
  CHECK (id = 1)
);

CREATE TABLE commands (
  id SERIAL PRIMARY KEY,
  sender TEXT NOT NULL,
  message TEXT NOT NULL,
  block_height INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO gate_config (accepting) VALUES (true);
```

`gate_config` is written by an ordinary API handler rather than by the state machine, which is what makes the gate an operational switch rather than part of the replayable rollup state.

### API

| Method | Path | Response |
| --- | --- | --- |
| `GET` | `/api/gate` | `{ accepting: boolean }` — what `GatedAdapter` polls |
| `POST` | `/api/gate` | Body `{ accepting: boolean }`; sets the flag and echoes it |
| `GET` | `/api/commands` | Every processed command, newest first |

### Frontend

`packages/frontend/client/src/config.ts` points the wallet SDK at both the L2 contract and the batcher:

```ts
export const paimaConfig = new EffectstreamConfig(
  "",                                            // security namespace
  "mainEvmRPC",                                  // sync protocol name
  "0x5FbDB2315678afecb367f032d93F642f64180aa3",  // MyEffectstreamL2
  hardhat,
  undefined,                                     // default ABI
  "http://localhost:3334",                       // batcher URL
  true,                                          // preferBatchedMode
);
```

With `preferBatchedMode` on, `sendTransaction(wallet, ["sendMessage", message], paimaConfig, "wait-effectstream-processed")` posts to the batcher instead of signing an on-chain transaction — which is exactly the path `GatedAdapter` guards. The UI polls `/api/gate` and `/api/commands` every three seconds, so the gate button reflects the same row the batcher reads.

## Configuration

Everything is defaulted for the local stack; there is no mainnet entry point.

| Variable | Default | Where | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | set by `bun run dev` | `package.json` | Must be `development` for the orchestrator to use `start.dev.ts` |
| `PGLITE` | `true` for the sync process | `start.dev.ts` | `false` uses an external Postgres instead of embedded PGLite |
| `BATCHER_PORT` | `3334` | `packages/batcher/batcher.dev.ts` | Batcher HTTP port |
| `EVM_PRIVATE_KEY` | Hardhat account #1 key | `packages/batcher/batcher.dev.ts` | Signs the batcher's submissions to the L2 contract |
| `EFFECTSTREAM_API_PORT` | `9999` | runtime (`@effectstream/utils` ENV), `packages/tests/run-tests.ts` | Sync node HTTP API port |
| `DB_PORT` | `5432` | `packages/tests/run-tests.ts` | Postgres port used by the suite |
| `ENABLE_DEV_AND_DEBUG_ENDPOINTS` | `true` under tests | `packages/tests/start.test.ts` | Extra runtime endpoints, test stack only |

The gate URL is not an environment variable: it is the second constructor argument of `GatedAdapter`, defaulting to `http://localhost:9999/api/gate`. Point it at any HTTP service that answers `{ accepting: boolean }` — the adapter does not care that this one happens to be the sync node. The frontend's copy of the L2 contract address in `packages/frontend/client/src/config.ts` is hardcoded to Hardhat's first deterministic deployment address, while the node and batcher read the generated bindings from `@batcher-validations/contracts-evm`; if you add contracts ahead of it in the deployment order, update that constant.

## Testing

```sh
bun run test
```

`packages/tests/run-tests.ts` starts the orchestrator against `packages/tests/start.test.ts` — PGLite, Hardhat, the sync node and the batcher, but no frontend — waits for the deploy and for the node's `/health`, then runs two phases and shuts the stack down. File names below are relative to `packages/tests/`.

| Phase | Files | Covers |
| --- | --- | --- |
| A — Infrastructure | `infra/chain-ready.test.ts`, `infra/deploy.test.ts` | Hardhat responds on 8545 and `MyEffectstreamL2` deployed to a valid address |
| B — STM / DB / API | `stm/send-message.test.ts`, `stm/gate.test.ts`, `stm/api.test.ts` | A `sendMessage` input reaches the `commands` table, the gate defaults to open and toggles both ways, `/api/commands` serves the row |

`packages/tests/stm/send-message.test.ts` submits `["sendMessage", "hello world"]` straight to the contract with viem and a Hardhat key, so it verifies the sync path independently of the batcher. The batched path — and the rejection the gate produces — is what you exercise by hand in the browser.

## Where to go next

- [Batcher adapters](https://effectstream.io/home/components/batcher/adapter) — the full `BlockchainAdapter` interface, including `validateInput`, `verifySignature` and the rate-limit key strategy
- [Batcher configuration](https://effectstream.io/home/components/batcher/configuration) — batching criteria, confirmation levels, storage and rate limiting
- [Batching pipeline](https://effectstream.io/home/components/batcher/batching-pipeline) — what happens to an input between `/send-input` and the chain
- [`@effectstream/batcher-sdk`](https://effectstream.io/home/packages/tools/batcher-sdk) — package reference
- Sibling templates: [`minimal`](https://github.com/effectstream/effectstream/tree/main/templates/minimal) for the same node without a batcher, and [`preorder`](https://github.com/effectstream/effectstream/tree/main/templates/preorder) for adapter decorators used to admit trusted, unsigned internal jobs
