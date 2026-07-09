# ZSwap-DA Frontend

React + Vite + Midnight-wallet frontend for the **ZSwap Offerfile Kernel**
backend (atomic token swaps on Midnight + Celestia DA). This is an *example*
frontend — it doubles as a reference for wiring a UI to that backend. The
backend — sync node, batcher, Compact contracts, database, validator — lives in
its own repo: **https://github.com/effectstream/zswap-offerfiles-kernel**.

## Running alongside the backend

1. **Clone the backend as a sibling of this monorepo.** This app resolves
   `@zswap-da/contract-offer-files` (the compiled Compact contract module) via a
   relative `file:` dependency, so the checkout directory **must** be named
   `zswap-offerfile-kernel` (singular — the GitHub repo is `zswap-offerfiles-kernel`,
   so clone it into the matching directory name):

   ```bash
   git clone git@github.com:effectstream/zswap-offerfiles-kernel.git zswap-offerfile-kernel
   ```

   ```
   Code/
   ├── effectstream/            # this monorepo
   └── zswap-offerfile-kernel/  # backend — github.com/effectstream/zswap-offerfiles-kernel
   ```

2. **Start the backend first** (it compiles the Compact contract, which this
   app imports, and serves the API on :9999 and the batcher on :3334):

   ```bash
   cd zswap-offerfile-kernel
   bun install
   bun run dev
   ```

3. **Start the frontend:**

   ```bash
   cd effectstream/templates/zswap-da
   bun install
   bun run dev   # vite on http://localhost:10600
   ```

## How it connects

- **API / batcher URLs** — `src/config.ts`; defaults to
  `http://<hostname>:9999` and `:3334`, overridable with `VITE_API_BASE` /
  `VITE_BATCHER_URL` (build time) or `window.API_BASE` / `window.BATCHER_URL`
  (set by the hosting page before the bundle loads).
- **Midnight config** (contract address, indexer, proof server) — fetched at
  runtime from `GET /api/midnight/config` on the backend.
- **ZK assets for in-browser proving** — fetched from the backend
  (`GET /keys/*`, `GET /zkir/*`), which serves the contract circuit keys and
  the zswap/dust primitive keys straight from disk. Nothing is staged into
  `public/` anymore.
- **Contract JS module** — `@zswap-da/contract-offer-files` is a build-time
  import; its compiled output (`src/managed/`) is generated when the backend
  dev stack runs `compact compile` on startup. If the import fails to resolve,
  start the backend once first.
- **Offer encoding** — MIP-0005 / MIP-0006 codecs are vendored under
  `src/lib/mip5-offer-files.ts` and `src/lib/mip6-p2p-swaps.ts` (HRP `swapoffer`),
  kept in sync with the backend packages of the same names.

## Env vars

| Var | Purpose |
|-----|---------|
| `VITE_API_BASE` | Backend API base URL (default `http://<hostname>:9999`). |
| `VITE_BATCHER_URL` | Batcher URL (default `http://<hostname>:3334`). |
| `VITE_BATCHER_TARGET` | Batcher target name (default `midnight-balancer`). |
| `VITE_MIDNIGHT_NETWORK_ID` | Midnight network id (default `undeployed`). |
