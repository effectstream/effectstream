# GameMaker - Effectstream Template

A minimal single-action Effectstream app, ported from the paima-engine-v1
`gamemaker` game template. It demonstrates the smallest meaningful game loop:
a user submits a `gainedExperience` action on-chain (via the base
EffectstreamL2 contract on EVM) and the sync node accumulates their experience
points in a database table, served back over a read-only HTTP API.

The distinguishing feature of this template is its rich game client: a
**GameMaker Studio 2** project (see `gamemaker-client/`). The same backend is
shared verbatim with `templates/generic` (which shipped a Unity client instead).

EVM-only. No custom Solidity (uses the base `EffectstreamL2` contract), no
custom primitives, no batcher.

## Quick Start

```sh
bun install
bun run build:evm        # compile + locally deploy MyEffectstreamL2, generate mod.ts
bun run build:pgtypes    # generate packages/database/sql/*.queries.ts
bun run dev              # orchestrator: PGLite + Hardhat + sync node + frontend
```

Then open the web frontend at http://localhost:10599 and the API at
http://localhost:9999.

### Using a test account

For local dev, import Hardhat account #0 into MetaMask (browser wallet) or use
the built-in local-JS wallet button:

```
0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

Connect MetaMask to **Localhost 8545** (Chain ID 31337).

> Never use this private key on a real network — it is publicly known and only
> safe for local development.

## The game

A single action, ported verbatim from the v1 game:

- **`gainedExperience`** — `["gainedExperience", experience]` where `experience`
  is an integer 1–5. The STM credits the signer's wallet with
  `experience * 10` XP (the v1 `calculateProgress` rule), accumulating across
  calls. The signer's wallet address is taken from the connected wallet (it was
  the v1 `*address` grammar field).

## Project structure

```
gamemaker/
├── package.json                 # workspaces, scripts, effectstream.default
├── start.dev.ts                 # orchestrator config (PGLite + EVM + sync + frontend)
├── link.sh                      # monorepo dev: symlink local @effectstream/* sources
│
├── packages/
│   ├── contracts-evm/           # base EffectstreamL2 (MyEffectstreamL2.sol) — no custom logic
│   ├── database/                # users table + pgtyped queries (getUser, upsertUser)
│   ├── node/                    # grammar.ts, config.dev.ts, state-machine.ts, api.ts, main.dev.ts
│   ├── frontend/                # vanilla-JS Fastify web client (dual wallet + gain-experience CTA)
│   └── tests/                   # Phase A (infra) / B (STM+DB+API) / C (frontend e2e)
│
└── gamemaker-client/            # the ORIGINAL GameMaker Studio 2 game client (see below)
```

## Frontend

`packages/frontend/` is a small vanilla-JS web client served by Fastify. It
exposes both wallet modes per the Effectstream convention:

- **Connect Browser Wallet** (`WalletMode.EvmInjected`) — MetaMask / Brave for
  real users.
- **Connect Local Wallet (dev)** (`WalletMode.EvmViem`) — a pure-JS wallet
  built from a hardcoded Hardhat key + RPC URL, for development and headless
  e2e tests (no browser extension required).

It then lets you submit `gainedExperience` and reads your accumulated XP back
from `GET /user_state`. This is what `bun run dev` serves and what the Phase C
tests exercise.

## The GameMaker client (`gamemaker-client/`)

The original paima-engine-v1 `gamemaker` template shipped a **GameMaker Studio 2**
game client, not a web app. That project is preserved verbatim under
`gamemaker-client/` (`example-game.yyp`, `objects/`, `rooms/`, `sprites/`,
`options/`, `extensions/`). It is the rich game client and is built / run
**separately** via GameMaker's HTML5 export — this template's `bun run dev`
does **not** build or serve it.

To build it you need a GameMaker Studio 2 account/license and runtime installed.
The bundled `gamemaker-client/build.sh` invokes the GameMaker `Igor` CLI to
produce an HTML5 export into `gamemaker-client/gm_cli_build/`, which can then be
served as static files (e.g. `python3 -m http.server -d gamemaker-client/gm_cli_build/ 51264`).
See `gamemaker-client/README.md` for the original build/deploy notes.

In v1 the GameMaker build talked to the node through a bundled JS middleware
(the `PaimaMW` GameMaker extension under `gamemaker-client/extensions/PaimaMW/`,
fed by a packed `middleware/` bundle). In the Effectstream v2 model that
middleware is gone: the GameMaker client should talk to the node via the same
surface the web frontend uses — `@effectstream/wallets`
(`sendTransaction` for the `gainedExperience` action) for writes, and the
read-only HTTP API (`GET /user_state?wallet=…`) for reads. The preserved
`PaimaMW` extension is left as-is for reference; wiring a v2-compatible bridge
into it is left as an exercise.

## API

The sync node serves a read-only HTTP API on **port 9999**:

- `GET /user_state?wallet=<address>` — the wallet's accumulated experience.
  Returns `{ wallet, experience }`, with `experience: 0` for unknown wallets.

Plus the engine built-ins (`/health`, `/grammar`, `/block-heights`,
`/documentation`, …).

```sh
curl "http://localhost:9999/user_state?wallet=0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"
```

## Tests

```sh
bun run test
```

Runs the orchestrator + three phases:

- **Phase A** — EVM chain up on 8545, EffectstreamL2 deployed, sync node healthy.
- **Phase B** — submit `gainedExperience` on-chain → row appears in `users` →
  `GET /user_state` reflects the accumulated XP.
- **Phase C** — frontend builds + renders (dual wallet buttons + XP panel), and
  a headless-Chromium e2e drives the local-JS (`EvmViem`) wallet through
  connect → `gainExperience` → XP reflected by the API.

The Phase C browser tests skip automatically if no Chrome/Chromium is found
(set `CHROME_PATH` to force a specific binary).

## Mainnet

`packages/node/config.mainnet.ts` + `main.mainnet.ts` are production
placeholders — they read RPC URL, start block, and contract address from
environment variables. Review the disclaimer at the top of each file and fill in
real values before deploying with `bun run start:mainnet`.

## Orchestrator CLI

`bun run dev` wraps the orchestrator. Other useful commands (run with
`--background` first to use status/logs/restart):

```sh
bunx orchestrator start --background
bunx orchestrator status
bunx orchestrator logs sync
bunx orchestrator stop          # free all ports
```

Always run `stop` before relaunching so previous ports are freed.
