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

The protocol type is `SOLANA_RPC_PARALLEL`. It reads Solana in one of two modes (`mode`):

- **`block`** (the default): it polls `getSlot`, then reads every slot of the range with `getBlock`, several at a time, and applies the blocks strictly in slot order. **Skipped slots are normal on Solana** (no block was produced) and are passed over without error.
- **`program`**: it reads only the transactions of the programs its `SOLANA:ProgramLog` primitives watch, by signature. See [Program mode](#program-mode) below.

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
      // mode: "block",        // optional - "block" (default) or "program"
      // stepSize: 10,         // optional - slots per fetch batch (default: 10)
      // getBlockConcurrency: 8,            // optional - getBlock calls in flight (default 8)
      // getBlockMinIntervalMs: 0,          // optional - minimum spacing between getBlock calls
      // rateLimitRetries: 10,              // optional - waits on HTTP 429 per slot
      // rateLimitBackoffMs: 500,           // optional - first 429 wait, doubled up to rateLimitMaxBackoffMs (15000)
      // maxSupportedTransactionVersion: 1, // optional - see below
    })
  )
)
```

**Reading speed and rate limits.** One `getBlock` takes about half a second even on a private RPC, and devnet produces about 4 slots a second, so blocks are fetched `getBlockConcurrency` at a time (8 by default) and still applied strictly in slot order: a slot that fails stops the scan there, and the next poll resumes at it. On HTTP 429 the fetcher waits (`Retry-After`, else a doubling backoff) without counting the wait as a failure, and halves its concurrency for the next batch; clean batches grow it back. `getBlockMinIntervalMs` paces the calls for a rate-limited RPC (the public devnet RPC allows about 6 `getBlock` per 10 s, too few for a node to keep up; use a private RPC).

**Transaction versions.** Devnet blocks hold version-1 transactions since solana-core 4.x. A block requested below its highest transaction version fails as a whole (-32015), so `getBlock` asks for `maxSupportedTransactionVersion: 1` (the `json` encoding of a v1 transaction has the same `accountKeys`, `instructions` and `logMessages` as a v0 one). A -32015 that names a higher version raises it once; an RPC that rejects the value falls back to 0. A transaction the reader cannot parse is skipped and counted, never fatal to its block.

`confirmationDepth` is measured in **slots**, subtracted from the current slot to pick the frontier the fetcher will read up to. The default of 32 (~12.8 s) is a common mainnet trade-off between latency and reorg risk; on a local validator anything works.

Block ordering uses `blockTime`, which Solana guarantees is monotonically non-decreasing. Its resolution is one second while slots are ~400 ms, so consecutive slots routinely share a timestamp — the merge disambiguates those by slot order, not by the timestamp.

### Program mode

Block mode makes one `getBlock` per slot whether anything happened or not: about 360,000 a day on devnet, plus a `getSlot` per pass, because at the tip the fetch loop never rests. An app that only watches its own programs can read just their transactions instead:

```ts
() => ({
  name: "parallelSolanaRPC",
  type: ConfigSyncProtocolType.SOLANA_RPC_PARALLEL,
  mode: "program",
  startBlockHeight: 0,
  pollingInterval: 6000,   // one poll every 6 s, always
  delayMs: 2400,
})
```

Each poll, every `pollingInterval`, with or without new transactions:

1. `getSlot` at `finalized`: the tip `F`, a root that never rolls back.
2. `getBlockTime(F)`: the chain's time at the tip, stepping back over a skipped slot (at most 64 slots).
3. Per watched program, `getSignaturesForAddress` at `finalized` with `minContextSlot: F`: a first page of 10, then pages of 1,000 with `before`, back to the last transaction already read. It never uses `until`: an RPC answers an unknown `until` with an empty list and no error, which would hide every new transaction.
4. It keeps the entries at or below `F` (those above wait for the next poll), not yet read, and not failed, and fetches each with `getTransaction` (the same `maxSupportedTransactionVersion` handling as `getBlock`), oldest first.

An idle poll is therefore 3 calls for one program: about 43,000 a day at 6 s. Each new transaction adds one `getTransaction`.

The outputs feed the same parser, so the primitives are the records block mode gives, in the same order (slot, then index in the block), and each one's merge key is its own `blockTime` (plus `delayMs`). The progress mark after a poll is the tip's `blockTime`, so the merge with the other chains advances at the chain's pace. A transaction therefore lands in the same Effectstream block in both modes. The mode reads **no wall clock**: every time it uses comes from the chain, and it waits only with timers (a `Retry-After` HTTP date is ignored; the seconds form is honoured).

The resume point is a **cursor**, the newest slot read and the signatures read in it. It rides in the resume marker the runtime saves with each block, in the same database transaction, so a restart continues after the last committed transaction with no gap and no duplicate. A poll succeeds or fails as a whole: a call that still fails after its retries (429 backoff as above; other errors 3 attempts) changes nothing, and the next poll starts again from the cursor.

Limits and differences:

- **Only `SOLANA:ProgramLog` primitives.** A token transfer need not list its mint, so `getSignaturesForAddress` cannot find every `AccountBalance` or `TokenAccount` change; program mode refuses to start with them.
- `stepSize`, `confirmationDepth`, `getBlockConcurrency` and `getBlockMinIntervalMs` do not apply (`stepSize` still sizes the buffer cap when `maxBufferedPages` is unset).
- **Each mode refuses the other mode's database** (a program-mode resume marker carries a cursor, a block-mode one does not). There is no migration; switch modes on a new database.
- The Effectstream block hash differs from block mode's: program mode records each slot's first signature in `blockInfo`, since it has no block hash. It is still deterministic.
- `logIndex` is the transaction's index in its block, from `transactionIndex`. An RPC that omits it (Helius does not document it) gets the list's order instead, with a warning, and `logIndex` may then differ from block mode's.

`/health` reports, under each Solana protocol's `details`, the mode and the RPC calls per method since start (both modes), and in program mode the interval, polls, progress (tip slot and `blockTime`) and cursor.

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

**Volume is bounded by the batcher, not the adapter.** Solana charges 5000 lamports per signature. A sponsored transaction has at least the user's signature plus the sponsor fee-payer signature, so its base fee is at least 10000 lamports and can be higher with additional signers. Three things to know before exposing a funded batcher publicly:

- **Bound unauthenticated verification work.** `preAuthMaxRequests` limits schema-valid requests from one source IP before signature verification and defaults to the effective global ceiling. Its server-scoped key contains no request-body target or address, so forged identities cannot evade it or spend a victim wallet's authenticated allowance.
- **Set the target-wide ceiling explicitly.** Omitting `rateLimit` does not disable it — the server falls back to 1000 authenticated requests per 24 hours. `globalMaxRequests` is the total allowance across every IP and wallet for this adapter target; when omitted it defaults to `maxRequests`. Size that global value against the sponsor balance, allowing for every required signature and any permitted priority fee.
- **Use a lower verified-wallet allowance.** `SolanaAdapter` takes `rateLimitKeyStrategy`, defaulting to `"ip"`. With `"ip-and-address"`, the shared IP uses the global ceiling while each verified address uses `maxRequests`. Configure `maxRequests < globalMaxRequests` so one wallet reaching its allowance does not throttle everybody behind the same venue, office, or carrier NAT. The address bucket is consumed only after `verifySignature` proves that address signed, preventing targeted bucket poisoning.

`InMemoryRateLimitStore` is per process, so counts reset on restart and are not shared between replicas. A multi-process deployment needs a `RateLimitStore` whose multi-bucket `consume` operation is atomic across Redis or Postgres. This `consume` requirement replaces the former split `count`/`hit` custom-store contract and is a breaking interface change.
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

`@effectstream/solana-node` downloads a pinned `solana-test-validator` on first use and **verifies its SHA-256** before executing it. With Agave 3.0.14 the JSON-RPC and faucet ports listen on **all interfaces** even though the wrapper passes `--bind-address 127.0.0.1` (`SOLANA_BIND_ADDRESS` only moves the gossip/TPU bind; the validator offers no flag to restrict RPC or faucet, and `0.0.0.0` makes it panic at start). Keep the ports off untrusted networks, e.g. publish them only on `127.0.0.1` from Docker. The local ledger is capped at the validator's default 10,000 shreds unless you pass `limitLedgerSize` / `SOLANA_LIMIT_LEDGER_SIZE` (see the package README); with the default, history older than roughly 20–25 minutes is purged.

:::caution Agave version pin
The binary is pinned to **Agave 3.0.14**, not the latest release. Agave ≥ 3.1 hard-asserts io_uring support on Linux and panics during init where it is unavailable — including inside Docker, whose default seccomp profile blocks the io_uring syscalls. Since the e2e suite runs containerized, 3.1+ cannot start in CI as currently configured. macOS builds don't compile the assert in, so a newer version appears to work locally and then fails in CI. Read the note in `packages/binaries/solana-node/index.js` before bumping it.
:::

### Reference setup

- [`e2e/solana/launcher.cli.ts`](https://github.com/effectstream/effectstream/blob/main/e2e/solana/launcher.cli.ts) — orchestrator config launching the validator, sync node, and batcher.
- [`e2e/solana/config.ts`](https://github.com/effectstream/effectstream/blob/main/e2e/solana/config.ts) — `ConfigBuilder` wiring for both primitives.
- [`e2e/solana/sync/`](https://github.com/effectstream/effectstream/tree/main/e2e/solana/sync) — one test file per primitive, plus the gasless batcher round-trip.
- [`templates/solana-starter`](https://github.com/effectstream/effectstream/tree/main/templates/solana-starter) — full stack: a Rust counter program, sync node, gasless batcher, and a React frontend.
