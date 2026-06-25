---
slug: farcaster-template
title: "A Farcaster Mini App that Cardano wallets can vote in"
authors: [effectstream]
tags: [farcaster, mini-apps, game-templates, cardano, evm, tutorial]
---

![Movie of the Year Poll: five TMDB poster cards with Best/Meh/Worst vote buttons and a live results bar chart](/img/blog/movie-poll-ui.png)

Farcaster is an EVM-native platform. When you build a Mini App on Warpcast, the default assumption is that your users have a Base wallet. But Cardano wallet holders -- Lace, Eternl, Nami, NuFi users -- are in the Farcaster ecosystem too, and building two separate apps to serve both audiences is the obvious option. With EffectStream it isn't the necessary one.

This is a build log for the **Movie of the Year Poll**: five 2024 films, three ratings (Best / Meh / Worst), one vote per wallet per movie, live results. The same Postgres schema, the same state machine, and the same frontend serve both paths -- the only difference is a config file.

<!-- truncate -->

## Where the code comes from

The starting point is [farcaster-canvas](https://github.com/effectstream/farcaster-app), a collaborative pixel-painting game that runs as a Farcaster Mini App. The previous post covers the full architecture. The short version: every line of app-specific logic lives in exactly four files inside `packages/node/`. Everything else -- the batcher, the node runtime, the wallet injection layer, the Postgres connection pool, the Vite frontend shell -- is shared infrastructure that you keep unchanged.

| File | farcaster-canvas | Movie poll |
|---|---|---|
| `packages/node/grammar.ts` | `fork`, `paint` | `cardano-vote` |
| `packages/node/state-machine.ts` | Canvas fork / fill logic | Vote deduplication + insert |
| `packages/database/migrations/000-init.sql` | `canvases`, `paints`, `rewards` | `movies`, `votes` |
| `packages/node/api.ts` | `/api/canvases`, `/api/canvas/:id` | `/api/movies`, `/api/results` |

## What's actually Farcaster-specific

Everything described so far - the grammar, the state machine, the schema, the API, the chain config - is chain-agnostic EffectStream infrastructure. The entire Farcaster integration is exactly two things.

**1. The embed manifest.** Warpcast fetches `/.well-known/farcaster.json` before opening any Mini App frame. The file is a signed JSON object with three fields:

```json
{
  "header": "eyJhbGciOiJFZERTQSIsInR5cCI6Ikp...",
  "payload": "eyJhcHBVcmwiOiJodHRwczovL215YX...",
  "signature": "MjA5YWM5NTI0ZjYwZDI4..."
}
```

`payload` is a base64-encoded object that declares the app URL, splash screen, and webhook endpoint. `signature` is an EdDSA signature from the developer's Farcaster account key. You generate it once with the Farcaster developer portal and serve it as a static file. That's the entire embed integration.

**2. The wallet connector.** Inside Warpcast, `window.ethereum` and EIP-6963 wallet announces don't exist. The Farcaster Mini App SDK exposes an EIP-1193 provider at `sdk.wallet.ethProvider` instead. Outside Warpcast, in a regular browser, you want MetaMask, Rabby, Coinbase, or any EIP-6963 wallet. The `useWallet.ts` hook resolves the right provider in priority order:

```ts
// 1. Farcaster Mini App host -- the only path that works inside Warpcast.
//    sdk.wallet.ethProvider is direct; the SDK's own EIP-6963 announce is
//    async (Comlink -> host -> postMessage back) and races against discovery.
// 2. EIP-6963 multi-injected providers (MetaMask, Rabby, Coinbase, etc.).
// 3. Legacy window.ethereum -- old wallets that never adopted EIP-6963.
```

One hook, both contexts, no code fork. When the Cardano wallet path is active, this hook is simply unused - LucidEvolution handles the Cardano side directly.

Everything else in the template is standard EffectStream scaffolding.

## How a Cardano vote works end to end

The EVM path for this kind of app is well-documented: user signs an off-chain message, the batcher bundles it, a contract emits an event, the indexer picks it up. Cardano is more direct -- no batcher, no contract -- and the mechanics are worth spelling out.

**1. The wallet** is generated from a BIP-39 mnemonic via LucidEvolution's `fromSeed`. In the dev setup it's an ephemeral hot wallet; production would use browser wallet injection (Lace, Eternl, etc.) instead. A YACI devnet faucet tops it up with test ADA.

**2. The transaction** carries the vote as Cardano transaction metadata at label `7890`. Lucid builds and signs it:

```ts
const tx = await lucid
  .newTx()
  .pay.ToAddress(walletAddress, { lovelace: 2_000_000n })
  .attachMetadata(7890n, { movie: movieId, rating })
  .complete();
const signed = await tx.sign.withWallet().complete();
const txHash = await signed.submit();
```

The `2_000_000n` lovelace (2 ADA) output is required by the Cardano minimum UTxO rule -- every transaction output must carry at least a small amount of ADA. Sending to your own address keeps the cost minimal; the metadata is the actual payload.

**3. Metadata serialization** is a subtlety worth knowing. Cardano serializes metadata maps as `[{k, v}]` arrays, not plain JSON objects. What you wrote as `{ movie: "dune2", rating: "best" }` arrives in the indexer as:

```json
[{"k": "movie", "v": "dune2"}, {"k": "rating", "v": "best"}]
```

The state machine iterates the pairs explicitly.

**4. Voter identity** comes from `inputCredentials` -- the first vkey witness hash on the Cardano transaction. This is more crypto-native than an address: it is the hash of the actual signing key, regardless of which address the user controls. The state machine uses it as the deduplication key.

**5. Block ingestion** runs through Dolos MiniBF (a UTxORPC relay) connected to the YACI devnet. `PrimitiveTypeCardanoTransfer` watches for transactions that match the grammar prefix, extracts the metadata, and feeds a typed input into the state machine for each block.

**6. Deduplication** is enforced at the database layer. The `votes` table has a `UNIQUE(movie_id, voter)` constraint and the insert uses `ON CONFLICT DO NOTHING`. If the same wallet submits a second vote for the same movie, the transaction lands on chain and the indexer processes it, but the row is silently dropped. No error, no user-visible failure.

The wallet log in the UI makes the full flow visible:

![Technical wallet log showing BIP-39 generation, YACI faucet TX, metadata construction, CBOR submission, and block confirmation](/img/blog/movie-poll-vote.png)

## The four files

### grammar.ts

The grammar declares what inputs the app recognizes. `cardanoTransfer` is a builtin that captures `txId`, `metadata`, `inputCredentials`, and `outputs` from any Cardano transfer -- we alias it under our own name:

```ts
export const grammar = {
  "cardano-vote": builtinGrammars.cardanoTransfer,
} as const satisfies GrammarDefinition;
```

### state-machine.ts

```ts
const VALID_MOVIES  = new Set(["dune2","gladiator2","wicked","alien","joker2"]);
const VALID_RATINGS = new Set(["best","meh","worst"]);

stm.addStateTransition("cardano-vote", function* (data) {
  const { txId, metadata, inputCredentials } = data.parsedInput;

  // Voter = first vkey witness hash (signing key identity, not address).
  let voter = txId;
  try {
    const creds = JSON.parse(inputCredentials);
    if (creds[0]) voter = creds[0];
  } catch {}

  // Cardano metadata maps arrive as [{k, v}] pairs.
  let movie, rating;
  try {
    const entry = JSON.parse(metadata)?.["7890"];
    if (Array.isArray(entry))
      for (const { k, v } of entry) {
        if (k === "movie")  movie  = String(v);
        if (k === "rating") rating = String(v);
      }
  } catch {}

  if (!movie || !VALID_MOVIES.has(movie)) return;
  if (!rating || !VALID_RATINGS.has(rating)) return;

  yield* World.resolve(insertVote, {
    movie_id: movie, voter, rating,
    tx_hash: txId, block_height: data.blockHeight,
  });
});
```

Thirty lines. No chain code, no wallet code, no event publishing -- the runtime handles all of that outside this function.

### schema

```sql
CREATE TABLE movies (id TEXT PRIMARY KEY, title TEXT NOT NULL);
INSERT INTO movies VALUES
  ('dune2','Dune: Part Two'), ('gladiator2','Gladiator II'),
  ('wicked','Wicked'), ('alien','Alien: Romulus'),
  ('joker2','Joker: Folie a Deux');

CREATE TABLE votes (
  id           SERIAL PRIMARY KEY,
  movie_id     TEXT    NOT NULL REFERENCES movies(id),
  voter        TEXT    NOT NULL,
  rating       TEXT    NOT NULL CHECK (rating IN ('best','meh','worst')),
  tx_hash      TEXT    NOT NULL,
  block_height INTEGER NOT NULL,
  UNIQUE (movie_id, voter)
);
```

### api.ts

Two read endpoints. The frontend polls `/api/results` every two seconds to update the bar chart:

```ts
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

### The frontend

The frontend is a React + Vite app that ships inside `packages/frontend/`. Five `MovieCard` components render in a grid - each shows the TMDB poster, live vote counts, and Best / Meh / Worst buttons. A log panel at the bottom records wallet activity and chain events in real time: key generation, faucet TX, metadata construction, submission hash, and block confirmation as each step completes. Results come from polling `/api/results` every two seconds; the counts update live as votes land on chain.

This is plain React - no special EffectStream frontend library. You can replace it with anything that can hit an HTTP endpoint.

![Connected wallet showing address in header, vote buttons active per movie card](/img/blog/movie-poll-wallet.png)

## Config is the chain

The four app files are identical whether the settlement chain is EVM or Cardano. The only thing that changes is the wiring in `config.dev.ts`. Here is the relevant diff from the canvas game to the poll:

```diff
- .addViemNetwork({ ...hardhat, name: "evmMain" })
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
-   contractAddress: "0x...",
- }))
+ .addPrimitive(s => s["cardano-utxorpc"], () => ({
+   type: PrimitiveTypeCardanoTransfer,
+   stateMachinePrefix: "cardano-vote",
+ }))
```

The grammar, state machine, schema, and API are untouched. Swapping back to EVM - or supporting both simultaneously - means restoring the removed lines. The same poll would accept votes from Base and Cardano wallets in the same results table with no code changes to the app layer.

## Get started

```bash
git clone https://github.com/effectstream/farcaster-app my-poll
cd my-poll
bun install

# Replace the four game files, then:
bun run dev
```

The orchestrator boots PGLite + the local chain + the node + the frontend in one command. For Cardano, apply the config diff above and `bun run dev` switches to YACI DevKit + Dolos automatically. Open `http://localhost:10599`, connect the ephemeral wallet, hit the faucet, and vote.

The `farcaster-canvas` template and this poll are both at https://github.com/effectstream/farcaster-app.

## Video walkthrough

https://youtu.be/dveSIwH_EFY
