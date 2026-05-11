# Wallet Migration: Backend → Browser

## Why this doc exists

The zswap-da demo currently runs the Midnight wallet **on the backend node**
(`packages/node`). This is a temporary arrangement — the long-term target is a
browser-hosted wallet (Lace extension or equivalent), which is what a real
end-user dApp looks like.

We are not on the target architecture yet because **we are waiting on the Lace
team to fix a bug** that blocks using the browser extension for the flows this
demo exercises. Once that fix lands, this document is the checklist for the
cutover.

---

## Current state (backend wallet)

```
┌──────────────┐        ┌──────────────────────────────┐        ┌──────────┐
│   Browser    │        │         Node backend         │        │ Celestia │
│              │        │                              │        │   DA     │
│ SwapInterface│──POST──►/api/zswap/create             │        │          │
│              │        │   wallet.initSwap(...)       │        │          │
│              │◄──bytes│   return tx bytes (Base64)   │        │          │
│              │        │                              │        │          │
│ buildOffer() │        │                              │        │          │
│ serializeOff.│        │                              │        │          │
│              │──POST──►/api/zswap/submit             │        │          │
│              │        │   deserializeOffer+validate  │        │          │
│              │        │   submitToCelestia(payload) ─┼───────►│          │
│              │        │                              │        │          │
│              │──POST──►/api/zswap/:id/complete       │        │          │
│              │        │   decodeOffer(...)           │        │          │
│              │        │   balanceUnprovenTx          │        │          │
│              │        │   signUnprovenTx             │        │          │
│              │        │   finalize + submit to Midnt │        │          │
└──────────────┘        └──────────────────────────────┘        └──────────┘
```

Post-`mip-zswap-offer` migration, the frontend already owns offer-payload
assembly (`buildOffer` / `serializeOffer`). What it does **not** own is the
wallet. Every wallet operation — `initSwap`, `balanceUnprovenTransaction`,
`signUnprovenTransaction`, `finalizeTransaction`, `submitTransaction` — runs
server-side via `@midnight-ntwrk/wallet-sdk` with keys loaded from the node's
config.

Celestia submission **stays on the backend** (not affected by this migration).
The Celestia write key is an operator credential, not a user credential.

---

## Target state (browser wallet)

```
┌───────────────────────────────────────────────┐        ┌──────────┐
│                  Browser                      │        │ Celestia │
│                                               │        │    DA    │
│ SwapInterface                                 │        │          │
│   └─ window.midnight.mnLace.enable()          │        │          │
│   └─ wallet.initSwap(...)    ◄── browser      │        │          │
│   └─ buildOffer(bytes, ...)                   │        │          │
│   └─ serializeOffer(offer) ─── payload ──┐    │        │          │
│                                          ▼    │        │          │
│                           POST /api/zswap/submit ─────►│          │
│                                               │        │          │
│   (Complete / take flow)                      │        │          │
│   └─ fetch offer JSON from backend            │        │          │
│   └─ decodeOffer(offer.transaction)           │        │          │
│   └─ wallet.balanceUnprovenTransaction(...)   │        │          │
│   └─ wallet.signUnprovenTransaction(...)      │        │          │
│   └─ wallet.finalizeTransaction(...)          │        │          │
│   └─ wallet.submitTransaction(...)            │        │          │
└───────────────────────────────────────────────┘        └──────────┘
```

The backend's only remaining responsibility becomes:

- `POST /api/zswap/submit` — validate + forward to Celestia (unchanged)
- `GET  /api/zswaps`, `GET /api/zswaps/:id`, `GET /api/known-tokens` — read APIs
- `POST /api/token/mint-*` — optional; if the wallet is in the browser, these
  move client-side too

Endpoints that **go away**:

- `POST /api/zswap/create`  (wallet.initSwap moves to browser)
- `POST /api/zswap/:id/complete`  (balance/sign/finalize/submit moves to browser)
- `GET  /api/wallet/balance`  (ask the wallet directly)
- `GET  /api/wallets`  (the wallet extension enumerates accounts itself)

---

## Blocking issue

**Lace bug:** [link to the tracking issue / thread here once we have one]

**What it blocks:** [one-line description of the specific wallet API that
misbehaves — e.g. "initSwap returns a malformed offerRecipe when the wallet
holds both shielded and unshielded balances for the same token type"]

**Workaround:** running the wallet server-side side-steps the bug because we
use a different wallet code path than the browser extension.

Until that fix lands, the backend-wallet architecture is load-bearing and
should not be removed.

---

## Pre-cutover checklist (verify before migrating)

- [ ] Lace extension version X.Y.Z is published with the fix
- [ ] Smoke-test the fix against the exact flow this demo uses
      (mixed shielded/unshielded balances, TTL-gated swaps, taker completion)
- [ ] Confirm `@midnight-ntwrk/midnight-js-*` browser bundle is the version
      the extension expects — the SDK + extension are coupled
- [ ] Confirm `mip-zswap-offer` still works in the browser bundle
      (it already does — zero-dep peer deps are all ESM-friendly)
- [ ] Identify which Celestia key stays on the node and which (if any) moves
      to the browser. Default: **none moves**; backend remains the only
      writer to the DA layer.

---

## Migration plan (when unblocked)

Ordered so each step leaves the app in a shippable state.

### Step 1 — Wallet connection layer

Create `packages/frontend/src/services/wallet.ts` wrapping
`window.midnight.mnLace`. Expose:

```ts
connect(): Promise<WalletHandle>
initSwap(inputs, outputs, keys, opts): Promise<OfferRecipe>
balanceUnprovenTransaction(tx, keys, opts): Promise<BalancedRecipe>
signUnprovenTransaction(tx, sign): Promise<UnprovenTransaction>
finalizeTransaction(tx): Promise<ProvenTransaction>
submitTransaction(tx): Promise<string>   // txId
getShieldedBalance(): Promise<Record<string, bigint>>
getUnshieldedBalance(): Promise<Record<string, bigint>>
```

Keep the same shape as the backend wallet so call sites are swap-in.

### Step 2 — Replace `api.createSwapOffer`

`SwapInterface.tsx` calls `api.createSwapOffer` → backend. Replace with direct
`wallet.initSwap(...)` then pass `offerRecipe.transaction.serialize().toBytes()`
straight into `buildOffer({ transactionBytes, gives, wants, metadata })` — the
Base64 round-trip through HTTP goes away.

### Step 3 — Replace `api.completeOffer`

`ZSwapList.tsx` / `OfferDetailModal.tsx` calls `api.completeOffer(id)`. Rewrite
as: fetch offer JSON → `decodeOffer(offer.transaction)` →
`Transaction.deserialize` → `wallet.balanceUnprovenTransaction` →
`signUnprovenTransaction` → `finalizeTransaction` → `submitTransaction`.

All of this is pure client-side work; `mip-zswap-offer` already provides the
codec. The ledger package (`@midnight-ntwrk/ledger-v8`) runs in the browser
under its wasm bindings.

### Step 4 — Wallet balance / wallet list

Replace `api.getWalletBalance` and `/api/wallets` with the extension's native
account enumeration. `WalletBalances.tsx` reads directly from the wallet
handle.

### Step 5 — (Optional) move mint endpoints

`/api/token/mint-shielded` / `-unshielded` currently do `contract.callTx.*` on
the backend. If the browser wallet can sign those too, move them. Otherwise
leave them — minting is an admin-ish action, not a user action, and is fine to
keep server-side.

### Step 6 — Remove backend wallet code

After the browser flows work end-to-end:

- Delete `packages/node/midnight-api.ts` (or strip it to whatever the mint
  endpoints still need)
- Delete `POST /api/zswap/create` and `POST /api/zswap/:id/complete` handlers
  in `packages/node/api.ts`
- Delete `GET /api/wallet/balance` and `GET /api/wallets`
- Drop `@midnight-ntwrk/wallet-sdk-*` from `packages/node/package.json`
- Update E2E tests (the current suite drives the backend endpoints — it will
  need to drive the browser or stub a headless wallet)

### Step 7 — Docs and config

- Update `README.md` to describe the extension-required setup
- Remove wallet-profile fields from `packages/node/config.ts`
- Update `bun-zswap-da/AGENTS.md` if it describes the wallet

---

## What does **not** change

- `mip-zswap-offer` — the codec library is architecture-agnostic; it already
  runs in both environments
- `/api/zswap/submit` — Celestia submission stays on the backend
- Database schema — the state machine still indexes offers identically
- Offer JSON format on Celestia — still MIP-compliant bech32m payloads
- Taker-side validation — still happens at the frontend before prompting the
  user to sign; the only change is that `balance/sign/finalize/submit` move
  browser-side

---

## Risk notes

- **Key custody**: moving the wallet to the browser removes the backend as a
  custodian. The node can no longer "replay" a user's swap on their behalf.
  This is the intended end state but worth flagging in release notes.
- **State machine assumptions**: the STM indexes every blob it sees on
  Celestia regardless of whether a backend wallet produced it. No changes
  needed.
- **Multi-wallet testing**: the current E2E tests spin up multiple backend
  wallets to simulate maker/taker. The browser-wallet world needs a headless
  equivalent (Playwright + extension, or mock wallet handle). Plan for this
  before removing the backend wallet.
