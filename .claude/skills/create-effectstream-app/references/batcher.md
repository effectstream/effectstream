# Batcher

The batcher aggregates user transactions and submits them to one or more chains. Each chain requires an adapter.

> **See also (concept docs).**
> - Batcher overview + introduction: `docs/site/docs/home/100-components/108-batcher/1200-overview.md`, `docs/site/docs/home/100-components/108-batcher/1210-introduction.md`
> - Core concepts (target chains, namespace, signature verification): `docs/site/docs/home/100-components/108-batcher/1220-core-concepts.md`
> - Batching pipeline (how inputs flow): `docs/site/docs/home/100-components/108-batcher/1230-batching-pipeline.md`
> - Configuration (config-object vs fluent / "dynamic" vs "unified"): `docs/site/docs/home/100-components/108-batcher/1240-configuration.md`
> - Adapter authoring: `docs/site/docs/home/100-components/108-batcher/1250-adapter.md`, `docs/site/docs/home/500-packages/550-tools/batcher-sdk.md`
> - Advanced topics (storage, custom batching criteria): `docs/site/docs/home/100-components/108-batcher/1290-advanced-topics.md`
>
> ⚠️ Note: the published npm package is `@effectstream/batcher-sdk` (with the `-sdk` suffix) and the exported class is `EffectstreamL2DefaultAdapter` (lowercase "s"). Older docs sometimes show `@effectstream/batcher` or `EffectStreamL2DefaultAdapter` (Pascal-S) — both are stale.

Layout pattern:
- **Adapter factory** (e.g. `effectstream-l2.ts`) — environment-agnostic; owns chain-specific resolution (contract addresses, etc.).
- **Entry point** (`batcher.dev.ts` / `batcher.mainnet.ts`) — passes env vars to factories, no chain logic.

## Adapter factory (`packages/batcher/effectstream-l2.ts`)

```ts
import { EffectstreamL2DefaultAdapter } from "@effectstream/batcher-sdk";
import { contractAddressesEvmMain } from "@my-template/contracts-evm";

export interface EffectstreamL2Env {
  chainId: number;
  contractModule: string;
  privateKey: string;
  fee: bigint;
  syncProtocolName: string;
}

function getContractAddress(chainId: number, contractModule: string): `0x${string}` {
  const addresses = contractAddressesEvmMain() as Record<string, Record<string, `0x${string}`>>;
  const address = addresses[`chain${chainId}`]?.[contractModule];
  if (!address) throw new Error(`Contract address not found for chain${chainId}/${contractModule}`);
  return address;
}

export function createEffectstreamL2Adapter(env: EffectstreamL2Env) {
  return new EffectstreamL2DefaultAdapter(
    getContractAddress(env.chainId, env.contractModule),
    env.privateKey,
    env.fee,
    env.syncProtocolName,
  );
}
```

## Entry point (`packages/batcher/batcher.dev.ts`)

```ts
import { main, suspend } from "effection";
import { createNewBatcher, FileStorage, type BatcherConfig } from "@effectstream/batcher-sdk";
import { createEffectstreamL2Adapter } from "./effectstream-l2.ts";

const batchIntervalMs = 1000;
const port = Number(process.env.BATCHER_PORT ?? "3334");

const paimaL2 = createEffectstreamL2Adapter({
  chainId: 31337,
  contractModule: "EffectstreamL2Module#MyEffectstreamL2",
  privateKey: process.env.EVM_PRIVATE_KEY ??
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  fee: 0n,
  syncProtocolName: "mainEvmRPC",
});

const config: BatcherConfig = {
  pollingIntervalMs: batchIntervalMs,
  adapters: { paimaL2 },
  defaultTarget: "paimaL2",
  namespace: "",                       // ⚠️ must match frontend EffectstreamConfig appName
  batchingCriteria: {
    paimaL2: { criteriaType: "time", timeWindowMs: batchIntervalMs },
  },
  confirmationLevel: "wait-effectstream-processed",
  enableHttpServer: true,
  enableEventSystem: true,
  port,
};

const storage = new FileStorage("./batcher-data");
const batcher = createNewBatcher(config, storage);

main(function* () {
  batcher.addStateTransition("startup", ({ publicConfig }) => {
    console.log(`Batcher startup — polling every ${publicConfig.pollingIntervalMs}ms`);
  });
  batcher.addStateTransition("http:start", ({ port }) => {
    console.log(`HTTP Server ready on port ${port}`);
  });

  yield* batcher.runBatcher();
  yield* suspend();
});
```

## `/send-input` request shape (the only HTTP contract the batcher exposes)

The batcher's HTTP server has one write endpoint: `POST /send-input`. Anything that submits a user action through the batcher — the frontend (`sendTransaction` from `@effectstream/wallets`), a custom bridge daemon, a CI test, etc. — hits this endpoint. The schema is:

```ts
// Request body
{
  data: {
    address: string,                    // wallet address (lowercased for EVM, bech32 for Cardano, etc.)
    addressType: number,                // see AddressType enum from @effectstream/utils
    input: string,                      // the concise/grammar-encoded payload (e.g. JSON.stringify(["createRoom", "test", 4]))
    signature?: string,                 // wallet signature; required for namespaces that verify
    timestamp: string,                  // millisecond Unix timestamp as a string
    target?: string,                    // adapter name to route to (defaults to defaultTarget)
  },
  confirmationLevel?: "no-wait" | "wait-receipt" | "wait-effectstream-processed",  // default "wait-receipt"
  timeoutMs?: number,                   // default 60000ms for receipt-level confirmation
}
```

**The most common bug**: posting the inner fields directly (`{ address, addressType, input, ... }`) without the `data:` wrapper. The batcher's Fastify validator responds with `400 must have required property 'data'`. The `data` wrapper exists so `confirmationLevel` and `timeoutMs` can sit alongside it without colliding with the input itself.

```ts
// ❌ WRONG — Fastify returns 400 "must have required property 'data'"
fetch(`${BATCHER_URL}/send-input`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ address, addressType: 1, input, timestamp: String(Date.now()) }),
});

// ✅ CORRECT
fetch(`${BATCHER_URL}/send-input`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    data: { address, addressType: 1, input, timestamp: String(Date.now()) },
    confirmationLevel: "wait-effectstream-processed",
  }),
});
```

`@effectstream/wallets`' `sendTransaction` builds this body automatically — anything that uses the wallet SDK is fine. Custom code (bridge daemons, server-side relayers, CI tests) needs to wrap manually.

The OpenAPI explorer at `${BATCHER_URL}/documentation` reflects the live schema and is the authoritative reference if anything ever changes.

## ⚠️ Namespace must equal frontend appName

`BatcherConfig.namespace` **must exactly match** the `EffectstreamConfig` `appName` used by the frontend when signing transactions. The signed message includes `appName`; the batcher validates the signature against `namespace`. A mismatch produces `401 Invalid signature` from `/send-input`.

Pick one string (often `""` or the template name like `"my-template"`) and use it in BOTH places.

## Available adapters

| Adapter | Chain | Batching criteria |
|---|---|---|
| `EffectstreamL2DefaultAdapter` | EVM | time, size, hybrid |
| `EvmContractAdapter` | EVM (custom contract) | time, size, hybrid |
| `MidnightAdapter` | Midnight | size (typically 1) |
| `BitcoinAdapter` | Bitcoin | hybrid |
| `NearAdapter` | NEAR | time, size |
| `NearIntentAdapter` | NEAR (intents) | time, size |

## Two configuration patterns

### Pattern A — Config-based (adapters in config)

```ts
const config: BatcherConfig = {
  adapters: { myAdapter },
  defaultTarget: "myAdapter",
  batchingCriteria: { myAdapter: { criteriaType: "time", timeWindowMs: 1000 } },
  // …
};
const batcher = createNewBatcher(config, storage);
```

### Pattern B — Fluent (preferred for new templates)

```ts
const config: BatcherConfig<DefaultBatcherInput> = {
  pollingIntervalMs: 1000,
  enableHttpServer: true,
  // … no adapters field
};
const batcher = createNewBatcher(config, storage);
batcher
  .addBlockchainAdapter("myAdapter", adapter, { criteriaType: "time", timeWindowMs: 1000 })
  .setDefaultTarget("myAdapter");
```

Pattern B separates configuration from adapter wiring and makes it easy to conditionally add adapters (e.g. skip Midnight when `DISABLE_MIDNIGHT=true`).

## Multi-environment

```
packages/batcher/
├── effectstream-l2.ts          # Factory (env-agnostic)
├── midnight-balancing.ts       # (optional) Midnight factory
├── batcher.dev.ts              # Hard-coded dev defaults
└── batcher.mainnet.ts          # Validates env vars, passes them to factories
```

Mainnet entry point validates required env vars at the top:

```ts
const EVM_PRIVATE_KEY = process.env.EVM_PRIVATE_KEY;
if (!EVM_PRIVATE_KEY) throw new Error("EVM_PRIVATE_KEY is required for mainnet");

const CONTRACT_ADDRESS = process.env.EVM_CONTRACT_ADDRESS;
if (!CONTRACT_ADDRESS) throw new Error("EVM_CONTRACT_ADDRESS is required for mainnet");

const paimaL2 = createEffectstreamL2Adapter({
  chainId: Number(process.env.EVM_CHAIN_ID),
  contractModule: process.env.EVM_CONTRACT_MODULE!,
  privateKey: EVM_PRIVATE_KEY,
  fee: BigInt(process.env.EVM_FEE ?? "0"),
  syncProtocolName: "mainEvmRPC",
});
```

## Where the batcher fits in `start.dev.ts`

```ts
{
  name: "batcher",
  description: "Transaction batcher",
  args: ["run", "packages/batcher/batcher.dev.ts"],
  waitToExit: false,
  type: "system-dependency",
  link: "http://localhost:3334",
  stopProcessAtPort: [3334],
  dependsOn: [EvmNames.GENERATE_MOD],
},
```

The batcher reads contract addresses from `contractAddressesEvmMain()`, which only exists after `generate-evm-mod` runs — so always include that in `dependsOn`.
