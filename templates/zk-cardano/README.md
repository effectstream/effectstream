# Private Delegation Voting — Cardano + Midnight

> Public stake on Cardano decides who may vote; private ZK ballots on Midnight decide the outcome, with one state machine reading both chains.

A governance app has two halves that want opposite things. Eligibility must be *public* —
anyone should be able to check that a voter really holds the stake they claim. Ballots want
to be *private* — nobody should be able to link a voter to their choice. This template puts
each half on the chain that is good at it: stake delegation on Cardano, a Compact circuit
with nullifiers on Midnight, and an Effectstream node syncing both into one database.

It is also an honest look at where that split stops working on its own. The two halves are
joined in the node's database, not in the ZK circuit — and the section below says exactly
what that does and does not buy you, because getting this wrong is the most common way a
"private voting" design turns out not to be one.

## What this template shows

**Two chains, two different jobs, one state machine.**

The Cardano half is deliberately, entirely public. A wallet registers its stake key and
delegates to the YACI DevKit genesis pool:

```ts
// packages/contracts-cardano/cardano-tx-helpers.ts
const tx = lucid
  .newTx()
  .registerAndDelegate.ToPool(rewardAddress, poolId);
```

The `CardanoPoolDelegation` primitive scans UTxO-RPC transaction certificates for
delegations to the pools it was configured with, and emits `{ address, pool, epoch }` where
`address` is the stake credential hash:

```ts
// packages/node/config.dev.ts
.addPrimitive(
  (syncProtocols) => (syncProtocols as any).parallelUtxoRpc,
  () => ({
    name: "CardanoPoolDelegation",
    type: PrimitiveTypeCardanoPoolDelegation,
    startBlockHeight: 1,
    stateMachinePrefix: "cardano-pool-delegation",
    pools: ["7301761068762f5900bde9eb7c1c15b09840285130f5b0f53606cc57"],
    network: "yaci",
  }),
)
```

The state transition writes one row per credential into `eligible_voters`, so the node's
database becomes a queryable mirror of an on-chain fact anyone could verify themselves.
Note what the certificate does *not* carry: there is no ADA amount in a delegation
certificate, so this template's notion of eligibility is "delegated to this pool at all",
not "delegated at least N ADA".

The Midnight half is where privacy lives. `cast_vote` never receives the voter's identity
as an argument — it pulls a secret key in through a witness, derives a nullifier from it,
and refuses a second vote on the same proposal by checking a set membership:

```compact
// packages/contracts-midnight/contract-ballot/src/ballot.compact
circuit cast_vote(proposal_id: Uint<64>, proposal_id_bytes: Bytes<32>, vote_yes: Boolean): [] {
  const sk = private$secret_key();
  const nul = voter_nullifier(sk);
  const vk = disclose(persistentHash<Vector<2, Bytes<32>>>([nul, disclose(proposal_id_bytes)]));
  assert(!voted.member(vk), "already voted");
  voted.insert(vk, true);
  if (disclose(vote_yes)) {
    tally_yes.increment(1);
  } else {
    tally_no.increment(1);
  }
}
```

The witness is a plain local function returning the key from private state — it never
enters the transaction:

```ts
// packages/contracts-midnight/contract-ballot/src/witnesses.ts
export function createWitnesses(secretKey: Uint8Array) {
  return {
    private$secret_key(context: { privateState: BallotPrivateState }): [BallotPrivateState, Uint8Array] {
      return [context.privateState, secretKey];
    },
  };
}
```

**What the state machine can and cannot see.** The `MidnightGeneric` primitive is
configured with the contract's generated ledger reader, so the node observes exactly the
fields the Compact source marks `export ledger` — `deployer`, `proposal_count`,
`proposal_active`, `proposal_text`, `tally_yes`, `tally_no`. The `voted` map is declared
without `export`, so it is not part of what the node reads back. The transition therefore
works only with counts and proposal metadata:

```ts
// packages/node/state-machine.ts
const proposalCount = toNumber(payload.proposal_count);
const yesCount = toNumber(payload.tally_yes);
const noCount = toNumber(payload.tally_no);
```

**Be precise about what this buys.** The circuit checks that a caller knows *a* secret key
and has not already used it on this proposal. It does not check anything about Cardano —
nothing in `packages/contracts-midnight/contract-ballot/src/ballot.compact` binds a
Midnight secret key to a stake credential, and no Cardano data is passed into any circuit.
Eligibility is enforced *outside* the chain, by
the node's `GET /api/eligible/:credential` endpoint and the frontend's eligibility card. So:

- The set of delegators is public, and so is every tally. Neither is hidden by anything.
- An individual vote is not linkable on-chain to a Midnight wallet, because the ledger
  stores only `persistentHash([nullifier, proposal_id])`.
- `vote_yes` is `disclose`d so it can move a public counter — the direction of a vote is
  public in aggregate, just unattributed.
- Eligibility and ballots are correlated only in the node's Postgres tables, and only in
  aggregate. The state machine literally cannot attribute a vote to a delegator.
- Because eligibility is not proven in-circuit, a wallet that never delegated can still
  cast a vote that the contract accepts. Binding the two — e.g. proving membership in a
  delegator set inside `cast_vote` — is the next step this template stops short of, and is
  the interesting exercise it sets up.

**Local dev shortcuts to undo before copying this.** The browser client votes with a fixed
key rather than a per-user one:

```ts
// packages/frontend/client/src/midnight-api.ts
const DEPLOYER_SECRET_KEY = new Uint8Array(32);
DEPLOYER_SECRET_KEY[31] = 0x01;
const voterKey = DEPLOYER_SECRET_KEY;
```

and the Midnight wallet is derived from the hardcoded genesis mint seed. Every browser in
the local stack therefore derives the *same* nullifier: the first vote on a proposal
succeeds and the next one fails with `already voted`. Similarly, `tally_yes` and `tally_no`
are single global counters rather than per-proposal maps, so `packages/node/state-machine.ts`
writes the same totals into every proposal's `vote_tallies` row.

## Effectstream features used

| Feature | Where | Used for |
| --- | --- | --- |
| `ConfigBuilder` (`@effectstream/config`) | `packages/node/config.dev.ts` | One NTP main clock with Cardano and Midnight as parallel protocols |
| Cardano sync (`ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL`) | `packages/node/config.dev.ts` | Reading Cardano blocks from Dolos over UTxO-RPC from `origin` |
| Midnight sync (`ConfigSyncProtocolType.MIDNIGHT_PARALLEL`) | `packages/node/config.dev.ts` | Reading ledger state through the Midnight indexer |
| `PrimitiveTypeCardanoPoolDelegation` (`@effectstream/sm/builtin`) | `packages/node/config.dev.ts` | Detecting delegation certificates for a specific pool hash |
| `PrimitiveTypeMidnightGeneric` (`@effectstream/sm/builtin`) | `packages/node/config.dev.ts` | Decoding the ballot contract's exported ledger fields |
| Builtin grammars (`@effectstream/sm/grammar`) | `packages/node/grammar.ts` | Typing both primitives' payloads |
| `Stm` state transitions (`@effectstream/sm`) | `packages/node/state-machine.ts` | Writing eligibility from one chain and tallies from the other |
| `World.resolve` (`@effectstream/coroutine`) | `packages/node/state-machine.ts` | Running pgtyped upserts inside a transition |
| Migrations + pgtyped queries (`@effectstream/db`) | `packages/database/` | `eligible_voters`, `proposals`, `vote_tallies` |
| `StartConfigApiRouter` (`@effectstream/runtime`) | `packages/node/api.ts` | Typebox-typed eligibility/proposal routes plus a server-side Cardano wallet |
| `MidnightAdapter` (`@effectstream/batcher-sdk`) | `packages/batcher/midnight-balancing.ts` | A Midnight-only batcher bound to the `parallelMidnight` protocol |
| Compact contract deploy (`@effectstream/midnight-contracts`) | `packages/contracts-midnight/deploy.ts` | Deploying `contract-ballot` and recording its address for the config |
| Orchestrator launchers (`@effectstream/orchestrator`) | `start.dev.ts` | `launchPglite` / `launchCardano` / `launchMidnight` process graph |

## Quick start

**Prerequisites**

- [Bun](https://bun.sh)
- The [Compact compiler](https://github.com/midnightntwrk/compact), version `0.31.0` —
  `packages/contracts-midnight/contract-ballot/package.json` invokes
  `compact compile +0.31.0`, and `launchMidnight` refuses to start if `compact` is not on
  PATH. Verify with `compact --version`, and install the toolchain version with
  `compact update 0.31.0`.

No Foundry and no EVM toolchain — this template has no Solidity. YACI DevKit and Dolos are
ordinary npm dependencies of `packages/contracts-cardano/`.

```bash
bun install
bun run dev
```

Inside the Effectstream monorepo, run `./link.sh` instead of `bun install` — it installs
dependencies and then symlinks every `@effectstream/*` package to its local source.
`bun run dev` compiles the Compact contract itself (the `midnight-contract-compile`
process in `start.dev.ts`) before the Midnight node starts, so `bun run build:midnight` is
only needed if you change the Compact source and want to recompile on its own.

| Service | URL |
| --- | --- |
| Frontend | http://localhost:10599 |
| Sync node HTTP API | http://localhost:9999 |
| Batcher | http://localhost:3334 |
| Orchestrator API | http://localhost:4747 |
| Midnight node RPC | http://127.0.0.1:9944 |
| Midnight indexer (GraphQL) | http://127.0.0.1:8088/api/v3/graphql |
| Midnight proof server | http://127.0.0.1:6300 |
| YACI DevKit admin API | http://localhost:10000 |
| Dolos MiniBF (Blockfrost-compatible) | http://localhost:3000 |
| Dolos gRPC (UTxO-RPC) | http://127.0.0.1:50051 |
| YACI Cardano node | `tcp://localhost:3001` |
| PGLite (Postgres wire protocol) | `postgres://localhost:5432` |

The flow in the browser is: **Connect Cardano Wallet** (creates a fresh Lucid wallet and
funds it with 10,000 ADA from the YACI faucet) → **Delegate to Pool** → **Check
Eligibility** (looks the resulting stake credential up in `eligible_voters`) → **Connect
Wallet** on the Midnight card → **Create** a proposal → **Yes**/**No**. Proof generation
for a vote takes a noticeable moment; the panel says so while it runs.

## Project structure

```
zk-cardano/
├── start.dev.ts                          # Orchestrator process graph for `bun run dev`
├── link.sh                               # Symlink @effectstream/* to monorepo sources
└── packages/
    ├── node/                             # @zk-cardano/node — config, grammar, state machine, API, entrypoint
    ├── database/                         # @zk-cardano/database — migrations and pgtyped queries
    ├── contracts-cardano/                # @zk-cardano/contracts-cardano — YACI + Dolos config, Lucid delegation helpers
    ├── contracts-midnight/               # @zk-cardano/contracts-midnight — Midnight node/indexer/prover scripts, deploy
    │   └── contract-ballot/              # @zk-cardano/midnight-contract — ballot.compact + witnesses
    ├── batcher/                          # @zk-cardano/batcher — Midnight-only batcher
    ├── frontend/                         # @zk-cardano/frontend — React app and Fastify static server
    └── tests/                            # @zk-cardano/tests — four-phase suite plus a Playwright spec
```

## How it works

### Grammar

Both inputs use builtin grammars, keyed by each primitive's `stateMachinePrefix`:

```ts
// packages/node/grammar.ts
export const grammar = {
  "cardano-pool-delegation": builtinGrammars.cardanoPoolDelegation,
  "midnightBallotState": builtinGrammars.midnightGeneric,
} as const satisfies GrammarDefinition;
```

`cardanoPoolDelegation` yields `{ address, pool, epoch }`; `midnightGeneric` yields a
single `payload` field holding the decoded ledger snapshot.

### State machine

The Cardano transition is a single upsert keyed by stake credential, so re-delegating
updates a row rather than adding one:

```ts
// packages/node/state-machine.ts
yield* World.resolve(upsertEligibleVoter, {
  staking_credential: address,
  pool,
  epoch: Number(epoch),
  block_height: data.blockHeight,
});
```

The Midnight transition walks proposal ids `1..proposal_count`, reading the two `Map`
ledger fields through a small helper (`mapLookup`) that handles both the compact-runtime
map API and a plain object, then upserts a `proposals` row and a `vote_tallies` row per id.
Because the contract's tallies are global counters rather than per-proposal maps, every
proposal receives the same `yes_count` / `no_count`.

### Contracts

`packages/contracts-midnight/contract-ballot/src/ballot.compact` exposes three circuits:

| Circuit | Guard | Effect |
| --- | --- | --- |
| `create_proposal(text)` | `assert(public_key(sk) == deployer.read(), "only deployer")` | Increments `proposal_count`, inserts into `proposal_active` and `proposal_text` |
| `cast_vote(proposal_id, proposal_id_bytes, vote_yes)` | `assert(!voted.member(vk), "already voted")` | Inserts the vote nullifier and increments `tally_yes` or `tally_no` |
| `close_proposal(proposal_id)` | `assert(public_key(sk) == deployer.read(), "only deployer")` | Sets `proposal_active[proposal_id] = false` |

Both the deployer check and the voter nullifier are derived from the same witness key by
domain-separated hashing, which is why the two derivations use different padding:

```compact
circuit voter_nullifier(sk: Bytes<32>): Bytes<32> {
  return disclose(persistentHash<Vector<2, Bytes<32>>>([pad(32, "zk-cardano:nul:"), sk]));
}

circuit public_key(sk: Bytes<32>): Bytes<32> {
  return disclose(persistentHash<Vector<2, Bytes<32>>>([pad(32, "zk-cardano:pk:"), sk]));
}
```

`packages/contracts-midnight/deploy.ts` deploys it with a deployer key whose 32nd byte is
`0x01` and writes the resulting address to a `contract-ballot.<networkId>.json` file, which
`readMidnightContract("contract-ballot", ...)` reads back in both the node config and the
batcher — the address is never pasted anywhere by hand.

There is no Cardano contract. `packages/contracts-cardano/` is dev infrastructure:
`packages/contracts-cardano/fill-template.ts` fetches YACI's Byron/Shelley/Alonzo/Conway
genesis files and writes `packages/contracts-cardano/dolos.toml` from
`packages/contracts-cardano/dolos.template.toml`;
`packages/contracts-cardano/cardano-tx-helpers.ts` points Lucid Evolution at Dolos for
reads and YACI's `/local-cluster/api/tx/submit` for writes, and exports the genesis pool
constants used by the config and the tests.

### API

`packages/node/api.ts` adds these routes to the node on port 9999:

| Route | Returns |
| --- | --- |
| `GET /api/eligible` | Every row in `eligible_voters` (empty array before the table exists) |
| `GET /api/eligible/:credential` | One voter, or `404` |
| `GET /api/proposals` | Proposals joined to their tallies |
| `GET /api/contract-state` | Aggregate summary — proposal count, total yes/no, last block height |
| `POST /api/cardano/connect` | Creates and funds a server-side Lucid wallet, returns address, stake credential, seed phrase and UTxOs |
| `GET /api/cardano/wallet` | Status of that wallet, including whether it has delegated |
| `POST /api/cardano/delegate` | Submits `registerAndDelegate.ToPool` to the genesis pool |

The runtime adds `GET /health` and `GET /block-heights` on the same port.

`packages/frontend/server/main.ts` is a plain Fastify static server on 10599 with an
SPA fallback — no proxying. The client calls the node directly via `VITE_API_URL`, and
talks to the Midnight indexer, node and proof server from the browser.

### Voting path, and where the batcher sits

The vote is *not* batched. `packages/frontend/client/src/midnight-api.ts` builds a wallet
facade, joins the deployed contract with `findDeployedContract`, and calls the circuit
directly — proofs are generated against the local proof server on 6300:

```ts
// packages/frontend/client/src/midnight-api.ts
const result = await actualContract.callTx.cast_vote(
  BigInt(proposalId),
  proposalIdBytes,
  voteYes,
);
```

`packages/batcher/batcher.dev.ts` runs a single-target batcher — a `MidnightAdapter`
bound to the ballot contract and to the `parallelMidnight` sync protocol, batching on a
1 s time window with `confirmationLevel: "wait-effectstream-processed"` — and is started by
both `start.dev.ts` and the test launcher. It is there as the wired-up starting point for
routing votes through a relayer instead of the user's own wallet; the current UI does not
use it, and the cross-chain test only checks that it is listening.

### Database

`packages/database/migrations/000-init.sql` defines three tables — `eligible_voters` keyed
by `staking_credential`, `proposals` keyed by the Compact proposal id, and `vote_tallies`
referencing `proposals(id)`. `getProposals` in `packages/database/sql/queries.sql` is the
only join in the template, and it is what makes `GET /api/proposals` a single query:

```sql
SELECT p.id, p.title, p.active, p.block_height,
       COALESCE(vt.yes_count, 0) as yes_count,
       COALESCE(vt.no_count, 0) as no_count
FROM proposals p
LEFT JOIN vote_tallies vt ON p.id = vt.proposal_id
ORDER BY p.id ASC
```

Run `bun run build:pgtypes` after editing the SQL to regenerate the typed bindings.

## Configuration

The template targets the local stack only — there is no mainnet config. The Midnight
network id, node, indexer and proof-server URLs all come from `midnightNetworkConfig`
(`@effectstream/midnight-contracts/midnight-env`); the Cardano endpoints and the monitored
pool hash are literals in `packages/node/config.dev.ts`.

| Variable | Set by | Effect |
| --- | --- | --- |
| `PGLITE` | `start.dev.ts` (`"true"`) | Run against embedded PGLite instead of an external Postgres |
| `MQTT_BROKER` | `start.dev.ts` (`"false"`) | Skip the MQTT broker; the frontend polls HTTP instead |
| `DEBUG_PGLITE` | `start.dev.ts` (`"0"`) | Silence PGLite query logging |
| `MIDNIGHT_STORAGE_PASSWORD` | `start.dev.ts` (`"YourPasswordMy1!"`) | Passphrase for the Midnight node and contract deploy |
| `BATCHER_PORT` | Optional, default `3334` | Batcher HTTP port |
| `EFFECTSTREAM_API_PORT` | Runtime, default `9999` | Node HTTP API port |
| `VITE_API_URL` | `packages/frontend/.env.dev` | Node API the browser calls |
| `VITE_BATCHER_URL` | `packages/frontend/.env.dev` | Batcher URL exposed to the client |
| `VITE_MIDNIGHT_INDEXER_HTTP` / `_WS` | `packages/frontend/.env.dev` | Indexer GraphQL endpoints |
| `VITE_MIDNIGHT_NODE_HTTP` | `packages/frontend/.env.dev` | Midnight node RPC |
| `VITE_MIDNIGHT_PROOF_SERVER_URL` | `packages/frontend/.env.dev` | Proof server used for circuit proofs |
| `VITE_MIDNIGHT_NETWORK_ID` | `packages/frontend/.env.dev` (`undeployed`) | Selects the contract-address file and wallet network |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PW` / `DB_NAME` | `packages/tests/run-tests.ts` | Postgres connection used by the test suite |

To watch a different stake pool, change the `pools` array (and `network`, which selects the
era parameters used to derive the epoch) on the `CardanoPoolDelegation` primitive. To point
at a real Cardano network, replace the Dolos `rpcUrl`, set `startChainPoint` to a recent
point instead of `"origin"`, and drop the `delayMs` probe — it exists only to shift the
devnet's backdated block timestamps onto the current NTP timeline.

## Testing

```bash
bun run test
```

`packages/tests/run-tests.ts` boots its own orchestrator config
(`packages/tests/start.test.ts`, which recompiles the Compact contract before deploying,
because `packages/contracts-midnight/contract-ballot/src/managed/` is stripped from the CI Docker context) and runs four phases:

- **A — Infrastructure.** Waits for `cardano-submit-tx` and `midnight-contract` to
  complete; asserts the YACI admin API and Dolos Blockfrost endpoint respond, the Midnight
  indexer answers a GraphQL query, a `contract-ballot.*.json` address file was written, the
  node reports healthy, and `/block-heights` is actually advancing.
- **B — State machine.** Asserts `eligible_voters` exists and holds a row whose `pool`
  equals the YACI genesis pool hash with sane `epoch` and `block_height`; asserts both
  `CardanoPoolDelegation` and `MidnightContractState` appear in
  `effectstream.primitive_accounting`; asserts the batcher is listening.
- **C — API.** `GET /api/eligible/<known>` returns the row it was seeded with, and an
  unknown credential returns `404`; `GET /api/proposals` returns an array.
- **D — Frontend.** Runs the Vite build and checks `client/dist/index.html` exists.

A broader Playwright suite lives at `packages/frontend/e2e/app.spec.ts` — page render,
eligibility flows, proposal and vote panels, the Cardano connect/delegate UI and every API
endpoint. It is not part of `bun run test`; run it against a live stack with
`bun run --filter @zk-cardano/frontend test:e2e`.

## Where to go next

- [Midnight](https://effectstream.github.io/docs/home/chains/midnight) — how Effectstream reads public state produced by private circuit execution
- [Cardano](https://effectstream.github.io/docs/home/chains/cardano) — YACI DevKit, Dolos and the Cardano primitives in detail
- [Primitives](https://effectstream.github.io/docs/home/components/primitives) — what a primitive extracts and how it reaches the state machine
- [Sync protocols and chain config](https://effectstream.github.io/docs/home/components/sync-service) — main vs parallel protocols and how their data is interleaved
- [EVM-Cardano Explorer](https://effectstream.github.io/docs/home/templates/evm-cardano) — the sibling template that pairs Cardano with an EVM chain and no ZK layer
