# ZSwap-DA Frontend

React + Vite + Midnight-wallet frontend for the **ZSwap Offerfile Kernel**
backend (atomic token swaps on Midnight + Celestia DA). This is an *example*
frontend — it doubles as a reference for wiring a UI to that backend. The
backend — sync node, batcher, Compact contracts, database, validator — lives in
its own repo: **https://github.com/effectstream/zswap-offerfiles-kernel**.

## Running alongside the backend

This app builds standalone — it compiles its own Compact contract from
`src/contract/offer-files.compact` (see the README there), so it needs the
[Compact toolchain](https://docs.midnight.network/develop/tutorial/building/)
on your PATH. A running backend is required at *runtime*: it serves the
Midnight config, the ZK assets, and the batcher.

1. **Clone and start the backend** (anywhere — no particular directory name or
   location is required). It serves the API on :9999 and the batcher on :3334:

   ```bash
   git clone git@github.com:effectstream/zswap-offerfiles-kernel.git
   cd zswap-offerfiles-kernel
   bun install
   bun run dev
   ```

2. **Start the frontend:**

   ```bash
   cd effectstream/templates/zswap-da
   bun install
   bun run dev   # vite on http://localhost:10600
   ```

   Point it elsewhere with `VITE_API_BASE` / `VITE_BATCHER_URL` if the backend
   isn't on the same host.

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
- **Contract JS module** — compiled locally from
  `src/contract/offer-files.compact` into gitignored `src/contract/managed/`,
  and checked against a sha256 manifest so a wrong compiler version or an
  edited source can't silently produce bindings that mismatch the deployed
  contract. See `src/contract/README.md`.
- **Offer encoding** — MIP-0005 / MIP-0006 codecs come from
  `@effectstream/mip-zswap-offer` (HRP `swapoffer`).

## Env vars

| Var | Purpose |
|-----|---------|
| `VITE_API_BASE` | Backend API base URL (default `http://<hostname>:9999`). |
| `VITE_BATCHER_URL` | Batcher URL (default `http://<hostname>:3334`). |
| `VITE_BATCHER_TARGET` | Batcher target name (default `midnight-balancer`). |
| `VITE_MIDNIGHT_NETWORK_ID` | Midnight network id (default `undeployed`). |
