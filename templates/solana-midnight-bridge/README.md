# Solana ↔ Midnight Bridge

> A proof-of-concept bridge: SPL tokens locked in a Solana program are minted as shielded tokens on Midnight, and burned on Midnight to release them.

A user locks an SPL token in a Solana program and receives the same amount as a **shielded**
token on Midnight, in their own wallet. Burning that token in the Midnight contract releases
the SPL tokens from the Solana vault to any Solana address. An Effectstream node watches both
chains, keeps one row per transfer, and runs a relayer that submits the counterpart
transaction on the other chain. The node, not the relayer, decides when a transfer is done:
a transfer is `completed` only once sync has seen the counterpart on chain.

It is a proof of concept with one operator key, not a production bridge (see
[Known limits](#known-limits)). It is worth reading if you are moving value between two chains
that cannot see each other, if you need a Midnight contract to accept a Solana signature, or if
you want a worked example of an Effectstream node that syncs two chains and also acts on them.

## What this template shows

**A Solana key authorizes a Midnight mint, inside the circuit.** `mintFromSolana` in
`packages/contracts-midnight/contract-bridge/src/bridge.compact` verifies an Ed25519 signature
from the operator's **Solana** key with compactc 0.35.0's `ed25519Verify`. The same key operates
the Solana program, so one key controls both sides, and the relayer's Midnight wallet only pays
fees. The signed message binds the contract address, the network, the lock nonce, the recipient
and the amount, so a signature cannot be replayed on another bridge instance, another network or
for another amount:

```compact
// packages/contracts-midnight/contract-bridge/src/bridge.compact
assert((curve25519PointX(sig.r) as Bytes<32>) != pad(32, ""), "R is the identity");
assert(ed25519Verify<40>(msg, sig, operatorKey), "bad signature");
const n = disclose(lockNonce);
const v = disclose(amount);
assert(v > 0, "zero amount");
assert(!mintedLocks.member(n), "lock already minted");
mintedLocks.insert(n, v);
return mintShieldedToken(domainSep(sourceMint), v, disclose(mintNonce), disclose(recipient));
```

**Completion comes from sync, never from the relayer.** The state machine owns
`bridge_transfers` and moves a row from `observed` to `completed` only when it sees the other
side on chain: the lock nonce appears in the contract's `mintedLocks`, or the Solana program
logs a `RELEASE` for the withdrawal id. The relayer writes only its own `relayer_jobs` table
(attempts, last transaction, last error). It is at-least-once by design: a duplicate mint or
release is refused on chain (`mintedLocks`, and one release-receipt PDA per withdrawal id), and
every state-machine write is an idempotent upsert. A wiped database re-synced from the
deployment's start heights ends with the same rows.

**One node syncs two chains and acts on both.** `packages/node/main.ts` starts the sync
(`SOLANA:ProgramLog` on the program, `Midnight:Generic` on the contract) and, in the same
process, the relayer with an **embedded batcher**: no HTTP server, two adapters. Mints go through
`MidnightAdapter`, which proves the mint circuit on a separate contract prover and attaches the
recipient's encryption key, so the shielded coin can be minted to a third party. Releases go
through `SolanaSignerAdapter`, which signs with the operator key and refuses any program that is
not allow-listed.

**A 0.35.0 contract next to the engine's runtime.** The contract is compiled with a pinned
compactc 0.35.0 (`packages/contracts-midnight/scripts/fetch-compactc.sh`, SHA-256 checked). Its
module needs compact-runtime 0.20, while the engine uses 0.18. The template installs 0.20 under
the alias `@midnight-ntwrk/compact-runtime-0.20` and rewrites the generated module to import it
(`packages/contracts-midnight/scripts/pin-contract-runtime.mjs`). Both runtimes share one
onchain-runtime, so ledger values cross the boundary unchanged.

## Effectstream features used

| Feature | Where | Used for |
| --- | --- | --- |
| `@effectstream/sm` state machine | `packages/node/state-machine.ts`, `packages/node/stf-logic.ts` | Idempotent transfer rows, completion decided from chain data |
| Grammar (`builtinGrammars.solanaProgramLog`, `builtinGrammars.midnightGeneric`) | `packages/node/grammar.ts` | One input per watched contract |
| NTP main sync protocol (`ConfigSyncProtocolType.NTP_MAIN`) | `packages/node/config.ts` | One ordered timeline for two chains |
| Solana sync via `PrimitiveTypeSolanaProgramLog` (`SOLANA_RPC_PARALLEL`, `mode: "program"` live) | `packages/node/config.ts` | The program's `LOCK` and `RELEASE` log lines, read by signature (only the program's transactions) |
| Midnight contract state via `PrimitiveTypeMidnightGeneric` + `midnightLedgerFromTxStateHex` | `packages/node/config.ts` | The contract's `mintedLocks` and `withdrawals` maps |
| Custom API routes (`StartConfigApiRouter`) | `packages/node/api.ts` | `GET /transfers`, `GET /transfers/:id` |
| Embedded batcher (`createNewBatcher`, `enableHttpServer: false`) | `packages/node/relayer/batcher.ts` | The relayer's submissions, never exposed over HTTP |
| `MidnightAdapter` with `contractProofServer` and `coinEncPublicKeyMappings` | `packages/node/relayer/batcher.ts`, `packages/node/relayer/jobs.ts` | Proving the mint on the contract prover; shielded mint to the recipient |
| `SolanaSignerAdapter` (`signSolanaSignerInput`) | `packages/node/relayer/batcher.ts`, `packages/node/relayer/jobs.ts` | Operator-signed `Release` with a program allow-list |
| `deployMidnightContract` with two provers | `packages/contracts-midnight/deploy.ts` | Wallet fees on the DUST prover, contract proofs on the contract prover |
| `parseShieldedAddress` (`@effectstream/midnight-contracts/shielded-address`) | `packages/cli/args.ts` | Splitting a `mn_shield-addr_…` recipient into its two keys |
| `@effectstream/npm-midnight-proof-server` (version and port) | `packages/contracts-midnight/package.json` | Running proof server 9.0.0-rc.8 beside the DUST prover |
| `@effectstream/solana-node` (`bpfPrograms`) | `packages/contracts-solana/chain-start.ts` | A local validator with the bridge program preloaded |
| Orchestrator (`launchPglite`, `launchSolana`, `launchMidnight`) | `start.dev.ts`, `start.live.ts` | Local chains, provers, deploys and the node in one command |
| Migrations + pgtyped queries (`@effectstream/db`) | `packages/database/` | `bridge_transfers` and `relayer_jobs` |
| DB mutex (`acquireDBMutex`) | `packages/node/relayer/mod.ts` | The relayer polls the database beside the sync |

## Quick start

> [!IMPORTANT]
> **This template requires the engine changes in
> [effectstream/effectstream PR #935](https://github.com/effectstream/effectstream/pull/935).
> Use `./link.sh` / `LINK_LOCAL=1` until they are released.**
>
> PR #935 adds:
> - the split contract prover;
> - third-party shielded mints;
> - `SolanaSignerAdapter`;
> - the Curve25519 argument types;
> - the local validator's ledger-size option.
>
> None of these is in a published `@effectstream/*` release yet. Until they are, run the
> template **inside the Effectstream monorepo**, linked to the local engine with `./link.sh`.
> A plain `bun i` installs the published 0.200.6 packages, which lack them. For the same reason,
> CI does not run this template yet: it is not in the `ENABLED` list of
> `templates/run-template-tests.ts`.

**Prerequisites**

- [Bun](https://bun.sh).
- **Docker.** Proof server 9.0.0-rc.8, the only one that proves the Ed25519 mint circuit, runs
  from the `midnightntwrk/proof-server:9.0.0-rc.8` image: there is no published binary for it
  yet. It peaks at about 4 GiB of memory while proving a mint. Without Docker (for example inside
  a container with no Docker socket), run an rc.8 prover yourself and set
  `MIDNIGHT_CONTRACT_PROOF_SERVER_URL` to it: `bun run dev` then starts none, waits for that one,
  and the relayer and the CLI prove on it.
- The `compact` CLI on your `PATH`. The orchestrator's Midnight launcher checks for it, although
  this template compiles its contract with its own pinned compactc 0.35.0, which
  `packages/contracts-midnight/scripts/fetch-compactc.sh` downloads and verifies on first use
  (Linux x86_64 / aarch64, macOS arm64 / x86_64).
- `openssl`, used by the indexer launch script to generate a secret.
- No Rust toolchain: the Solana program is committed prebuilt
  (`packages/contracts-solana/build/bridge.so`). Rebuilding it is optional, see
  `packages/contracts-solana/scripts/build-program.ts`.

**Run it** (from `templates/solana-midnight-bridge` in the monorepo)

```sh
./link.sh        # install, then link every @effectstream/* package to the local engine
bun run dev      # PGLite, Solana validator, Midnight devnet, both provers, deploys, node + relayer
```

The first start compiles the Midnight contract (about 30 s natively, mostly the k17 proving
key), pulls the rc.8 image and fetches its parameters, so it takes several minutes. The node
is ready when <http://localhost:9999/transfers> answers.

**Bridge by hand.** The dev user holds 1,000 test tokens on Solana (from
`packages/contracts-solana/scripts/init-local.ts`) and the public dev seed `0x…02` on Midnight.
In a second terminal:

```sh
# The dev user's Midnight shielded address (derived offline from the public dev seed)
bun -e 'import { localDevSeed, shieldedAddressFromSeed } from "@solana-midnight-bridge/contracts-midnight/wallets"; console.log(shieldedAddressFromSeed(localDevSeed("user"), "undeployed"))'

# Solana → Midnight: lock 10 test tokens to the address printed above, and wait until the
# mint is seen on Midnight
bun run bridge:to-midnight --amount 10 --recipient mn_shield-addr_undeployed1…

# The dev user's Midnight balance of the bridge colour, in base units (6 decimals: 10 tokens =
# 10000000). It syncs the wallet first, which takes a minute or two.
bun -e 'import * as Rx from "rxjs"; import { buildBridgeWallet, localDevSeed } from "@solana-midnight-bridge/contracts-midnight/wallets"; import { midnightUrls } from "@solana-midnight-bridge/contracts-midnight/network"; const color = require("./deployments/local.json").midnight.tokenColor; const w = await buildBridgeWallet(midnightUrls("local"), localDevSeed("user")); const s = await Rx.firstValueFrom(w.wallet.state()); console.log("bridge colour balance:", String(s.shielded.balances[color] ?? 0n)); await w.wallet.stop(); process.exit(0)'

# Midnight → Solana: burn 4, released to the dev user's Solana address
bun run bridge:to-solana --amount 4 --recipient "$(bun -e 'console.log(require("./deployments/local.json").solana.user)')"

bun run bridge:status
```

Each `bridge:to-*` command prints the transaction on the source chain, then polls the API until
the transfer is `completed` and prints the counterpart transaction. The balance line prints
`10000000` after the first transfer, and `6000000` after the burn.

Measured round trip on the local stack (the end-to-end suite in Docker, linux/amd64 emulated on
an arm64 Mac, so slower than a native run): `bridge:to-midnight --amount 10` reached `completed`
117 s after the lock landed (124 s for the whole command, the relayer's first
mint proof included); `bridge:to-solana --amount 4` reached `completed` 31 s after the
burn (119 s for the whole command, most of it the CLI syncing its Midnight wallet first).

| Service | URL |
| --- | --- |
| Bridge node API | http://localhost:9999/transfers |
| Solana validator RPC | http://127.0.0.1:8899 (faucet 9900) |
| Midnight node RPC | http://127.0.0.1:9944 |
| Midnight indexer (GraphQL) | http://127.0.0.1:8088/api/v4/graphql |
| DUST proof server (9.0.0-rc.5) | http://127.0.0.1:6300 |
| Contract proof server (9.0.0-rc.8) | http://127.0.0.1:6301 |
| PGlite (Postgres) | `localhost:5432` |

### Live mode: Solana devnet + Midnight stagenet

`bun run live` (`start.live.ts`) runs no chain. It starts the two provers, PGLite and the node
with its relayer against contracts you have deployed once, recorded in
`deployments/devnet-stagenet.json` (`BRIDGE_DEPLOYMENT` selects another file).

1. **Keys.** Live keys are read only from `~/.config/solana-midnight-bridge/` (directory mode
   700, files 600; `BRIDGE_SECRETS_DIR` points at another directory outside the repository),
   never from the repository: `solana-operator.json` and `solana-user.json` (Solana CLI keypair
   files), `midnight-operator.seed` and `midnight-user.seed` (and `midnight-delivery.seed` when
   the node delivers into contracts). A Midnight seed file holds a hex seed of 32 to 64 bytes
   (`0x` optional: the dev seeds are 32-byte; Lace and the shared test wallets use 64-byte BIP-39
   seeds, which derive the same addresses here as in those wallets), a BIP-39 mnemonic of 12 to 24
   words (its seed with an empty passphrase), or either of them on a `WALLET=`, `SEED=` or
   `MNEMONIC=` line.
   Every script refuses the committed local program key and the public dev keys on a real
   network.
2. **Funds.** The Solana operator pays the program deploy (about 1.6 SOL on devnet) and the
   releases; the Midnight operator needs stagenet NIGHT registered for DUST to deploy and to pay
   for mints; the Midnight user needs DUST to burn.
3. **Deploy**, then run:

```sh
bun run compile:midnight
export SOLANA_DEVNET_RPC_URL=https://api.devnet.solana.com   # or a keyed RPC; it is never printed
bun run packages/contracts-solana/scripts/deploy-devnet.ts --check --out devnet-stagenet
bun run packages/contracts-solana/scripts/deploy-devnet.ts --out devnet-stagenet --user-tokens 10
MIDNIGHT_STORAGE_PASSWORD=… bun run deploy:stagenet
bun run live

bun run bridge:to-midnight --mode live --amount 1 --recipient mn_shield-addr_stagenet1…
bun run bridge:to-solana   --mode live --amount 0.5 --recipient <your Solana address>
bun run bridge:status --mode live
```

`deploy-devnet.ts --check` runs every key, cluster and balance check and sends nothing. The
deploy initializes the program right after deploying it, because `Initialize` is
first-caller-wins, and checks the stored operator.

Live mode reaches both chains only through endpoints, so it can target other networks:
`SOLANA_DEVNET_RPC_URL` with `SOLANA_EXPECTED_GENESIS_HASH` for the Solana deploy, and
`MIDNIGHT_NETWORK_ID` with `MIDNIGHT_INDEXER_HTTP`, `MIDNIGHT_INDEXER_WS` and `MIDNIGHT_NODE_HTTP`
for Midnight (see Configuration).

#### Trying live mode on chains you run yourself

To try the live path without public funds, start the chains yourself, separately from the
template: a Midnight 2.x devnet (`midnight-node` 2.0.0-rc.4 with `CFG_PRESET=dev` and
`indexer-standalone` 4.4.0-rc.1, network id `undeployed`) and a `solana-test-validator` with no
program preloaded (pass `--limit-ledger-size 5000000`, as `chain:start` does). Fund fresh live
keys from the devnet's genesis wallet (send NIGHT, then register it for DUST) and from the
validator's faucet, and point live mode at the chains:

```sh
export BRIDGE_DEPLOYMENT=standin
export SOLANA_DEVNET_RPC_URL=http://<validator-host>:8899
export SOLANA_EXPECTED_GENESIS_HASH=$(solana genesis-hash --url "$SOLANA_DEVNET_RPC_URL")
export MIDNIGHT_NETWORK_ID=undeployed
export MIDNIGHT_NODE_HTTP=http://<node-host>:9944
export MIDNIGHT_INDEXER_HTTP=http://<indexer-host>:8088/api/v4/graphql
export MIDNIGHT_INDEXER_WS=ws://<indexer-host>:8088/api/v4/graphql/ws
bun run packages/contracts-solana/scripts/deploy-devnet.ts --out standin --user-tokens 10
MIDNIGHT_STORAGE_PASSWORD=… bun run packages/contracts-midnight/deploy.ts --mode stagenet --out standin
bun run live
```

Off loopback, the public dev seeds and the local Solana keys are refused there as on a public
network, so the keys must be fresh ones.

> [!NOTE]
> Last live run (2026-10-03): against chains started this way, in Docker, with fresh keys, a real
> `solana program deploy` and the live Midnight deploy. Bridging 1 token to Midnight completed
> 125 s after the lock and 0.5 back completed 35 s after the burn, each with one relayer
> attempt, and every balance reconciled. The Midnight fees were 1.81 DUST for the deploy, 0.29
> DUST for the mint and 0.41 DUST for the burn.
>
> The run on the public Solana devnet + Midnight stagenet has not been done yet:
>
> | Item | Value |
> | --- | --- |
> | Solana program id (devnet) | PLACEHOLDER(devnet/stagenet run pending (follow-up)) |
> | SPL mint (devnet) | PLACEHOLDER(devnet/stagenet run pending (follow-up)) |
> | Bridge contract (stagenet) | PLACEHOLDER(devnet/stagenet run pending (follow-up)) |
> | Token colour (stagenet) | PLACEHOLDER(devnet/stagenet run pending (follow-up)) |
> | Solana lock tx | PLACEHOLDER(devnet/stagenet run pending (follow-up)) |
> | Midnight mint tx | PLACEHOLDER(devnet/stagenet run pending (follow-up)) |
> | Midnight burn tx | PLACEHOLDER(devnet/stagenet run pending (follow-up)) |
> | Solana release tx | PLACEHOLDER(devnet/stagenet run pending (follow-up)) |

### Upgrading from the first version of this template (breaking)

Delivery into contracts changed two things that an existing deployment must act on:

- **The Solana program gained instruction tag 3 (`LockToContract`).** A program deployed from an
  older `build/bridge.so` refuses it (`InvalidInstruction`; it fails closed, nothing is locked).
  Deploy the current `build/bridge.so` to accept contract recipients. `Lock` (tag 1, 73 bytes) and
  its `LOCK` log line are unchanged, so wallet transfers keep working on an old program.
- **The node's database gained columns** (`001-contract-delivery.sql`). A database synced by an
  older node must be wiped and re-synced from the deployment's start heights: the node refuses to
  start against the old schema and says so.

The CLI also no longer refuses amounts above 18.44 tokens (its early check used 18 decimals); the
range is now checked with the mint's own decimals.

**The program-scoped Solana sync (AA 00064) is breaking too:**

- **A live node reads only the bridge program now** (`BRIDGE_SOLANA_SYNC_MODE=program`, the live
  default; see How the node reads Solana). Local mode keeps block mode.
- **Each mode refuses the other mode's database.** A node synced in block mode does not start in
  program mode (and the reverse): its saved resume point has no cursor. There is no migration.
  Stop the node once every transfer has completed, move the deployment's start slot to just after
  the last completed transfer, and start on a new database.
- **The Effectstream block hashes differ** between the modes (program mode records the first
  signature of each slot it reads instead of the block hash). Both are deterministic; the bridge
  uses no randomness.

## Project structure

```
packages/
  contracts-solana/      Bridge program (programs/bridge, committed build/bridge.so), instruction
                         builders + log parser, local validator, init-local and deploy-devnet scripts
  contracts-midnight/    bridge.compact, pinned compactc 0.35.0 toolchain, runtime-0.20 pin,
                         deploy (local + stagenet), mint signing, wallets, the 7 launchMidnight scripts
  database/              000-init.sql (bridge_transfers, relayer_jobs) and pgtyped queries
  node/                  Sync config, grammar, state machine, API, deployment record, entry point
    relayer/             In-process relayer: job selection and backoff, embedded batcher, operator keys,
                         delivery into contracts
  delivery/              Delivery adapters: the interface, the router (the only signer for a contract
                         recipient), the undeliverable codes
  delivery-passport/     The Passport adapter: pin, bundle import and check, recognition, inbox sealing,
                         the one-transaction composition
  cli/                   bridge:to-midnight (--recipient or --account), bridge:to-solana, bridge:status,
                         bridge:record
deploy/standin/          compose.bridge.yml: a bridge node in live mode as a container
  tests/                 Unit, program, contract and end-to-end suites (start.test.ts = the dev stack)
```

`deployments/<mode>.json` (written by the deploy scripts) holds every address and start height
the node, relayer, CLI and tests need. It never holds a secret.

## How it works

```
 Solana (local validator / devnet)                 Midnight (local devnet / stagenet)
 ┌──────────────────────────────────┐              ┌─────────────────────────────────────────┐
 │ bridge program                   │              │ bridge.compact (compactc 0.35.0)        │
 │  Lock(amount, recipient[64]) ────┼─ LOCK log ─┐ │  mintFromSolana(…, sig)  ◄── relayer    │
 │  Release(id, amount)  ◄── relayer│            │ │  lockForSolana(coin, solanaRecipient) ──┼─┐
 └────────────────┬─────────────────┘            │ └─────────────────────────────────────────┘ │
                  └─ RELEASE log ─┐              │          mintedLocks / withdrawals ─────────┘
                                  ▼              ▼                    ▼
                    Effectstream node: SOLANA:ProgramLog + Midnight:Generic → bridge_transfers
                    relayer (same process): observed transfers → counterpart transaction
```

**Solana → Midnight.**

1. `bridge:to-midnight` sends `Lock`: the program moves the SPL tokens into a vault owned by a
   PDA and logs `EFFECTSTREAM_BRIDGE|LOCK|<nonce>|<depositor>|<mint>|<amount>|<recipientHex128>`.
   The recipient is the whole shielded address, coin public key plus encryption public key,
   because a shielded mint to someone else needs both.
2. The node sees the log (live: at the first poll after its slot is finalized, at most 6 s later;
   local: after 32 confirmations) and upserts `s2m:<nonce>` as `observed`.
3. The relayer signs `"SMBRDG1:" ‖ mintDigest(contract, networkTag, nonce, recipient, amount)`
   with the operator's Solana key and queues `mintFromSolana` on its embedded batcher, with the
   recipient's key pair in `coinEncPublicKeyMappings`. The digest comes from the contract's own
   pure circuit (`packages/contracts-midnight/signing.ts`), so TypeScript and the circuit cannot
   disagree about the bytes.
4. The circuit checks the signature, records the nonce in `mintedLocks` and mints the shielded
   coin to the recipient.
5. The next `Midnight:Generic` snapshot contains the nonce, and the state machine marks the
   transfer `completed`.

**Midnight → Solana.**

1. `bridge:to-solana` calls `lockForSolana(coin, solanaRecipient)` from the user's wallet. The
   contract checks the colour and receives the coin. It keeps no spend key and has no witness, so
   the coin can never be spent again: this is the burn. It records
   `withdrawals[id] = {solanaRecipient, amount}`.
2. The snapshot's new `withdrawals` entry becomes `m2s:<id>`, `observed`.
3. The relayer checks whether the release receipt PDA for `id` already exists. If not, it sends
   `[create the recipient's token account (idempotent), Release(id, amount)]`, signed by the
   operator through `SolanaSignerAdapter`.
4. The program creates the receipt PDA (a second release of the same id fails), pays out of the
   vault and logs `EFFECTSTREAM_BRIDGE|RELEASE|<id>|<recipient>|<amount>`, which completes the
   transfer.

Supply is conserved: once every transfer has completed, the vault holds exactly what has been
minted on Midnight minus what has been burned there.

### How the node reads Solana

The node's Solana sync has two modes (`BRIDGE_SOLANA_SYNC_MODE`, the engine's
`SOLANA_RPC_PARALLEL` `mode`):

- **`program`, the live default: only the bridge program's own transactions.** Every
  `BRIDGE_SOLANA_POLL_MS` (6 s) one poll asks:
  1. `getSlot` at `finalized` for the tip (a root: it never rolls back);
  2. `getBlockTime` of that slot, for the chain's time (stepping back over a skipped slot);
  3. `getSignaturesForAddress` of the program at `finalized`, 10 entries first, then pages of
     1,000 back to the last transaction it already has (never `until`: an RPC answers an unknown
     `until` with an empty list and no error);
  4. `getTransaction` for each new transaction, oldest first. Failed transactions are skipped.

  An idle node therefore makes 3 calls per poll, about **43,200 a day** (Helius bills 1 credit
  per call), plus 1 per lock or release. The parser sees the same transactions block mode would,
  with the same records, in the same order (slot, then position in the block).
- **`block`, the local default: every slot.** `getSlot` at `confirmed` minus
  `BRIDGE_SOLANA_CONFIRMATION_DEPTH` (32), then `getBlock` for every slot, 8 at a time. Devnet
  makes about 4.19 slots a second, so a node at the tip makes about **450,000 calls a day**.

What program mode guarantees:

- **Only finalized data**, and nothing past the tip it read: signatures the RPC already indexed
  above that tip wait for the next poll.
- **Exactly once across restarts.** The resume point is a cursor (the newest slot read and its
  signatures). It is saved with each Effectstream block, in the same database transaction, so a
  restart continues after the last committed transaction. The relayer's guards (`mintedLocks`,
  the release receipts) remain a backstop.
- **All or nothing per poll.** A call that still fails after its retries (HTTP 429 waits
  `Retry-After` or a doubling backoff, up to `BRIDGE_SOLANA_RATE_LIMIT_RETRIES`; other errors 3
  attempts) fails the whole poll: nothing changes, and the next poll starts again from the cursor.
- **Deterministic.** Every time it reports is a chain `blockTime` (each transaction's own, and the
  tip's for progress); it never reads the wall clock. A lock lands in the same Effectstream block
  as in block mode.
- **One poll per interval, always,** with or without new transactions. Block mode, by contrast,
  never rests at the tip.

What it costs in time (measured in AA 00064 on the local stack, a program-mode node next to a
block-mode one over the same validator and deployment):

- **A lock is seen at the first poll after its slot is finalized:** +2.7 s and +4.5 s after the
  block-mode node, at most about one poll (6 s). A bridge-out's release completed +0.1 s and
  +0.4 s after it. On devnet, `finalized` runs within a few slots of the newest slot, about 32 slots
  (~8 s) ahead of block mode's `confirmed` minus 32, which offsets most of the poll.
- **Midnight-side observations can wait up to one poll longer.** The node merges both chains on
  one timeline, and in program mode the Solana side's progress moves once per poll, so the
  Effectstream blocks waiting on it are finalized in one burst per poll instead of one by one. On
  the emulated test stack a burn reached `completed` in 34.8 s (block mode on that harness:
  25.3 s).
- **A slow first mint can outlast the relayer's first retry** (120 s after the submission, the
  `s2m` backoff in `packages/node/relayer/policy.ts`). On the emulated test stack the first mint
  of a fresh stack took about 130 s to be seen on Midnight. The retry's pre-check found the lock
  already in `mintedLocks` and sent nothing (`attempts` 2, `already settled on chain`), so the
  transfer still completed exactly once.

**An RPC without `transactionIndex`.** Program mode orders the transactions of one slot by
`transactionIndex`. The devnet RPC and Helius (solana-core 4.4) return it; Agave's
`solana-test-validator` (3.0.14, the local stack) does not. Without it the node orders them by the
RPC's list order (Agave lists them by index), warns once per start, and counts `indexFallbacks` on
`/health`. The primitives' `logIndex` may then differ from block mode's; the bridge never reads it.

`GET /health` shows, under `protocols[]` for `parallelSolana`, `details`: the mode, the RPC calls
per method since start (`rpcCalls`), and in program mode the interval, polls (`polls`,
`idlePolls`, `failedPolls`), the transactions emitted, `lateSignatures` (entries that turned up at
or below a tip an earlier poll had already read; expected 0), `indexFallbacks`, the progress (tip
slot and its `blockTime`) and the cursor. The node's start-up line shows the mode and the interval
(`solanaSync=program poll=6000ms`), and program mode logs one line per poll that found
transactions plus a summary every 100 polls.

### Contracts

**Solana program** (`packages/contracts-solana/programs/bridge/src/lib.rs`, native
`solana-program` 1.18 with `spl-token` 4.0). Accounts: a config PDA (`operator`, `mint`, lock
nonce), a vault token account owned by an authority PDA, and one release-receipt PDA per
withdrawal id. Instructions: `Initialize` (first caller wins), `Lock` (73 bytes: tag,
`amount u64`, 64-byte recipient) and `Release` (17 bytes: tag, `withdrawal_id u64`,
`amount u64`, operator only). Builders, PDA derivations and the log parser shared with the
state machine are in `packages/contracts-solana/instructions.ts`.

**Midnight contract** (`packages/contracts-midnight/contract-bridge/src/bridge.compact`,
witness-free). The sealed ledger holds the operator's key as a `Curve25519Point`, the SPL mint
(the colour domain) and the network tag. `mintedLocks` maps a lock nonce to the minted amount;
`withdrawals` maps a withdrawal id to the Solana recipient and amount. `tokenColor(mint, bridge)`
is an exported pure circuit, so the colour can be computed off chain.

`mintFromSolana` is a k17 circuit with only about 1.8k table rows of headroom. Lengthening the
signed message or adding logic moves it to k18, which roughly doubles proving time and memory.
It proves only on proof server 9.0.0-rc.8, while wallet fees on stagenet need a `dust/9`
prover, so the template always runs two provers (`packages/contracts-midnight/network.ts`).

### Grammar and state machine

```ts
// packages/node/grammar.ts
export const grammar = {
  "bridge-solana-log": builtinGrammars.solanaProgramLog,
  "bridge-midnight-state": builtinGrammars.midnightGeneric,
} as const satisfies GrammarDefinition;
```

`packages/node/stf-logic.ts` turns each input into row operations with no I/O, and
`packages/node/state-machine.ts` applies them. A Midnight snapshot carries the whole ledger, so
every `mintedLocks` key and every `withdrawals` entry is reconciled each time. Several transfers
between two snapshots are all picked up, and replaying a snapshot changes nothing. Inputs from
another program, `LOCK`s of another mint and a snapshot that seals another mint are ignored.

### Relayer

`packages/node/relayer/` runs inside the node process (`BRIDGE_RELAYER=0` turns it off). Every
5 s it selects `observed` transfers with no attempt in flight, at most one per direction, and
backs off between attempts: 2 to 15 minutes for mints, 1 to 10 minutes for releases. That gives
sync time to see a counterpart that landed before the relayer tries again. On-chain replay
refusals (`lock already minted`, an existing release receipt) are recorded as "already settled"
and left for sync to complete. The embedded batcher keeps its queue in a fresh temporary
directory per process, so a restart never replays a stale queue on top of the relayer's own
retries.

```ts
// packages/node/relayer/jobs.ts
const body = {
  circuit: "mintFromSolana",
  args: mintArgsJson({ lockNonce: job.sourceId, recipient, amount: job.amount, mintNonce, sig }),
  coinEncPublicKeyMappings: [mapping],
};
```

### API

`packages/node/api.ts` is read-only. `GET /health` is the runtime's own.

| Route | Purpose |
| --- | --- |
| `GET /transfers?direction=s2m\|m2s&status=observed\|submitted\|completed\|undeliverable&recipientKind=wallet\|contract\|solana&limit=1..500` | Transfers with their relayer attempts |
| `GET /transfers/:id` | One transfer, `id` = `s2m:<lock nonce>` or `m2s:<withdrawal id>` |
| `GET /recipients/contract/:address` | Whether this node can deliver into a Midnight contract (read-only; 503 when the relayer is off) |
| `GET /deployment` | This deployment's public record, once the node has checked it against both chains (503 before) |

`status` is derived, in this order: `completed` once sync has seen the counterpart,
`undeliverable` when a lock to a contract was refused before any signature (with `reason.code`),
`submitted` once the relayer has made an attempt, `observed` otherwise. Each transfer also carries
`recipientKind` (`wallet`, `contract` or `solana`) and, for a contract delivery, `delivery`
(`adapter`, `account`, the minted `coin` and the Midnight `tx`).

### Database

`packages/database/migrations/000-init.sql` creates `bridge_transfers` (owned by the state
machine; primary key `(direction, source_id)`; status only ever moves `observed` → `completed`)
and `relayer_jobs` (owned by the relayer; attempts, last attempt, last transaction, last error).
The queries are in `packages/database/sql/queries.sql`.
`001-contract-delivery.sql` adds `bridge_transfers.recipient_kind` and, on `relayer_jobs`, the
`undeliverable_*` columns and `delivery`.

The runtime applies a migration only while it processes block 1, so `001` reaches a fresh database
only. A node started on a database synced by an older node refuses to start with "wipe the database
and re-sync": the node re-syncs every transfer from the deployment's start heights.

**Re-evaluating an undeliverable transfer** (for example after the delivery pin changed): delete its
relayer row, and the relayer classifies it again on its next poll. Nothing was signed for it, so
nothing can be replayed:

```sql
DELETE FROM relayer_jobs WHERE direction = 's2m' AND source_id = <lock nonce>;
```

### Delivery into contracts (Passport accounts)

A lock can name a Midnight **contract** instead of a wallet. The Solana program has a second lock
instruction, `LockToContract` (tag 3, 41 bytes: `amount u64` and the contract's 32-byte address),
which logs `EFFECTSTREAM_BRIDGE|LOCKC|<nonce>|<depositor>|<mint>|<amount>|<contractHex64>` and
shares the lock-nonce counter with `Lock`. The node then delivers the mint **into** that contract,
in one Midnight transaction with two calls:

1. `bridge.mintFromSolana(lockNonce, right(contract), amount, mintNonce, sig)`, which mints the coin
   to the contract;
2. the contract's own receiving call, which claims the coin in the same transaction. For a
   [Passport](https://github.com/midnightntwrk/passport) account that is
   `account.deposit_shielded(coin, entry)`, with the 192-byte inbox entry sealed to the account's
   on-chain `enc_key`, so only the account owner can read which coin arrived.

```sh
# Ask the node first, then lock 500 tokens for a Passport account (refused unless deliverable)
bun run bridge:to-midnight --amount 500 --account <64-hex Passport account address>
```

**Who decides what is deliverable.** Delivery goes through adapters (`packages/delivery`:
`recognise(address)` and `deliver(...)`). The node's delivery router asks every configured
adapter, and only the router signs a mint for a contract recipient: after an adapter has said
`deliverable`, and the adapter receives the signed arguments, never the operator key. The one
adapter today is Passport's (`packages/delivery-passport`). It accepts an account only if:

- its circuits and their verifier keys are exactly the pinned key set
  (`pin/passport-account.pin.json`: 9 circuits, key set `21493588…`, Passport `599327b`);
- its maintenance authority is retired;
- its `enc_key` is a usable X25519 public key;
- its network salt is this network's, and its round and inbox counters are below 2^48.

Anything else is `undeliverable`, with a code, and **nothing is signed for it**:

| Code | Meaning |
| --- | --- |
| `no-adapter` | the node has no delivery adapter configured (`BRIDGE_DELIVERY_ADAPTERS` empty) |
| `not-a-contract` | no contract state at the address on this network, after the grace window (`BRIDGE_DELIVERY_NOT_FOUND_GRACE_MS`) |
| `not-a-passport-account` | a contract, but not an account of the pinned key set (another bridge, another key set) |
| `authority-live` | the account's maintenance authority is not retired |
| `bad-enc-key` | `enc_key` is not a usable X25519 key |
| `wrong-network` | the account was made for another network |
| `counters` | a counter is at or above 2^48 |

`undeliverable` is final for the relayer. The SPL tokens stay in the vault: there is no refund
path. That is why `bridge:to-midnight --account` asks the node
(`GET /recipients/contract/:address`) and sends nothing unless the answer is `deliverable`. To
classify a transfer again (for example after a re-pin), delete its `relayer_jobs` row (see
Database).

**The bundle.** Proving `deposit_shielded` needs the account's compiled module, its ZKIR and its
proving keys. The node does not build them: import them once from a VERIFIED Night Market key
volume of the pinned key set:

```sh
bun run delivery:import-bundle <key volume>/account   # → packages/delivery-passport/bundle/account (gitignored)
```

The node checks the bundle against the pin at every start and refuses to start on a mismatch.

**Configuration.** `BRIDGE_DELIVERY_ADAPTERS=passport` turns delivery on. The delivery wallet pays
for the composed transactions: `<secrets>/midnight-delivery.seed` in live mode (fund it with NIGHT
and register it for DUST, like the operator's), the dev seed `0x…03` locally. With no adapter
configured, every contract lock is `undeliverable(no-adapter)` and wallet locks are unchanged.

**A deployment's public record.** `bun run bridge:record --api <public origin> --name X --symbol X`
writes `deployments/<deployment>.record.json` (schema
`effectstream.solana-midnight-bridge.deployment/1`: SPL mint and decimals, program, contract,
colour, operator key, Midnight network, Solana genesis hash, API, start heights, delivery adapters)
after checking every field against both chains; the node serves the same object at
`GET /deployment`. A token registry is generated from it.

**Two tokens, two deployments.** One deployment bridges one SPL mint (the contract seals it, and
the colour is `tokenType(domainSep(mint), contract)`). To bridge two tokens, deploy twice and run
two nodes; `deploy/standin/compose.bridge.yml` runs a node as a container, once per deployment
(see `deploy/standin/README.md`; a container restart re-syncs, see Known limits).

### Known limits

- **Trust model.** One operator key controls both sides: it can release the vault and authorize
  any mint. This is a proof of concept, not a trust-minimized bridge.
- **One operator, no rotation.** The key is sealed in the Midnight contract and stored in the
  Solana program's config.
- **`withdrawals` only grows.** Every burn adds an entry to the contract's map forever.
- **Burned coins are gone by construction.** The contract receives them with no witness and
  keeps no spend key.
- **Delivery into contracts is one transaction with two root calls,** not a cross-contract call:
  `mintFromSolana` returns the coin, and the receiving contract's own call claims it in the same
  transaction (see Delivery into contracts).
- **A lock to a contract the node cannot deliver to has no refund.** The tokens stay in the vault.
  `bridge:to-midnight --account` asks the node first, but a raw `LockToContract` cannot be
  checked by the program.
- **The Passport bundle comes from a key job.** The node proves `deposit_shielded` with keys a
  Night Market or Passport key job produced and verified; it never builds them. One key set at a
  time: an account of another key set is `not-a-passport-account` until the pin and the bundle
  are updated.
- **One deployment per SPL mint.** Two tokens need two deployments and two nodes.
- **A node restart re-syncs from the start heights.** The node's PGlite database does not survive a
  restart of the node's orchestrator, even with `PGLITE_DATA_DIR` set (Effectstream engine issue
  00063: the PGlite gateway loses its data when it is stopped). Every transfer is rebuilt from the
  chains. That is safe: the contract's `mintedLocks` and the release receipts refuse duplicates, so
  nothing is minted, delivered or released twice. But it takes longer as the chains grow, and the
  Solana validator must still hold the deployment's start slot (see below). Only a restart of the
  node process inside a running orchestrator keeps the database.
- **Devnet RPC rate limits (block mode).** In block mode the node reads one `getBlock` per slot.
  The public devnet RPC allows about 6 per 10 s, far below devnet's ~4.19 slots/s, so a node on it
  falls behind: use a private RPC (put its URL in `SOLANA_DEVNET_RPC_URL_FILE`). The reader backs
  off on HTTP 429 and can be paced (`BRIDGE_SOLANA_GETBLOCK_MIN_INTERVAL_MS`). Program mode, the
  live default, needs only about 3 calls per 6 s (see How the node reads Solana).
- **Program mode reads only `SOLANA:ProgramLog` primitives.** The engine refuses to start it with
  any other Solana primitive: `getSignaturesForAddress` cannot find every balance change.
- **A node exits at its 65,536th Effectstream block since start, in either mode** (about 18 h at
  the tip; AA issue 00066 in the maintainers' workspace; not caused by program mode). The engine's
  embedded MQTT broker forwards one QoS 2 message per block to an in-process client, its packet id
  wraps to 0, the broker drops that client, and the client's `close()` throws an unhandled
  rejection that ends the process; any broker-side close of that client does the same. Program
  mode only reaches it sooner when it catches up a long backlog (days of history in minutes). Run
  the node under a supervisor that restarts it (systemd `Restart=on-failure` does), on Postgres:
  it resumes from its cursor. Under the dev orchestrator with PGlite the restart also loses the
  database (above).
- **Proof server 9.0.0-rc.8 runs from Docker** until a binary is published, and it needs about
  4 GiB of memory for a mint proof.
- **The local validator's RPC is reachable from your network.** `solana-test-validator` (Agave
  3.0.14) listens for JSON-RPC and faucet requests on every interface; `--bind-address` only
  covers gossip. Its coins are worthless, but do not run `bun run dev` on an untrusted network.
- **The local validator keeps about the last 5-6 hours of slots, and up to ~12 GB of disk.**
  `chain:start` passes `--limit-ledger-size 5000000` (data shreds). An idle validator writes about
  100 shreds (~0.25 MB of ledger) per slot, so its ledger grows by ~2 GB an hour until the limit,
  then older blocks are purged. A wiped database can re-sync only while the deployment's start
  slot is still kept; restart the stack (the ledger is reset by default) after that. Set
  `SOLANA_LIMIT_LEDGER_SIZE` for more history (more disk) or less disk. Agave's own default,
  10,000 shreds, keeps only a few dozen slots and stalls the node's Solana sync.

## Configuration

Local mode needs no configuration. These variables exist:

| Variable | Default | Read by |
| --- | --- | --- |
| `BRIDGE_MODE` | `local` | Node and CLI (`local` / `live`) |
| `BRIDGE_DEPLOYMENT` | `devnet-stagenet` | Live deployment file name or path |
| `BRIDGE_SECRETS_DIR` | `~/.config/solana-midnight-bridge` | Live keys and seeds (dir 700, files 600; never inside the template) |
| `SOLANA_DEVNET_RPC_URL` | `https://api.devnet.solana.com` | Live node, CLI and `deploy-devnet.ts` |
| `SOLANA_DEVNET_RPC_URL_FILE` | unset | A file (mode 600) holding the live Solana RPC URL; wins over `SOLANA_DEVNET_RPC_URL`. For a provider URL with an API key: it never sits in an env var or a log (logs show the origin only) |
| `SOLANA_EXPECTED_GENESIS_HASH` | unset (devnet required) | `deploy-devnet.ts` deploys to the cluster with this genesis instead of devnet (mainnet-beta is always refused) |
| `MIDNIGHT_NETWORK_ID` | `stagenet` | Live Midnight network; another id needs the three Midnight endpoint variables below (mainnet is refused) |
| `SOLANA_RPC_URL` | `http://127.0.0.1:8899` | Local Solana RPC override |
| `SOLANA_RPC_PORT`, `SOLANA_FAUCET_PORT` | `8899`, `9900` | Local validator |
| `SOLANA_RESET` | `true` | `false` keeps the local ledger across restarts |
| `SOLANA_LIMIT_LEDGER_SIZE` | `5000000` | Local validator `--limit-ledger-size` (data shreds kept, about 100 per slot) |
| `BRIDGE_LOCAL_RPC_HOSTS` | empty | Extra hosts treated as local (e.g. a Docker sibling validator) |
| `SKIP_SOLANA_BUILD` | `1` | `0` forces a native rebuild of the program |
| `MIDNIGHT_INDEXER_HTTP`, `MIDNIGHT_INDEXER_WS`, `MIDNIGHT_NODE_HTTP` | per mode | Midnight endpoints |
| `MIDNIGHT_PROOF_SERVER_URL` | `http://127.0.0.1:6300` | DUST prover; when set, live mode starts none |
| `MIDNIGHT_CONTRACT_PROOF_SERVER_URL` | `http://127.0.0.1:6301` | Contract prover; when set, no prover is started |
| `BRIDGE_CONTRACT_PROOF_SERVER_PORT` | `6301` | Port of the contract prover the orchestrator starts |
| `BRIDGE_CONTRACT_PROVER_WAIT_MS` | `900000` | How long to wait for the contract prover |
| `MIDNIGHT_STORAGE_PASSWORD` | set by `start.dev.ts` locally | Midnight wallet storage; required for the stagenet deploy |
| `BRIDGE_RELAYER` | on | `0` disables the relayer |
| `BRIDGE_RELAYER_POLL_MS` | `5000` | Relayer polling interval |
| `BRIDGE_DELIVERY_ADAPTERS` | empty | Delivery into contracts: `passport`; empty makes every contract lock `undeliverable(no-adapter)` |
| `PASSPORT_BUNDLE_DIR` | `packages/delivery-passport/bundle/account` | The imported Passport bundle (`bun run delivery:import-bundle`) |
| `BRIDGE_DELIVERY_NOT_FOUND_GRACE_MS` | `600000` | How long a contract that does not exist yet is retried before it is `undeliverable(not-a-contract)` |
| `BRIDGE_PUBLIC_API` | `http://127.0.0.1:$EFFECTSTREAM_API_PORT` | The `api` field of `GET /deployment` |
| `BRIDGE_RECORD_NAME`, `BRIDGE_RECORD_SYMBOL` | unset | `name` and `symbol` in `GET /deployment` |
| `BRIDGE_RELAYER_MINT_TIMEOUT_MS`, `BRIDGE_RELAYER_RELEASE_TIMEOUT_MS` | `900000`, `240000` | Per-submission wait |
| `BRIDGE_SOLANA_SYNC_MODE` | `block`/`program` (local/live) | How the node reads Solana: `program` (only the bridge program's transactions) or `block` (every slot); see How the node reads Solana. Anything else refuses to start |
| `BRIDGE_SOLANA_POLL_MS` | `6000` | Program mode: one poll per this many ms, always. An integer of at least `1000`, or the node refuses to start |
| `BRIDGE_SOLANA_DELAY_MS` | `2400`/`6000` (local/live) | Both modes: added to every Solana time in the merge with Midnight (keep it the same when switching modes) |
| `BRIDGE_SOLANA_CONFIRMATION_DEPTH`, `BRIDGE_SOLANA_STEP_SIZE`, `BRIDGE_SOLANA_POLLING_MS` | `32`, `10`/`24`, `2000`/`4000` (local/live) | Block mode only (program mode warns once and ignores them) |
| `BRIDGE_SOLANA_GETBLOCK_CONCURRENCY` | `8` | Block mode only. Most `getBlock` calls in flight (one call takes ~0.5 s even on a private RPC, devnet makes ~4.19 slots/s); halved after a rate-limited batch, grown back after clean ones. Blocks are still applied strictly in slot order |
| `BRIDGE_SOLANA_GETBLOCK_MIN_INTERVAL_MS` | `0` | Block mode only. Minimum spacing between `getBlock` calls, e.g. `1700` for the public devnet RPC (6 calls / 10 s) |
| `BRIDGE_SOLANA_RATE_LIMIT_RETRIES`, `BRIDGE_SOLANA_RATE_LIMIT_BACKOFF_MS`, `BRIDGE_SOLANA_RATE_LIMIT_MAX_BACKOFF_MS` | `10`, `500`, `15000` | Both modes. On HTTP 429: wait (`Retry-After`, else a doubling backoff) and ask again, so a rate limit slows the node instead of stopping it (program mode honours only a `Retry-After` in seconds, never a date: it reads no clock) |
| `BRIDGE_SOLANA_MAX_TX_VERSION` | `1` | Both modes. `maxSupportedTransactionVersion` of `getBlock` and `getTransaction` (devnet holds version-1 transactions; a -32015 hint raises it, an RPC that rejects it falls back to 0) |
| `BRIDGE_MIDNIGHT_POLLING_MS`, `BRIDGE_MIDNIGHT_DELAY_MS` | `1000`, `6000`/`18000` | Midnight sync |
| `BRIDGE_API_URL` | `http://localhost:9999` | CLI |
| `EFFECTSTREAM_API_PORT` | `9999` | Node API port (and the CLI's default URL) |
| `BRIDGE_E2E` | auto | `0` skips the end-to-end phase of `bun run test`, `1` requires it; by default it runs when a contract prover is reachable or Docker is available |
| `BRIDGE_E2E_BOOT_TIMEOUT_MS` | `2700000` | How long `run-tests.ts` waits for the stack to boot |
| `BRIDGE_E2E_LOG_DIR` | `logs/e2e-<timestamp>/` | Where the end-to-end suite writes its logs and `e2e-report.json` |
| `BRIDGE_E2E_ORCHESTRATOR_PORT` | `4747` | Orchestrator API the suite uses to stop, kill and restart processes |

A deployment file has one section per chain. Each deploy script writes only its own section:
`solana` (cluster, program id, mint and decimals, config/authority/vault PDAs, operator, start
slot, signatures) and `midnight` (network id, contract address, token colour, sealed mint,
network tag and operator key, start block height). The node refuses a file whose two sections
do not match: another Midnight network, or a contract that seals another SPL mint.

## Testing

```sh
bun run test
```

`packages/tests/run-tests.ts` compiles the contract if needed, then runs:

- **unit**, no chain and no ports (245 tests): instruction layouts, the log parser, the key
  guards, the live secrets directory, the live deploy's cluster check and its parsing of the
  `solana program deploy` output, the local ledger-size default, and `sendTx`'s handling of
  landed failures (`solana-instructions.test.ts`); the mint
  digest, signature encoding, the batcher's parsing of the raw contract info and the midnight-js
  network id (`midnight-signing.test.ts`); every circuit run locally on runtime 0.20, including bad
  signatures, cross-contract and cross-network replays, a reused nonce and the wrong colour
  (`midnight-contract-logic.test.ts`); the state machine over recorded chain payloads, replayed
  and reordered (`state-machine.test.ts`); the sync configuration and the API, including a request
  that arrives before the node has created its tables (`node-config-api.test.ts`); relayer
  selection, backoff, the on-chain pre-checks and both counterpart inputs (`relayer-jobs.test.ts`);
  and CLI argument validation before any chain call (`cli-args.test.ts`). Delivery into contracts
  adds: the `LockToContract` vectors and the unchanged 00050 `Lock` golden vector
  (`lock-to-contract.test.ts`); the node's contract rows, API v2, `/recipients`, the deployment
  record and the start-up checks (`node-contract-delivery.test.ts`); the router's verdicts and its
  signing boundary, with a second adapter (`delivery-router.test.ts`); the Passport pin, bundle,
  recognition (all seven codes, over recorded account states), sealing and the one-transaction
  composition (`delivery-passport.test.ts`; two of its tests need a verified Night Market key
  volume and skip without one); the relayer's contract branch (`relayer-delivery.test.ts`); and
  `bridge:to-midnight --account` (`cli-account.test.ts`). Seed files in every accepted form, with
  a known-answer address check against Night Market's derivation (`midnight-seeds.test.ts`).
- **program** (17 tests): `solana-program.test.ts` on a throwaway validator on random ports: a lock
  logs and fills the vault; a non-operator release, a second release of the same id and zero
  amounts are refused; `LockToContract` locks and logs `LOCKC`, and its refusals hold.
  `solana-program-00050.test.ts` runs tag 3 against the previous program build: refused, nothing
  locked (it fails closed).
- **e2e**: the whole bridge on the local stack. `run-tests.ts` starts
  `packages/tests/start.test.ts` (the `bun run dev` stack, with the node non-critical so a test
  can kill it), then runs:
  - `e2e.test.ts`, through the CLI as a user would:
    - US1: `bridge:to-midnight --amount 10` reaches `completed` in under 5 minutes; the vault
      gains 10, the user's SPL loses 10, the recipient wallet gains 10 of the bridge colour.
    - US2: `bridge:to-solana --amount 4` reaches `completed` in under 5 minutes; the user's SPL
      gains 4, the vault keeps 6, the wallet keeps 6, and `withdrawals` has one entry.
    - Negatives, each refused where it should be: a mint signed by another key, a mint for an
      already-minted lock, an operator signature replayed against a second bridge instance and a
      burn of another colour (in the circuit); a release by a non-operator and a re-sent release
      (by the program); a zero amount, a malformed key and an address for another network (by the
      CLI, before any chain call).
    - Restarts: the database is wiped and the node re-syncs from the deployment's start heights
      (every transfer comes back `completed`, nothing is sent on either chain); and the node with
      its relayer is killed with SIGKILL between `submitted` and `completed` — while the mint is
      being proved, after the mint landed but before sync saw it, and for a release to a fresh
      address (its token account is created in the release). Each transfer settles exactly once.
    - On-chain totals: `mintedLocks` equals the locks, release receipts equal the withdrawals, the
      vault equals locks minus releases, and the contract's transactions are exactly the deploy,
      one mint per lock and one burn per withdrawal.
  - `contract.test.ts` on the same devnet, after the node is stopped (its payer is the relayer's
    dev wallet): it deploys its own instance, mints to a third wallet, and checks the in-circuit
    refusals and a burn with change.

  The stack is shut down afterwards. Per-process logs and `e2e-report.json` (timings, balances,
  transaction ids) go to `logs/e2e-<timestamp>/`. The local validator keeps 5-6 hours of slots
  (`SOLANA_LIMIT_LEDGER_SIZE`), far more than the suite needs; the re-sync still runs early in
  the suite, so it also holds with a small limit. This phase needs proof server
  9.0.0-rc.8: Docker, or a running one at
  `MIDNIGHT_CONTRACT_PROOF_SERVER_URL`. Without either it is skipped with a message, and
  `contract.test.ts` skips too unless a devnet with both provers is already running.

> [!NOTE]
> Last full run (2026-10-05, `LINK_LOCAL=1` in a linux/amd64 Docker container under emulation, with
> the rc.8 prover as a native sibling container): unit 234 pass + 2 skipped (the two key-volume
> tests), program 17/17, end to end 14/14 (1215 s), contract 6/6 (242 s); the whole run took
> 38 minutes, including a cold contract compile. With no delivery adapter configured, the end-to-end
> suite shows the wallet path unchanged.
>
> Delivery into contracts was run end to end on local stand-ins (Night Market's localnet with its
> relay, a `solana-test-validator`, two deployments from `deploy/standin/compose.bridge.yml`), twice:
> 500 tokens reached a Passport account in one transaction, `completed` 99–104 s after the lock;
> refusals, a wallet lock alongside, restarts (node process killed mid-proof, whole container
> killed, database wiped) and two deployments side by side all held, with exactly one delivery per
> lock. Peak memory of that whole stack: 10.9 GiB.
>
> The end-to-end suite runs in local mode, so in block mode. Run in program mode
> (`BRIDGE_SOLANA_SYNC_MODE=program`, 2026-10-07, AA 00064, the same emulated harness), it passed
> 13 of 14: US2, the seven negatives, the restarts (the database wiped, the relayer killed three
> ways) and the on-chain totals passed. US1's `relayer.attempts == 1` failed: the first mint
> outlasted the relayer's 120 s retry, whose pre-check then found it on chain and sent nothing
> (see How the node reads Solana).
>
> The template is not in the `ENABLED` list of `templates/run-template-tests.ts` yet, because CI
> installs `@effectstream/*` from npm and this template needs the unreleased engine changes in
> [PR #935](https://github.com/effectstream/effectstream/pull/935). Until they are released, run
> `./link.sh && bun run test` here. Once the template is registered,
> `LINK_LOCAL=1 bun run templates/run-template-tests.ts solana-midnight-bridge` from the monorepo
> root runs the same steps.

## Where to go next

- [Batcher overview](https://effectstream.github.io/docs/home/components/batcher/overview) —
  adapters and batching criteria, including the two this template embeds.
- [Primitives](https://effectstream.github.io/docs/home/components/primitives) — how
  `SOLANA:ProgramLog` and `Midnight:Generic` turn chain data into inputs.
- [Midnight](https://effectstream.github.io/docs/home/chains/midnight) — Compact contracts, the
  indexer, and shielded vs unshielded tokens.
- [Solana starter template](https://effectstream.github.io/docs/home/templates/solana-starter) —
  the single-chain Solana template this one builds on.
- [Intent swap template](https://effectstream.github.io/docs/home/templates/intent-swap) — a
  bridge-free alternative for moving value between Bitcoin and Midnight.
