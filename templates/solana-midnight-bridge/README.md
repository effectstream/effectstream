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
| Solana sync via `PrimitiveTypeSolanaProgramLog` (`SOLANA_RPC_PARALLEL`) | `packages/node/config.ts` | The program's `LOCK` and `RELEASE` log lines |
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
> This template needs engine features that are not in a published `@effectstream/*` release
> yet: the split contract prover, third-party shielded mints, `SolanaSignerAdapter` and the
> Curve25519 argument types. Until they are released, run it **inside the Effectstream
> monorepo**, linked to the local engine with `./link.sh`. A plain `bun i` installs the
> published 0.200.6 packages, which lack them.
> <!-- PLACEHOLDER(T8.2): replace this note with the engine release version once PR-1 is published, and pin package.json to it. -->

**Prerequisites**

- [Bun](https://bun.sh).
- **Docker.** Proof server 9.0.0-rc.8, the only one that proves the Ed25519 mint circuit, runs
  from the `midnightntwrk/proof-server:9.0.0-rc.8` image: there is no published binary for it
  yet. It peaks at about 4 GiB of memory while proving a mint.
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

# Midnight → Solana: burn 4, released to the dev user's Solana address
bun run bridge:to-solana --amount 4 --recipient "$(bun -e 'console.log(require("./deployments/local.json").solana.user)')"

bun run bridge:status
```

Each command prints the transaction on the source chain, then polls the API until the transfer
is `completed` and prints the counterpart transaction.

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
   files), `midnight-operator.seed` and `midnight-user.seed` (32-byte hex seeds).
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

> [!NOTE]
> PLACEHOLDER(T7 live run, not done yet): the live deployment and the first round trip on
> Solana devnet + Midnight stagenet will be recorded here.
>
> | Item | Value |
> | --- | --- |
> | Solana program id (devnet) | PLACEHOLDER(T7) |
> | SPL mint (devnet) | PLACEHOLDER(T7) |
> | Bridge contract (stagenet) | PLACEHOLDER(T7) |
> | Token colour (stagenet) | PLACEHOLDER(T7) |
> | Solana lock tx | PLACEHOLDER(T7) |
> | Midnight mint tx | PLACEHOLDER(T7) |
> | Midnight burn tx | PLACEHOLDER(T7) |
> | Solana release tx | PLACEHOLDER(T7) |

## Project structure

```
packages/
  contracts-solana/      Bridge program (programs/bridge, committed build/bridge.so), instruction
                         builders + log parser, local validator, init-local and deploy-devnet scripts
  contracts-midnight/    bridge.compact, pinned compactc 0.35.0 toolchain, runtime-0.20 pin,
                         deploy (local + stagenet), mint signing, wallets, the 7 launchMidnight scripts
  database/              000-init.sql (bridge_transfers, relayer_jobs) and pgtyped queries
  node/                  Sync config, grammar, state machine, API, entry point
    relayer/             In-process relayer: job selection and backoff, embedded batcher, operator keys
  cli/                   bridge:to-midnight, bridge:to-solana, bridge:status
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
2. The node sees the log (after 32 confirmations) and upserts `s2m:<nonce>` as `observed`.
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
| `GET /transfers?direction=s2m\|m2s&status=observed\|submitted\|completed&limit=1..500` | Transfers with their relayer attempts |
| `GET /transfers/:id` | One transfer, `id` = `s2m:<lock nonce>` or `m2s:<withdrawal id>` |

`status` is derived: `completed` once sync has seen the counterpart, `submitted` once the
relayer has made an attempt, `observed` otherwise.

### Database

`packages/database/migrations/000-init.sql` creates `bridge_transfers` (owned by the state
machine; primary key `(direction, source_id)`; status only ever moves `observed` → `completed`)
and `relayer_jobs` (owned by the relayer; attempts, last attempt, last transaction, last error).
The queries are in `packages/database/sql/queries.sql`.

### Known limits

- **Trust model.** One operator key controls both sides: it can release the vault and authorize
  any mint. This is a proof of concept, not a trust-minimized bridge.
- **One operator, no rotation.** The key is sealed in the Midnight contract and stored in the
  Solana program's config.
- **`withdrawals` only grows.** Every burn adds an entry to the contract's map forever.
- **Burned coins are gone by construction.** The contract receives them with no witness and
  keeps no spend key.
- **No cross-contract calls under runtime 0.20 yet.** `mintFromSolana` returns the coin so that
  a future Solana-controlled Midnight account could receive it in the same transaction, but no
  such account exists here.
- **Devnet RPC rate limits.** Live sync uses smaller steps and slower polling (see
  Configuration); a keyed RPC is recommended.
- **Proof server 9.0.0-rc.8 runs from Docker** until a binary is published, and it needs about
  4 GiB of memory for a mint proof.
- **The local validator's RPC is reachable from your network.** `solana-test-validator` (Agave
  3.0.14) listens for JSON-RPC and faucet requests on every interface; `--bind-address` only
  covers gossip. Its coins are worthless, but do not run `bun run dev` on an untrusted network.

## Configuration

Local mode needs no configuration. These variables exist:

| Variable | Default | Read by |
| --- | --- | --- |
| `BRIDGE_MODE` | `local` | Node and CLI (`local` / `live`) |
| `BRIDGE_DEPLOYMENT` | `devnet-stagenet` | Live deployment file name or path |
| `BRIDGE_SECRETS_DIR` | `~/.config/solana-midnight-bridge` | Live keys and seeds (dir 700, files 600; never inside the template) |
| `SOLANA_DEVNET_RPC_URL` | `https://api.devnet.solana.com` | Live node, CLI and `deploy-devnet.ts` |
| `SOLANA_RPC_URL` | `http://127.0.0.1:8899` | Local Solana RPC override |
| `SOLANA_RPC_PORT`, `SOLANA_FAUCET_PORT` | `8899`, `9900` | Local validator |
| `SOLANA_RESET` | `true` | `false` keeps the local ledger across restarts |
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
| `BRIDGE_RELAYER_MINT_TIMEOUT_MS`, `BRIDGE_RELAYER_RELEASE_TIMEOUT_MS` | `900000`, `240000` | Per-submission wait |
| `BRIDGE_SOLANA_CONFIRMATION_DEPTH`, `BRIDGE_SOLANA_STEP_SIZE`, `BRIDGE_SOLANA_POLLING_MS`, `BRIDGE_SOLANA_DELAY_MS` | `32`, `10`/`5`, `2000`/`4000`, `2400`/`6000` (local/live) | Solana sync |
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

- **unit**, no chain and no ports (105 tests): instruction layouts, the log parser, the key
  guards and `sendTx`'s handling of landed failures (`solana-instructions.test.ts`); the mint
  digest, signature encoding, the batcher's parsing of the raw contract info and the midnight-js
  network id (`midnight-signing.test.ts`); every circuit run locally on runtime 0.20, including bad
  signatures, cross-contract and cross-network replays, a reused nonce and the wrong colour
  (`midnight-contract-logic.test.ts`); the state machine over recorded chain payloads, replayed
  and reordered (`state-machine.test.ts`); the sync configuration and the API, including a request
  that arrives before the node has created its tables (`node-config-api.test.ts`); relayer
  selection, backoff, the on-chain pre-checks and both counterpart inputs (`relayer-jobs.test.ts`);
  and CLI argument validation before any chain call (`cli-args.test.ts`).
- **program**: `solana-program.test.ts` on a throwaway validator on random ports: a lock logs
  and fills the vault; a non-operator release, a second release of the same id and zero amounts
  are refused.
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
  transaction ids) go to `logs/e2e-<timestamp>/`. The local validator keeps only its most recent
  blocks once its ledger cleanup starts (about 20-25 minutes after it starts), so the re-sync runs
  early in the suite and the test stack's node trails the Solana tip by 4 slots instead of 32
  (`BRIDGE_SOLANA_CONFIRMATION_DEPTH` in `start.test.ts`). This phase needs proof server
  9.0.0-rc.8: Docker, or a running one at
  `MIDNIGHT_CONTRACT_PROOF_SERVER_URL`. Without either it is skipped with a message, and
  `contract.test.ts` skips too unless a devnet with both provers is already running.

> [!NOTE]
> Last full run (2026-10-03, `LINK_LOCAL=1` in a linux/amd64 Docker container under emulation, with
> the rc.8 prover as a native sibling container): unit 105/105, program 8/8,
> end to end 14/14 (1739 s), contract 6/6 (244 s); the whole run
> took 39 minutes.
>
> PLACEHOLDER(T8.2): `LINK_LOCAL=1 bun run templates/run-template-tests.ts solana-midnight-bridge`
> from the monorepo root, once the template is registered there.

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
