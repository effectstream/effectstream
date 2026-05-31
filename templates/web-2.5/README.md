# web-2.5

An Effectstream template demonstrating the **web2.5 (gasless / batched) submission
path**: an off-chain game server submits user inputs to a batcher, which pays gas
and rolls them on-chain, so end users never sign a chain transaction.

Ported from the paima-engine-v1 `web-2.5` game to the current `@effectstream/*`
0.100.18 flat layout.

## What it does

Two actions, ported from the original PaimaParser grammar:

| Action | Grammar | Submission path | Effect |
|---|---|---|---|
| `changedName` | `["changedName", name]` (1–50 chars) | direct (user pays gas) | sets `users.name` for the signer |
| `gainedExperience` | `["gainedExperience", xp]` (1–999) | batched (batcher pays gas — the web2.5 path) | credits `experience += xp * 10` to the signer |

`gainedExperience` is the showcase: the off-chain server (or the frontend's
"batched" button) signs the input and POSTs it to the batcher's `/send-input`.
See `packages/batcher/post-batcher.ts` for the standalone server-side port of v1's
`post-batcher.mjs`.

## Layout

```
packages/
  contracts-evm/   EffectstreamL2 contract (Hardhat/Foundry), base L2 (no custom Solidity)
  database/        single `users` table (pgtyped queries)
  node/            grammar + config + state machine + GET API + sync entrypoint
  batcher/         EffectstreamL2 batcher (namespace "web-2.5") + post-batcher.ts
  frontend/        vanilla-JS dual-wallet shim (EvmInjected + EvmViem), esbuild + Fastify
  tests/           Phase A (infra), B (STM/DB/API + batched path), C (frontend e2e)
start.dev.ts       orchestrator config (pglite + EVM + sync + batcher + frontend)
```

## Run it

```bash
bun install
bun run build:evm        # compile + deploy EffectstreamL2 to local Hardhat
bun run build:pgtypes    # regenerate pgtyped query bindings
bun run dev              # boot the full local stack
```

Then open http://localhost:10599. Connect the local-dev wallet, set a name
(direct), and gain XP (batched).

Submit a gasless XP gain from the command line (the server-side web2.5 path):

```bash
bun run packages/batcher/post-batcher.ts 10
```

## Test

```bash
bun run test
```

Phase B asserts: `changedName` → DB, `gainedExperience` (direct) → DB, and a
batched submission through the batcher → on-chain → DB. Phase C drives the
local-JS (EvmViem) wallet through a headless Chromium for the full batched flow.

## Sharp edge: namespace must match

`BatcherConfig.namespace` (`packages/batcher/batcher.dev.ts`), the frontend
`EffectstreamConfig` securityNamespace (`packages/frontend/index.js`), and the
node `setSecurityNamespace(...)` (`packages/node/config.dev.ts`) are ALL
`"web-2.5"`. A mismatch yields `401 Invalid signature` from `/send-input`, or the
node silently drops the batched input on re-verification.

## Production

This template ships dev-only config. For mainnet, source the batcher gas-payer
key from a secret store, point the config at real RPC URLs, and set the deployed
EffectstreamL2 contract address in `packages/frontend/index.js` + `config`.
