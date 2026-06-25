---
slug: farcaster-template
title: "Fork, replace four files, ship: building a different app from farcaster-canvas"
authors: [effectstream]
tags: [farcaster, mini-apps, game-templates, cardano, evm, tutorial]
---

![Movie of the Year Poll: five movie cards with Best/Meh/Worst vote buttons and a live results bar chart](/img/blog/movie-poll-ui.png)

[farcaster-canvas](https://github.com/effectstream/farcaster-app) is a working pixel-painting Mini App. It is also a reusable scaffold. Every line of code that is specific to the canvas game lives in exactly four files inside `packages/node/`. Replace those four files and you have a different app running on the same batcher, the same node runtime, the same live-event system, and the same wallet injection -- without touching any of that plumbing.

This post shows what you inherit for free and walks through a concrete substitution: a Movie of the Year poll (Best / Meh / Worst, one vote per wallet per film) built on the same codebase.

<!-- truncate -->

## What you inherit

When you fork `farcaster-canvas` and leave the scaffold intact, you keep:

- **The batcher.** A hot-wallet service that collects signed inputs from users and posts them to the chain on a 1-second cadence. Users never pay gas; the batcher does. `packages/batcher/` handles this entirely.
- **The EffectStream node runtime.** Block ingestion, input validation, Postgres connection pooling, replay safety, and the deterministic PRNG. You configure it; it runs.
- **MQTT live events.** When your state machine calls `data.emit("SomethingHappened", payload)`, the runtime publishes to MQTT after the DB write commits. The frontend subscribes and re-fetches without polling.
- **EIP-1193 and Cardano wallet injection.** `@effectstream/wallets` surfaces wallet providers for both EVM (Warpcast's injected provider, MetaMask) and Cardano (Lace, Eternl, Nami, NuFi). Your app picks up whichever the user has.
- **The `composeCast` mechanic.** Share a deep link back into Warpcast as a Mini App tile. Your app URL, your content - the plumbing in `packages/frontend/client/src/miniapp.ts` stays unchanged.
- **A Postgres projection.** A schema you own, migrations under `packages/database/migrations/`, typed SQL via pgtyped. Nothing in this layer changes unless your schema does.
- **Two environments with one codebase.** `start.dev.ts` boots PGLite + local chain + node in one process. `start.mainnet.ts` points at the production chain and a managed Postgres. No code differences between envs, only config.

None of this is in the four files you replace.

## The four files you replace

| File | What it contains | farcaster-canvas | Movie poll |
|---|---|---|---|
| `packages/node/grammar.ts` | Vocabulary of valid inputs | `fork`, `paint` | `cardano-vote` |
| `packages/node/state-machine.ts` | All game rules | Canvas fork/fill logic | Vote deduplication + insert |
| `packages/database/migrations/000-init.sql` | Schema | `canvases`, `paints`, `rewards` | `movies`, `votes` |
| `packages/node/api.ts` | REST endpoints | `/api/canvases`, `/api/canvas/:id` | `/api/movies`, `/api/results` |

The rest of the monorepo - batcher, orchestrator, Lucid wallet server, Vite frontend shell, Fastify proxy, MQTT wiring - is untouched.

## Worked example: Movie of the Year Poll

### grammar.ts

The grammar declares the one input this app understands. The builtin `cardanoTransfer` grammar already captures the fields the Cardano sync primitive exposes (`txId`, `metadata`, `inputCredentials`, `outputs`), so we alias it under our own name:

```ts
import type { GrammarDefinition } from "@effectstream/concise";
import { builtinGrammars } from "@effectstream/sm/grammar";

export const grammar = {
  "cardano-vote": builtinGrammars.cardanoTransfer,
} as const satisfies GrammarDefinition;
```

One line of game-specific content.

### state-machine.ts

The state machine parses the vote out of the Cardano transaction metadata (label 7890), deduplicates by voter, and writes one row:

```ts
const VALID_MOVIES  = new Set(["dune2","gladiator2","wicked","alien","joker2"]);
const VALID_RATINGS = new Set(["best","meh","worst"]);

stm.addStateTransition("cardano-vote", function* (data) {
  const { txId, metadata, inputCredentials } = data.parsedInput;

  // Voter identity: first vkey witness hash from the Cardano TX.
  let voter = txId;
  try {
    const creds = JSON.parse(inputCredentials);
    if (creds[0]) voter = creds[0];
  } catch {}

  // Cardano metadata maps serialise as [{k, v}] pairs.
  // We embedded { movie: "dune2", rating: "best" } at label 7890.
  let movie, rating;
  try {
    const entry = JSON.parse(metadata)?.["7890"];
    if (Array.isArray(entry)) {
      for (const { k, v } of entry) {
        if (k === "movie")  movie  = String(v);
        if (k === "rating") rating = String(v);
      }
    }
  } catch {}

  if (!movie || !VALID_MOVIES.has(movie)) return;
  if (!rating || !VALID_RATINGS.has(rating)) return;

  // One vote per wallet per movie. ON CONFLICT DO NOTHING is the hard guard.
  yield* World.resolve(insertVote, {
    movie_id: movie, voter, rating,
    tx_hash: txId, block_height: data.blockHeight,
  });
});
```

Thirty lines. No batcher code, no wallet code, no MQTT publish -- the runtime handles everything outside this function.

### schema

The migration seeds five movies and enforces a UNIQUE constraint at the DB layer as a hard guard:

```sql
CREATE TABLE movies (id TEXT PRIMARY KEY, title TEXT NOT NULL);
INSERT INTO movies VALUES
  ('dune2','Dune: Part Two'),('gladiator2','Gladiator II'),
  ('wicked','Wicked'),('alien','Alien: Romulus'),('joker2','Joker: Folie a Deux');

CREATE TABLE votes (
  id           SERIAL PRIMARY KEY,
  movie_id     TEXT NOT NULL REFERENCES movies(id),
  voter        TEXT NOT NULL,
  rating       TEXT NOT NULL CHECK (rating IN ('best','meh','worst')),
  tx_hash      TEXT NOT NULL,
  block_height INTEGER NOT NULL,
  UNIQUE (movie_id, voter)
);
```

### api.ts

Two read endpoints replace the canvas gallery:

```ts
server.get("/api/movies", async (_req, reply) => {
  const result = await dbConn.query("SELECT id, title FROM movies ORDER BY id");
  reply.send(result.rows);
});

server.get("/api/results", async (_req, reply) => {
  const result = await dbConn.query(`
    SELECT m.id, m.title,
      COUNT(CASE WHEN v.rating = 'best'  THEN 1 END)::int AS best_count,
      COUNT(CASE WHEN v.rating = 'meh'   THEN 1 END)::int AS meh_count,
      COUNT(CASE WHEN v.rating = 'worst' THEN 1 END)::int AS worst_count,
      COUNT(v.id)::int AS total
    FROM movies m LEFT JOIN votes v ON m.id = v.movie_id
    GROUP BY m.id, m.title ORDER BY best_count DESC
  `);
  reply.send(result.rows);
});
```

The frontend polls this every 2 seconds - or refreshes on the `VoteRecorded` MQTT event, whichever comes first.

![Wallet connected - address shown in header, faucet funded, vote buttons active](/img/blog/movie-poll-wallet.png)

## The batcher: why users don't pay gas

The batcher is the part that makes Farcaster Mini Apps feel instant. Here's the flow:

1. The user picks a rating and clicks. The frontend calls `useWallet.submit(["vote", movieId, rating])` (EVM path) or POSTs to `/cardano/vote` (Cardano path).
2. For EVM: the user signs an off-chain message (no gas, no confirmation dialog). The batcher collects signed inputs from all concurrent users and submits one transaction per second to `EffectstreamL2Contract.effectstreamSubmitGameInput(bytes)`. The batcher's hot wallet pays gas on behalf of every user.
3. The chain emits an `EffectstreamGameInteraction` event. The node's sync primitive parses it, validates it against the grammar, and feeds it to the state machine.
4. The state machine writes to Postgres and emits `VoteRecorded`. MQTT delivers it to the frontend. The results panel updates.

This architecture is multi-chain by design. The same grammar and state machine work whether the settlement chain is EVM (Base, a local Hardhat anvil) or Cardano (a YACI devnet, mainnet). On the Cardano path, users attach a small ADA transfer with transaction metadata that carries the vote payload - no batcher needed, the wallet signs and submits directly to the Cardano mempool.

The other direction - a Cardano-native batcher that accepts signed inputs from multiple chains and posts to Cardano - is also possible. It requires implementing a custom `BlockchainAdapter`, but the state machine and grammar stay unchanged.

## Config is the chain

Switching from EVM to Cardano settlement is a config change, not a code change. The relevant diff in `packages/node/config.dev.ts`:

```diff
- .addViemNetwork({ ...hardhat, name: "evmMain" })
+ // YACI devnet: local Cardano chain started by the orchestrator
+ .addNetwork({ name: "yaci", type: Yaci, adminApiUrl: "http://localhost:10000" })

- .addParallel(n => n.evmMain, n => ({
-   name: "canvas-l2", type: EVM_RPC_PARALLEL, chainUri: n.rpcUrls[0],
- }))
+ .addParallel(n => n.yaci, n => ({
+   name: "cardano-utxorpc", type: CARDANO_UTXORPC_PARALLEL,
+   rpcUrl: "http://127.0.0.1:50051",
+ }))

- .addPrimitive(s => s["canvas-l2"], () => ({
-   type: PrimitiveTypeEVMEffectstreamL2,
-   contractAddress: ...,
- }))
+ .addPrimitive(s => s["cardano-utxorpc"], () => ({
+   type: PrimitiveTypeCardanoTransfer,
+   stateMachinePrefix: "cardano-vote",
+ }))
```

Grammar, state machine, schema, and API are untouched. Only the wiring layer changes.

## Get started

```bash
git clone https://github.com/effectstream/farcaster-app my-app
cd my-app
bun install

# Replace the four game files (grammar, state-machine, migrations, api)
# then:
bun run dev
```

The orchestrator boots PGLite + the local chain + the node + the frontend in one command. Open `http://localhost:10599`.

To target Cardano instead of EVM, follow the config diff above and run `bun run dev` - the orchestrator switches to YACI DevKit + Dolos automatically.

The `farcaster-canvas` demo and the full source are at https://github.com/effectstream/farcaster-app.
