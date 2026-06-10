# ZSwap-DA: Atomic Token Swaps on Midnight + Celestia DA

A decentralized token swap platform that combines **Midnight Network** (privacy-preserving ZK contracts) with **Celestia** (data availability layer). Users create atomic swap offers that are published to Celestia, indexed by the sync node, and completed on Midnight.

## Quick Start

```bash
bun install
bun run dev   # PGLite + Compact compile + Midnight + Celestia + sync + batcher + frontend
```

- Frontend: http://localhost:10599
- API: http://localhost:9999
- Batcher: http://localhost:3334
- Orchestrator API: http://localhost:4747

## Environments

| Layer | Dev (`bun run dev`) | Mainnet (`bun run start:mainnet`) |
|-------|---------------------|------------------------------------|
| DA | Local Celestia devnet (`packages/contracts-celestia`) | Celestia mainnet beta via local light node |
| Privacy chain | Local Midnight devnet (`packages/contracts-midnight`) | Midnight (the `@effectstream/midnight-contracts` resolved networkId) |
| Database | PGLite (in-memory) | PGLite (in-memory) |
| Node entry | `packages/node/main.dev.ts` | `packages/node/main.mainnet.ts` |
| Batcher entry | `packages/batcher/batcher.dev.ts` | `packages/batcher/batcher.mainnet.ts` |
| Orchestrator | `start.dev.ts` | `start.mainnet.ts` |

## Mainnet environment

Mainnet uses a locally-running Celestia light node — start it yourself before launching the template:

```bash
celestia light init --p2p.network celestia
celestia light start --core.ip <consensus-rpc> --core.port 9090 --core.tls --p2p.network celestia
celestia light auth admin --p2p.network celestia   # paste into CELESTIA_AUTH_TOKEN
```

Fund the `celestia1...` address shown by `celestia state account-address` with TIA before submitting blobs.

| Env var | Required | Purpose |
|---------|----------|---------|
| `CELESTIA_NETWORK` | yes | Must be `mainnet`. |
| `CELESTIA_RPC_URL` | yes | Light node JSON-RPC, default `http://127.0.0.1:26658`. |
| `CELESTIA_AUTH_TOKEN` | yes | Admin JWT from `celestia light auth admin`. |
| `CELESTIA_NAMESPACE` | recommended | 10-byte hex (padded to 28). Default `000000000000deadbeef`. |
| `CELESTIA_START_HEIGHT` | optional | Pin Celestia sync start. Defaults to current chain head. |
| `CELESTIA_GAS_PRICE`, `CELESTIA_MAX_GAS_PRICE`, `CELESTIA_TX_PRIORITY`, `CELESTIA_GAS` | optional | Tx-config knobs that skip on-chain estimator calls (avoid rate-limit 429s). |
| `CELESTIA_POLLING_INTERVAL_MS` | optional | Sync cadence. Defaults: devnet 6 000 ms, mainnet 30 000 ms. |
| `MIDNIGHT_START_BLOCK` | yes | Numeric block height to start Midnight sync from. |
| `NTP_START_TIME` | optional | NTP reference timestamp; resumed from DB when unset. |

A complete dev → mainnet env template lives at `.env.mainnet.example`.

## Testing

```bash
bun run test
```

Runs Phase A (infrastructure assertions: Celestia consensus/bridge, Midnight node/indexer) and Phase B (state-machine + DB + API). **Phase B is currently stubbed** — the original SDK-flow and API tests assumed a backend-wallet completion path that has since been removed, and need to be rewritten on top of the browser/batcher flow. See the TODO comments in `packages/tests/stm/*.test.ts` and the original implementation in git history (`templates/zswap-da/e2e/run-tests.ts` before the migration).

## Project Structure

```
zswap-da/
├── start.dev.ts                              # Local orchestrator config
├── start.mainnet.ts                          # Mainnet orchestrator (+ light-node pre-flight)
├── packages/
│   ├── node/                                 # @zswap-da/node
│   ├── database/                             # @zswap-da/database
│   ├── validator/                            # @zswap-da/validator (shared offer validation)
│   ├── batcher/                              # @zswap-da/batcher
│   ├── contracts-midnight/                   # @zswap-da/contracts-midnight (+ contract-offer-files subworkspace)
│   ├── contracts-celestia/                   # @zswap-da/contracts-celestia (bridge + fund scripts)
│   ├── frontend/                             # @zswap-da/frontend (React + Vite + Midnight wallet)
│   └── tests/                                # @zswap-da/tests
```

## Key files

| Package | Files |
|---------|-------|
| `node/` | `main.{dev,mainnet}.ts`, `config.{dev,mainnet}.ts`, `env.ts` (env-derived constants), `grammar.ts`, `state-machine.ts`, `api.ts`, `zswap-logic.ts`, `batcher-client.ts`, `event-bus.ts` |
| `database/` | `mod.ts` (re-exports), `migration-order.ts`, `migrations/000-init.sql`, `migrations/001-spent-sets.sql` (permanent `spent_nullifiers` / `spent_unshielded` liveness sets), `sql/queries.sql` (+ generated `queries.queries.ts`) |
| `validator/` | `validate.ts` (pipeline), `derive.ts`, `refstate.ts`, `types.ts`, `README.md`, `scripts/check-preview-indexer.ts` |
| `batcher/` | `batcher.{dev,mainnet}.ts`, `config.ts`, `midnight-balancing.ts`, `celestia.ts` (`ZswapCelestiaAdapter.validateInput` — pre-fee offer gate) |
| `contracts-midnight/` | `package.json` (scripts for `launchMidnight`), `deploy.ts`, `contract-offer-files/` (Compact source + compiled output) |
| `contracts-celestia/` | `package.json` (`celestia-{node,bridge,fund}:*` scripts), `fund-bridge.ts` |
| `tests/` | `run-tests.ts`, `start.test.ts` (test orchestrator), `helpers.ts`, `infra/{celestia,midnight}-ready.test.ts`, `stm/{zswap-flow,api}.test.ts` |

## Services & ports

| Service | Port |
|---------|------|
| Frontend | 10599 |
| Backend API | 9999 |
| Batcher | 3334 |
| Orchestrator | 4747 |
| PGLite | 5432 |
| Celestia consensus | 26657 |
| Celestia bridge RPC | 26658 |
| Midnight node | 9944 |
| Midnight indexer | 8088 |
| Midnight proof server | 6300 |

## Grammar / state-machine inputs

| Key | Source | Purpose |
|-----|--------|---------|
| `celestia-zswap` | Celestia DA primitive | Validate a published offer blob (structure + ZK proofs + spent-set liveness), then index it (gives/wants, nullifiers, unshielded spends; schedule TTL cleanup) or drop + emit `offer_rejected`. |
| `midnight-zswap` | Midnight ledger primitive | Snapshot contract state. |
| `midnight-nullifier` | Midnight nullifier primitive | Record the nullifier in `spent_nullifiers` (liveness) and archive any offer whose shielded nullifier is consumed on chain. |
| `midnight-unshielded-spend` | Midnight unshielded-spend primitive | Record the UTXO in `spent_unshielded` (liveness) and archive any offer whose unshielded UTXO is spent. |
| `zswap-ttl-cleanup` | Scheduled timestamp data | Archive offers whose TTL elapsed without on-chain consumption. |

## API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/zswaps?limit&offset&token&direction` | Active swap offers + their gives/wants. |
| `GET` | `/api/known-tokens` | Token color → name registry. |
| `POST` | `/api/known-tokens` | Register a token name/color/kind. |
| `GET` | `/api/midnight/config` | Public Midnight config the browser contract client needs. |
| `POST` | `/api/zswap/submit` | Fully validate an offer (structure + ZK proofs + liveness); `400 {error, reason}` on failure, else forward to the batcher → Celestia. |
| `GET` | `/api/events` | Server-Sent Events stream for offer lifecycle (indexed / consumed / expired). |

## Celestia data retention (read before relying on history)

Celestia prunes blob data after **~7 days** (CIP-36 sampling window; pruning
default-on since celestia-node v0.25.3; storage window = 7d + 1h). Celestia's
official position: *"rollups and applications are responsible for storing their
historical data"* — there is no native archival product (namespace pinning is a
long-open feature request).

What this means here:

- **Our Postgres already archives every valid offer permanently**
  (`offer_file.transaction_hex`, including `offer_file_history`) — historical
  analysis of offers is served by our own DB, not by Celestia.
- **A fresh node cannot sync the namespace from genesis once blobs are >7d
  old** via ordinary Celestia nodes. Bootstrap options: an archival endpoint
  (run `celestia ... --archival`, or providers — QuickNode; community archival
  RPCs), the free Arweave-backed **KYVE Trustless API** (`blob.Get`-compatible),
  **Celenium** API, or a DB snapshot / blob mirror we publish.
- **Mirroring recipe** (e.g. S3/R2 public good, requester-pays for readers):
  at ingestion (we see every namespace blob, including third-party posts) store
  `{height, namespace, commitment, blob, pfb_txhash, inclusion_proof}`. The
  share commitment is recomputable from the bytes (self-verifying integrity);
  the inclusion proof must be captured **within the 7-day window**
  (`blob.GetProof`) for provable on-chain history after pruning.
- Note the window asymmetry: with Midnight's next-release root window (~14d),
  an offer can still be **fillable after its Celestia blob is pruned** — takers
  depend on our API/mirror for the blob, not on Celestia.

## Stopping

```bash
curl -X POST http://localhost:4747/shutdown
# or Ctrl+C in the orchestrator terminal
```
