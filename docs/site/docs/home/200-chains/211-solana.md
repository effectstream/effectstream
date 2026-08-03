# Solana

EffectStream reads Solana through its JSON-RPC, polling slots and attributing program logs and lamport balances to configured watch targets. Writes go through a **fee-payer sponsor** batcher: the user partially signs a transaction whose fee payer is the batcher's sponsor key, and the batcher co-signs and submits — so the user spends no SOL. Browser wallets are supported via the Solana Wallet Standard (Phantom, Backpack, Solflare, MetaMask's Solana account), and Ed25519 signature verification ships in `@effectstream/crypto`.

## 1. Configuration (Read)

### Network Definition

```ts
.buildNetworks(builder =>
  builder.addNetwork({
    name: "solana",
    type: ConfigNetworkType.SOLANA,
    rpcUrl: "http://localhost:8899",  // Solana JSON-RPC URL
    networkId: "localnet",            // "mainnet-beta" | "devnet" | "testnet" | "localnet"
    // wsUrl: "ws://localhost:8900",  // optional
  })
)
```

### Sync Protocol

The protocol type is `SOLANA_RPC_PARALLEL`. It polls `getSlot`, then walks the range slot by slot with `getBlock`. **Skipped slots are normal on Solana** (no block was produced) and are passed over without error.

```ts
.buildSyncProtocols(builder =>
  builder.addParallel(
    (networks) => networks.solana,
    (network, deployments) => ({
      name: "parallelSolanaRPC",
      type: ConfigSyncProtocolType.SOLANA_RPC_PARALLEL,
      startBlockHeight: 0,
      pollingInterval: 2000,
      delayMs: 2400,
      confirmationDepth: 32,   // ~12.8s at 400ms slots
      // stepSize: 10,         // optional - slots per fetch batch (default: 10)
    })
  )
)
```

`confirmationDepth` is measured in **slots**, subtracted from the current slot to pick the frontier the fetcher will read up to. The default of 32 (~12.8 s) is a common mainnet trade-off between latency and reorg risk; on a local validator anything works.

Block ordering uses `blockTime`, which Solana guarantees is monotonically non-decreasing. Its resolution is one second while slots are ~400 ms, so consecutive slots routinely share a timestamp — the merge disambiguates those by slot order, not by the timestamp.

### Primitives

Three built-in primitives cover the Solana surface.

```ts
import {
  PrimitiveTypeSolanaProgramLog,
  PrimitiveTypeSolanaAccountBalance,
  PrimitiveTypeSolanaTokenAccount,
} from "@effectstream/sm/builtin";
```

A working example lives at [`e2e/solana/config.ts`](https://github.com/effectstream/effectstream/blob/main/e2e/solana/config.ts).

#### Program Logs (`PrimitiveTypeSolanaProgramLog`)

Captures the log lines a watched program emitted, per transaction.

```ts
.buildPrimitives(builder =>
  builder.addPrimitive(
    (sp) => sp.parallelSolanaRPC,
    () => ({
      name: "CounterLog",
      type: PrimitiveTypeSolanaProgramLog,
      startBlockHeight: 0,
      programId: "8veT8XVnBxG6kmq27CrCgznCtVHLJsBAqGHZrodKaRJ6",
      // eventType: "EFFECTSTREAM_COUNTER",  // optional substring filter
      stateMachinePrefix: "solana-program-log",
    }),
  )
)
```

Payload: `{ programId, slot, logMessages }`.

:::info Attribution is based on invocation, not account presence
A transaction may list any account key without calling it, so presence in `accountKeys` proves nothing. This primitive parses the log stream's `Program <id> invoke [N]` / `success` framing and fires **only if the program was actually invoked**, collecting just the lines emitted while it was the innermost frame. Two consequences worth knowing:

- Another program cannot trigger your primitive by echoing your event string in its own `msg!` output.
- `logMessages` contains only *your* program's lines, not every line in the transaction.

This also means programs reached through an **address lookup table** are captured correctly — they never appear in `message.accountKeys`, but they always appear in their `invoke` line.
:::

#### Account Balance (`PrimitiveTypeSolanaAccountBalance`)

Tracks a watched address's lamport balance as of each transaction that touches it, read from the transaction's `postBalances`.

```ts
.buildPrimitives(builder =>
  builder.addPrimitive(
    (sp) => sp.parallelSolanaRPC,
    () => ({
      name: "TreasuryBalance",
      type: PrimitiveTypeSolanaAccountBalance,
      startBlockHeight: 0,
      address: "GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB",
      stateMachinePrefix: "solana-account-balance",
    }),
  )
)
```

Payload: `{ address, lamports, slot }`. Lookup-table addresses are resolved, so an address pulled in via an ALT is still matched.

#### Token Account (`PrimitiveTypeSolanaTokenAccount`)

Tracks an SPL token balance as of each transaction that touches it, read from the transaction's `meta.postTokenBalances`.

```ts
.buildPrimitives(builder =>
  builder.addPrimitive(
    (sp) => sp.parallelSolanaRPC,
    () => ({
      name: "PlayerTokens",
      type: PrimitiveTypeSolanaTokenAccount,
      startBlockHeight: 0,
      mint: "2KW2XRd9kwqet15Aha2oK3tYvd3nWbTFH1MBiRAv1BE1",
      owner: "J2xccRtuG43drESLYznHhLhQkLTdfepcKYbiQ9BsJVaf",
      stateMachinePrefix: "solana-token-account",
    }),
  )
)
```

Payload: `{ tokenAccount, mint, owner, amount, decimals, slot }`.

At least one of `mint`, `owner` or `tokenAccount` is required — without a filter the primitive would match every token balance on chain, so the constructor rejects it. Combine them to narrow further. `tokenProgramId` optionally pins the primitive to classic SPL Token or to Token-2022; omit it to accept both.

`amount` is the raw u64 in base units, carried as a **string**. A u64 does not survive a JavaScript number, and at the top of its range it also exceeds PostgreSQL's signed `BIGINT` — store it as `TEXT` and pair it with `decimals` to render a display value.

Balance records carry an `accountIndex` into the same resolved account list as `postBalances`, so a token account reached through an address lookup table is matched correctly here too.

:::caution Closing a token account produces no event
This reports post-state balances only, matching Account Balance. A token account that is **closed** appears in `preTokenBalances` and is absent from `postTokenBalances`, so closure emits nothing rather than a zero balance. If your state machine needs to observe accounts going away, track it from the owning program's logs instead.
:::

:::note Reverted transactions are skipped
No primitive emits for a transaction whose `meta.err` is set. A failed transaction's logs describe work that was rolled back and its `postBalances` are the pre-state, so neither is a fact about chain state.
:::

## 2. Batcher (Write)

### Fee-Payer Sponsor: `SolanaAdapter`

The gasless flow, end to end:

1. The client builds a transaction and sets `feePayer` to the batcher's **sponsor** public key (`adapter.getAccountAddress()`).
2. The user partially signs it and POSTs the **base64** serialization to the batcher.
3. The batcher validates it, adds the fee-payer signature, and submits.
4. The result is read back by the sync primitives above — the batcher writes no blob of its own.

```ts
import { SolanaAdapter } from "@effectstream/batcher-sdk";

const adapter = new SolanaAdapter({
  rpcUrl: "https://api.mainnet-beta.solana.com",
  batcherSecretKey: "…",                  // base58, 64-byte secret key; hold securely
  targetProgramId: "AKnL4NNf3DGWZJS6cPknBuEGnVsV4A4m5tgebLHaRSZ9", // your program
  syncProtocolName: "parallelSolanaRPC",
  // maxBatchSize: 10,                    // transactions per cycle
  // allowSponsorAsInstructionAccount: false,
  // maxPriorityFeeMicroLamports: 0n,
});
```

Transactions must be **base64**-encoded (`tx.serialize({ requireAllSignatures: false }).toString("base64")`). Each is submitted independently; there is no aggregated blob.

:::warning The sponsor pays. Understand these limits before funding it.
`validateInput` enforces three structural rules so a sponsor cannot be drained by a single crafted transaction:

1. **Fee payer must be the sponsor.**
2. **Every instruction must target `targetProgramId`** — which auto-rejects System transfers, token moves, and any other program.
3. **The sponsor may appear only as fee payer**, never inside an instruction's accounts. Programs that need the sponsor to fund rent (PDA creation) opt in with `allowSponsorAsInstructionAccount: true`.

Plus one that is easy to miss: the fee payer also pays the **prioritization fee**, so an uncapped `SetComputeUnitPrice` is user-controlled spend from your sponsor. `maxPriorityFeeMicroLamports` defaults to `0n` — any priority-fee instruction is rejected. Raise it deliberately, and note the real cost is `price × computeUnitLimit / 1e6`.

**Volume is bounded by the batcher, not the adapter.** Every accepted transaction still costs the sponsor the 5000-lamport base fee, so the rate limit is a spend cap. Two things to know before exposing a funded batcher publicly:

- **It is already on.** Omitting `rateLimit` from `BatcherConfig` does not disable it — the server falls back to 1000 requests per 24 hours. Set the block explicitly and size `maxRequests` against what you are willing to spend, rather than inheriting a number you did not choose.
- **Key it per wallet, not just per IP.** `SolanaAdapter` takes `rateLimitKeyStrategy`, defaulting to `"ip"`. On a shared network (a venue, an office, a carrier NAT) every user sits behind one address and so shares one bucket. `"ip-and-address"` adds an independent per-wallet budget, and is sound here because `verifySignature` rejects an address that did not sign.

`InMemoryRateLimitStore` is per process, so counts reset on restart and are not shared between replicas. Implement `RateLimitStore` against Redis or Postgres for a deployment that is more than one process.
:::

`verifySignature` requires that the address the submitter claims is actually one of the transaction's signers, so submissions cannot be attributed to a third party.

### Capacity Exchange (dust sponsor)

`CapacityExchangeClient` is exported for operators who prefer the [SundaeSwap capacity-exchange](https://github.com/SundaeSwap-finance/capacity-exchange) pattern — the user partially signs, a CES server adds the fee-payer signature, and the balanced transaction comes back for submission. It is a standalone utility and is **not** wired into `SolanaAdapter`; the default path above is the fee-payer sponsor model.

## 3. Browser Wallets (Connect)

`WalletMode.Solana` connects any wallet implementing the Solana Wallet Standard, plus the legacy injected globals.

```ts
import { walletLogin, WalletMode } from "@effectstream/wallets";

const result = await walletLogin({
  mode: WalletMode.Solana,
  preference: { name: "phantom" },   // or "backpack", "solflare", "standard:<name>"
});

const provider = result.result;
const { address, type } = provider.getAddress();   // type === AddressType.SOLANA
const signature = await provider.signMessage("hello");   // base64
```

Detected automatically: **Phantom** (`window.phantom.solana`), **Backpack** (`window.backpack.solana`), **Solflare** (`window.solflare`), a generic `window.solana`, and every Wallet Standard wallet exposing `solana:signMessage` — which is how MetaMask's Solana account registers. Duplicates are de-duplicated by display name.

`signMessage` returns a **base64** signature, matching what `CryptoManager.Solana()` verifies. `signTransaction` takes and returns **base64**, matching the batcher's payload contract.

For headless tests and e2e there is `SolanaLocalConnector` (`@effectstream/wallets/solana-local`), which signs in-process with a generated Ed25519 key — the analogue of `CardanoLocal` / `MidnightLocal`.

## 4. Cryptography (Verify)

Solana addresses are `AddressType.SOLANA`: base58-encoded 32-byte Ed25519 public keys.

```ts
import { CryptoManager } from "@effectstream/crypto";
import { AddressType } from "@effectstream/utils";

const crypto = CryptoManager.getCryptoManager(AddressType.SOLANA);

crypto.verifyAddress(address);                                  // base58, decodes to 32 bytes
await crypto.verifySignature(address, message, signatureB64);   // Ed25519 over UTF-8 message bytes
```

Signatures are base64-encoded, matching what both `SolanaProvider.signMessage` and `SolanaLocalConnector` produce.

## 5. Orchestration

`launchSolana` brings up a local `solana-test-validator` alongside your other dev processes.

```ts
// in start.dev.ts
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite } from "@effectstream/orchestrator/launch-pglite";
import { launchSolana } from "@effectstream/orchestrator/scripts/launch-solana";

export default {
  processes: [
    ...launchPglite(),
    ...launchSolana("@my-project/contracts-solana", { resolveFrom: import.meta.dirname! }),
  ],
} satisfies OrchestratorConfig;
```

It expects the target workspace package to expose two scripts:

```json
{
  "name": "@my-project/contracts-solana",
  "dependencies": {
    "@effectstream/solana-node": "latest"
  },
  "scripts": {
    "chain:start": "bun ./node_modules/.bin/solana-node",
    "chain:wait": "wait-on tcp:8899"
  }
}
```

`@effectstream/solana-node` downloads a pinned `solana-test-validator` on first use and **verifies its SHA-256** before executing it. RPC binds `127.0.0.1` by default (override with `SOLANA_BIND_ADDRESS`); note the faucet ignores that and always listens on all interfaces, as the validator offers no flag to restrict it.

:::caution Agave version pin
The binary is pinned to **Agave 3.0.14**, not the latest release. Agave ≥ 3.1 hard-asserts io_uring support on Linux and panics during init where it is unavailable — including inside Docker, whose default seccomp profile blocks the io_uring syscalls. Since the e2e suite runs containerized, 3.1+ cannot start in CI as currently configured. macOS builds don't compile the assert in, so a newer version appears to work locally and then fails in CI. Read the note in `packages/binaries/solana-node/index.js` before bumping it.
:::

### Reference setup

- [`e2e/solana/launcher.cli.ts`](https://github.com/effectstream/effectstream/blob/main/e2e/solana/launcher.cli.ts) — orchestrator config launching the validator, sync node, and batcher.
- [`e2e/solana/config.ts`](https://github.com/effectstream/effectstream/blob/main/e2e/solana/config.ts) — `ConfigBuilder` wiring for both primitives.
- [`e2e/solana/sync/`](https://github.com/effectstream/effectstream/tree/main/e2e/solana/sync) — one test file per primitive, plus the gasless batcher round-trip.
- [`templates/solana-starter`](https://github.com/effectstream/effectstream/tree/main/templates/solana-starter) — full stack: a Rust counter program, sync node, gasless batcher, and a React frontend.
