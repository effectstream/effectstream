# ZSwap Offerfile Kernel (frontend)

> A React frontend for atomic token swaps on Midnight, where open offers live as Celestia data-availability blobs rather than in an on-chain order book.

ZSwap is a peer-to-peer DEX with no pool, no escrow and no on-chain order book. A maker builds a
Midnight transaction that is *deliberately unbalanced* — it spends what they are giving and pays out
what they want, but nobody has funded the second half — serializes it, and publishes it as a blob on
Celestia. A taker who likes the terms mirrors the missing side with their own wallet, merges the two
halves into a single transaction, proves it, and submits it. It settles atomically or not at all.

**This template directory contains the frontend only.** There is no `packages/` tree here: it is a
flat React 19 + Vite 7 single-page app. The sync node, batcher, Compact contracts, database and
validator it talks to live in a separate repository,
[`effectstream/zswap-offerfiles-kernel`](https://github.com/effectstream/zswap-offerfiles-kernel).
Read this template for how a Midnight dApp frontend is wired — wallet discovery, offer encoding,
in-browser proving, batcher submission — and read the backend repo for the state machine and the
primitive configuration.

## What this template shows

**Data availability used as an order book.** The thing posted to Celestia is not a summary of an
offer, it *is* the offer: a real, signed, partially-built Midnight transaction, bech32m-encoded under
MIP-0005 with the HRP `swapoffer`. `src/services/makerOffer.ts` builds it through the wallet's
`makeIntent`, deliberately without paying fees:

```
// makeIntent(payFees:false) → serialize → encodeOffer. The offer is
// intentionally imbalanced (gives ≠ wants); the taker's wallet balances + the
// batcher pays fees, so the maker commits no Dust.
```

Because the offer never touches Midnight while it is open, a maker can post ten offers and cancel
them all by doing nothing. The cost of listing is a Celestia blob, not a contract call. What the
chain sees is only the settlement.

**Taking is mirror-then-merge, not "accept".** `src/services/browserContract.ts` decodes the maker's
blob back into a `Transaction`, works out which segment carries the asset imbalance
(`pickSwapSegment`), and then has the taker's wallet construct the exact inverse — the maker's
`wants` become the taker's inputs, the maker's `gives` become the taker's outputs — before merging
and proving. The two code paths differ by token kind for a concrete wallet reason, documented in the
source: shielded-only offers have no Intent slots, so `balanceSealedTransaction` throws
"No segments found", and the code mirrors via `makeIntent` and merges segment-0 offers instead;
unshielded offers cannot take that path because Lace's unshielded `makeIntent` adds an empty
structural `Intent[1]` to both sides, which collides on merge.

That mirror-then-merge dance is a *Lace* workaround, not the shape of the protocol. The built-in JS
wallet uses the wallet facade's own swap API instead (`src/services/localTradeOffers.ts`):
`initSwap` for the maker, `balanceFinalizedTransaction` then `finalizeRecipe` for the taker — no
segment guessing, because nothing hardcodes a balancing slot. Comparing the two files is the
clearest illustration in this repo of what the dapp-connector costs you.

**Offer liveness: the hard part of an off-chain order book.** An order book living in a DA layer can
show you an offer whose coins were spent five minutes ago — nothing revokes a blob. So the backend
answers three questions about every offer before listing it and before letting it be taken:

| Question | Answered from |
| --- | --- |
| *Has this coin already been spent?* | Shielded coin **nullifiers** (`PrimitiveTypeMidnightNullifierAndCommitment`) and unshielded **UTXO spends** (`PrimitiveTypeMidnightUnshieldedSpend`) |
| *Does the UTXO the offer spends actually exist?* | Coin **commitments** (the same nullifier/commitment primitive) and unshielded **UTXO creations** (`PrimitiveTypeMidnightUnshieldedCreate`) |
| *Is the Merkle root the offer proved against real, and recent?* | The zswap coin-commitment tree **root** as it advances (`PrimitiveTypeMidnightZswapRoot`) |

Those four primitives ship in `@effectstream/sm/builtin` and are configured in the backend node, not
in this directory — this template contains no `ConfigBuilder` and no primitive declarations at all.
Two of the three answers surface directly in the frontend, which is the part worth studying here.

*Root freshness* shows up as a retryable submission error. `src/services/api.ts` treats
`ROOT_UNKNOWN` as transient rather than fatal:

```
// ROOT_UNKNOWN is transient: the maker proves against a real chain root, but
// the sync node may not have ingested it into `known_roots` yet. Re-submitting
// the same blob succeeds once the root lands (mirrors the e2e suites). Other
// errors throw immediately.
```

That is root-liveness seen from the client: the node refuses an offer whose Merkle root it has not
yet observed, and the frontend retries up to 24 times at 4-second intervals rather than showing a
failure. When the retries run out the user is told their wallet is ahead of the chain, not that the
offer was invalid.

*Spend detection* arrives as a push. The node's SSE stream (`src/hooks/useEventStream.ts`) delivers
`offer_consumed` events, and `src/types/index.ts` declares the payload carrying a `nullifier` — the
same nullifier the primitive observed on-chain. `src/state/myTrades.ts` consumes these to move an
offer out of the book, and names the gap the DA model creates:

```
// not_public: submitted to Celestia but not yet visible in the live order book
```

**Balance guards as a correctness requirement, not a nicety.** `src/services/takerBalance.ts` exists
because of a specific failure mode: when the wallet does not hold a coin the transaction needs,
Lace's `makeIntent` hangs indefinitely instead of erroring. So both `createOffer` and `takeOffer` in
`src/state/useZSwapApp.ts` re-read *fresh* balances — `readState(connected)`, not the cached React
state — and refuse before touching the wallet. The comparison is exact-integer with no decimal
scaling, because offer amounts are raw `bigint`s and wallet balances are raw integer strings keyed by
token color.

## Effectstream features used

| Feature | Where | Used for |
| --- | --- | --- |
| MIP-0005 offer codec (`OfferFiles`, `@effectstream/mip-zswap-offer/mip5`) | `src/services/makerOffer.ts` | Encoding the maker's transaction as a `swapoffer1…` blob |
| MIP-0005 decode | `src/services/offerParse.ts`, `src/services/offerSender.ts` | Reconstructing a `Transaction` from an offer blob |
| MIP-0006 leg derivation (`P2pAtomicSwaps.deriveTokenLegs`) | `src/decodeOffer.ts` | Turning a raw offer transaction into tagged gives/wants legs |
| `@effectstream/wallets` (`walletLogin`, `allInjectedWallets`) | `src/state/wallet.ts` | Discovering and connecting injected Midnight wallets |
| `@effectstream/wallets/midnight-local` (`MidnightLocalConnector`) | `src/state/wallet.ts` | The built-in JS wallet, in facade mode, on undeployed networks |
| Batcher HTTP API (`POST /send-input`) | `src/services/api.ts` | Submitting the settled Midnight transaction at `wait-receipt` |
| Node event stream (SSE) | `src/hooks/useEventStream.ts` | Live `offer_indexed` / `offer_consumed` / `offer_expired` / `token_minted` |
| Node custom API routes | `src/services/api.ts` | Order book, quotes, pairs, known tokens, Midnight config |
| Midnight ledger primitives (declared in the backend repo) | Observed in `src/services/api.ts` and `src/hooks/useEventStream.ts` | Offer liveness: root freshness (`ROOT_UNKNOWN`) and nullifier-driven `offer_consumed` |

## Quick start

Prerequisites:

- **Bun** and the [Compact toolchain](https://docs.midnight.network/develop/tutorial/building/).
  The app compiles its own contract from `src/contract/offer-files.compact` — `predev`/`prebuild`
  run `bun run build:contract`, which compiles and then verifies all 16 outputs against a committed
  sha256 manifest, so a wrong compiler version can't silently produce bindings that mismatch the
  deployed contract. See `src/contract/README.md`.
- **A wallet.** Either works, for everything: the injected browser wallet (Lace) via the
  dapp-connector, or the **built-in JS wallet** via the Midnight wallet facade — no extension
  needed. `src/services/contractWallet.ts` and `src/services/localTradeOffers.ts` are the two
  adapters that make minting and offers wallet-agnostic.
- **The backend, running.** It is needed at *runtime* — Midnight config, ZK artifacts, the batcher —
  but no longer to install or build, and it can live anywhere:

```sh
git clone git@github.com:effectstream/zswap-offerfiles-kernel.git
cd zswap-offerfiles-kernel
bun install
bun run dev
```

Then the frontend:

```sh
cd effectstream/templates/zswap-da
bun install
bun run dev
```

| Service | URL |
| --- | --- |
| ZSwap frontend (Vite) | http://localhost:10600 |
| Backend API (default in `src/config.ts`) | `http://<hostname>:9999` |
| Batcher (default in `src/config.ts`) | `http://<hostname>:3334` |
| Midnight contract, indexer and proof server | Fetched at runtime from `GET /v1/midnight/config` |

`src/state/wallet.ts` carries fallback URLs used only by the local JS wallet when that config call
fails — indexer `http://<hostname>:8088/api/v3/graphql`, node `http://<hostname>:9944`, proof server
`http://<hostname>:6300`. They are a last resort, not the source of truth.

Developing against monorepo source rather than published `@effectstream/*`? Run `./link.sh`. It also
enforces a single-instance rule for the `@midnight-ntwrk/*` (wasm classes) and `@midnightntwrk/*`
(wallet-sdk) families: both carry module-scoped identity, so a second copy of either breaks
`instanceof` and Symbol-brand checks at runtime with errors that name neither cause.

## Project structure

There is no `packages/` directory. The template is a flat Vite app:

```
index.html              Vite entry point
vite.config.ts          React + wasm + node-stdlib polyfills, crypto shim, ZK-artifact 404 guard
public/                 Static assets served at the site root
src/
  App.tsx               Shell: Order book / How it works / Faucet, plus the bottom console dock
  main.tsx              React root
  config.ts             API base, batcher URL and batcher target resolution
  constants.ts          Filter directions, token kinds, page size, validation limits
  decodeOffer.ts        MIP-0005 decode + MIP-0006 leg derivation, for display
  debug.ts              dlog / timed instrumentation used throughout the services
  utils.ts              Token-name lookup and formatting helpers
  hooks/                Wallet, contract, order book, SSE events, tokens, mint reconciliation
  screens/              Market, Swap, MyTrades, Faucet, HowItWorks
  services/             api, browserContract, makerOffer, offerParse, offerSender,
                        takerBalance (+ its test), mintQueue
  shims/                crypto polyfill and loose .d.ts files for @effectstream/wallets
  state/                useZSwapApp orchestration, wallet + tradeWallet adapters,
                        local myOffers / myTrades stores, amount (coins ⇄ base
                        units) and swapAmounts, formatting
  styles/               Design tokens and global CSS
  types/                Shared types and the window.midnight declaration
  ui/                   Modals, toasts, wallet and network menus, console dock, icons
```

## How it works

### Configuration resolution

`src/config.ts` resolves the backend endpoints in a fixed order — `window.API_BASE` set by a hosting
page, then the `VITE_API_BASE` build-time variable, then `http://<hostname>:9999`. The same three
tiers apply to the batcher. That ordering is what lets one built bundle be dropped behind a proxy
without a rebuild.

Everything Midnight-specific — contract address, indexer URI, indexer WS URI, proof server URI and
network id — is fetched at runtime from `GET /v1/midnight/config`, so the frontend hardcodes no
deployment. `src/hooks/useContract.ts` additionally refuses to proceed when the connected wallet's
`networkId` differs from the one the backend reports.

### Making an offer

`createOffer` in `src/state/useZSwapApp.ts`:

1. Re-read fresh balances and run `shortfallsFromLegs` over the `gives` legs, throwing a readable
   message rather than letting the wallet hang.
2. `buildMakerOfferBlob` (`src/services/makerOffer.ts`) collects the wallet's shielded and unshielded
   addresses, maps `gives` to inputs and `wants` to outputs routed back to the maker, and calls
   `makeIntent`. The intent id is drawn at random from `≥ 2`, because segment 0 is the guaranteed
   offer and Lace's `balanceSealedTransaction` lands its balancing intent at segment 1.
3. The serialized transaction is encoded with `OfferFiles` into a `swapoffer1…` string.
4. `api.submitSwapOfferRetrying(blob)` POSTs it to `/v1/offers`, retrying on `ROOT_UNKNOWN`
   while the status line reads "Waiting for chain to sync root…".
5. The blob is recorded locally (`addMyOffer`) so the maker's own offer is filtered out of the book,
   and a trade row is appended with status `not_public` until the order book confirms it.

### Taking an offer

`takeOffer` runs the same fresh-balance guard against the offer's `pays` legs (`takerShortfalls`),
then calls `tradeWallet.settleOffer` → `proveAndSubmitOffer`. That decodes the blob, picks the
imbalanced segment, mirrors the taker side, merges, proves in the browser against the proof server,
and hands the serialized transaction to the batcher:

```ts
body: JSON.stringify({
  data: {
    address,
    addressType: MIDNIGHT_ADDRESS_TYPE,
    input: JSON.stringify({ tx: serializedTxHex, txStage }),
    timestamp: new Date().toISOString(),
    target: BATCHER_TARGET,
  },
  confirmationLevel: 'wait-receipt',
  timeoutMs: 600_000,
}),
```

The 600-second timeout is deliberate and commented in place: Dust balancing plus chain inclusion can
take three to five minutes on preview, and the batcher's 300-second default is too tight.
`BATCHER_TARGET` defaults to `midnight-balancer` — the backend batcher adapter that pays the fees the
maker did not.

Multi-segment offers are rejected outright: `pickSwapSegment` throws when more than one segment
carries a non-zero shielded or unshielded imbalance.

### Identifying who made an offer

`src/services/offerSender.ts` recovers the maker's identity from the offer transaction alone, so the
UI can label offers "yours" versus "theirs" — but only for unshielded legs. Its opening comment
states the limit plainly: shielded-only offers stay anonymous by construction, because coin
commitments hide the recipient's coin public key and only the holding wallet can decrypt the
ciphertext. For those the function returns `undefined` and the caller falls back to a neutral label.

### Amounts: whole coins on screen, base units everywhere else

Every amount the chain, the wallet and the node API carry is an **integer of base units**. A token's
`decimals` — served by `GET /v1/known-tokens` and carried on `KnownToken` — says how many base units
make one whole coin: `1 coin = 10^decimals base units`. The UI reads and writes **whole coins**; the
conversion lives in one place, `src/state/amount.ts`, and nothing below the screens ever sees a coin.

- `parseWholeCoins('1.5', 6) === 1500000n` — string/bigint maths only. `Number(x) * 1e6` is banned:
  the product is inexact for most inputs (`0.07 * 1e6 === 70000.00000000001`) and above 2^53 a double
  rounds silently, which would post an offer for an amount nobody typed.
- Over-precise input is **refused with a message naming the token's precision**, never rounded — the
  amount is what settles on chain.
- Rates the node publishes (`implied_rate`, `market_rate`, `/v1/chart` prices) are base-unit ratios;
  `scaleRate(rate, dFrom, dTo)` turns them into the "1 WBTC = X WETH" a screen prints. That is the
  identity while every token is 6 decimals, and correct the day one is not.
- A token with no `decimals` — an older node, or a wallet-held colour in no registry — is read at
  `DEFAULT_DECIMALS` (6), because every token this stack mints has 6.

`src/state/swapAmounts.ts` is the Swap screen's half of that boundary (per-leg parsing, the
auto-price suggestion, the affordability gate, the displayed rate), extracted so it is unit-tested
without a DOM.

### Minting test tokens

The Faucet screen (`src/screens/Faucet.tsx`) calls the `mint_shielded` and `mint_unshielded` circuits
on the deployed OfferFiles contract through `src/services/browserContract.ts`, which assembles the
standard midnight-js provider stack — `indexerPublicDataProvider`, `httpClientProofProvider`,
`FetchZkConfigProvider`, `levelPrivateStateProvider` — and resolves the contract with
`findDeployedContract`. The allotment is **1,000 whole coins**, so the circuit is called with
`1_000_000_000` base units. Newly minted token names are held in `src/services/mintQueue.ts` and
registered against their derived color once the mint lands, via `POST /v1/known-tokens` — carrying
`decimals: 6` explicitly, so a node whose column still defaults to 0 does not record the token at a
precision that would render every balance a million times too large.

### Browser build workarounds

`vite.config.ts` is worth reading before starting your own Midnight frontend; every entry in it fixes
a real breakage and is annotated in place:

- `crypto` and `node:crypto` are aliased to `src/shims/crypto.ts`, because `crypto-browserify` is
  missing `timingSafeEqual`, which the midnight-js private-state provider's storage encryption needs.
  The alias is repeated as an esbuild plugin under `optimizeDeps`, because Vite's pre-bundling does
  **not** honour `resolve.alias`.
- A `zk-artifact-404` plugin forces a real 404 on `/keys/*` and `/zkir/*` when the file is not present
  in `public/`. Vite's SPA fallback would otherwise return `index.html`, which the proof server
  cannot parse and rejects with a 400. In normal operation the ZK artifacts are served by the backend
  (`GET /keys/*`, `GET /zkir/*`) rather than staged into `public/` — this guard exists so a missing
  artifact fails loudly instead of silently.
- `Deno` and `Bun` are defined as `undefined` for transitive dependencies that probe for Node globals,
  and `@midnight-ntwrk/onchain-runtime` is excluded from dependency optimization.

## Configuration

All build-time variables are optional; each has a working default.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE` | `http://<hostname>:9999` | Backend API base URL |
| `VITE_BATCHER_URL` | `http://<hostname>:3334` | Batcher base URL |
| `VITE_BATCHER_TARGET` | `midnight-balancer` | Batcher adapter the settled transaction is routed to |
| `VITE_MIDNIGHT_NETWORK_ID` | `undeployed` | Midnight network id used for address formatting and offer parsing |

At runtime a hosting page may set `window.API_BASE` and `window.BATCHER_URL` before the bundle loads;
both take precedence over the build-time values. The network is not user-selectable — the
`NetworkMenu` displays what the build was configured with.

## Testing

The template's unit suites run with Bun's test runner:

```sh
bun test
```

They cover the pure logic that must not be wrong, all of it deliberately separated from React, a
wallet and a chain so it can be tested without any of them:

- `src/state/amount.test.ts` — the coin ⇄ base-unit conversion: the `1.5 → 1500000n` round trip,
  over-precision refused rather than rounded, values past 2^53 staying exact, and the `2^64 − 1`
  ledger ceiling.
- `src/state/swapAmounts.test.ts` — the Swap screen's boundary: per-leg parsing at each token's own
  precision, the node's auto-price suggestion landing in the field as coins, and the affordability
  gate comparing base units in bigint.
- `src/services/takerBalance.test.ts` — the shortfall calculator: sufficient and exact balances
  producing no shortfall, a missing token counting as zero, shielded and unshielded legs reading from
  their own balance maps, multi-leg offers reporting only the uncovered leg, and a pin that balances
  handed to it are base-unit strings.
- `src/services/takeSelection.test.ts`, `src/state/reference.test.ts`, `src/state/myTrades.test.ts`
  and the rest — selection totals, reference-price strings, the local trade log and offer parsing.

> [!NOTE]
> This template is **excluded from the repository's template test runner**. The reason is recorded
> in `templates/run-template-tests.ts`, where its entry in the `ENABLED` list is commented out. It
> installs and builds standalone now, but a meaningful test still needs the backend live on :9999
> for Midnight config, ZK artifacts and the batcher — which CI can't stand up. A typecheck-only
> smoke test is the realistic way back in.

## Where to go next

- [Midnight integration](https://effectstream.io/home/chains/midnight) — the four zswap ledger
  primitives behind the offer-liveness checks, with their exact payload shapes
- [Celestia integration](https://effectstream.io/home/chains/celestia) —
  `PrimitiveTypeCelestiaGeneric`, the `CelestiaAdapter` that writes blobs, and `launchCelestia`
- [Primitives](https://effectstream.io/home/components/primitives) — how a primitive turns chain
  activity into state-machine inputs
- [Batcher overview](https://effectstream.io/home/components/batcher/overview) — adapters, targets
  and the confirmation levels this frontend asks for
- [`evm-midnight` template](https://effectstream.io/home/templates/evm-midnight) — a self-contained
  Midnight template with node, contracts and frontend in one workspace
