# ZSwap-DA — Developer API Reference

ZSwap-DA is a dual-chain indexer and offer relay for shielded DEX swaps. It watches two chains simultaneously — **Midnight** (shielded settlement) and **Celestia** (decentralised data availability) — and presents a single REST API for reading live swap offers and writing new ones.

This document targets application developers who want to interact with the endpoints directly, submit ZSwap offers to Celestia, or drive settlement transactions on Midnight programmatically.

---

## Environments

Three configurations ship out of the box. All endpoints and env-var names are identical across environments; only the values differ.

| | **Undeployed (local dev)** | **Preview** | **Mainnet** |
|---|---|---|---|
| `MIDNIGHT_NETWORK_ID` | `undeployed` | `preview` | `mainnet` |
| `CELESTIA_NETWORK` | `devnet` | `mocha` | `mainnet` |
| `CELESTIA_RPC_URL` | `http://127.0.0.1:26658` | QuickNode Mocha-4 URL | QuickNode / self-hosted |
| `CELESTIA_POLLING_INTERVAL_MS` | `6000` | `3000` | `30000` |
| `CELESTIA_START_HEIGHT` | `1` | `10620000` ¹ | set to your deployment block |
| `MIDNIGHT_START_BLOCK` | `1` | `1` | set to your deployment block |
| `OFFER_TTL_SECONDS` | `2592000` (30 d) | `3600` ² | `3600` ² |
| Node API port | `9999` | `9999` | `9999` |
| Batcher port | `3334` | `3334` | `3334` |
| Config file | `config.dev.ts` | `config.preview.ts` | `config.mainnet.ts` |

¹ Mocha-4 block equivalent to Midnight Preview genesis (2026-03-25T01:05:42 UTC).  
² Preview and Mainnet use a ~1-hour Merkle-root window. Offers proving against an expired root cannot settle; matching `OFFER_TTL_SECONDS` to the root window prevents the indexer from serving un-fillable offers.

### Environment variables (complete reference)

```bash
# ── Celestia ────────────────────────────────────────────────────────────────
CELESTIA_NETWORK=devnet|mocha|mainnet    # selects polling-interval default
CELESTIA_RPC_URL=http://...              # light-node JSON-RPC endpoint
CELESTIA_NAMESPACE=000000000000deadbeef # 10-byte hex namespace (no 0x prefix)
CELESTIA_AUTH_TOKEN=                    # bearer token; leave empty for QuickNode (auth is in the URL)
CELESTIA_START_HEIGHT=1                 # skip blocks before your deployment
CELESTIA_POLLING_INTERVAL_MS=6000       # how often to poll for new blocks
CELESTIA_STEP_SIZE=200                  # blocks per fetch window
CELESTIA_FETCH_CONCURRENCY=12           # parallel RPC calls per window

# ── Midnight ─────────────────────────────────────────────────────────────────
MIDNIGHT_NETWORK_ID=undeployed|preview|mainnet
MIDNIGHT_CONTRACT_ADDRESS=mn1...        # required on preview/mainnet
MIDNIGHT_START_BLOCK=1
MIDNIGHT_DELAY_MS=30000                 # indexer poll delay

# ── NTP timing ────────────────────────────────────────────────────────────────
NTP_START_TIME=1774400742000            # epoch anchor (ms); default = Preview block 1
BLOCK_TIME_MS=600000                    # 10 min/block keeps catch-up short
NTP_STEP_SIZE=1000

# ── Node ──────────────────────────────────────────────────────────────────────
EFFECTSTREAM_API_PORT=9999
BATCHER_SUBMIT_URL=http://127.0.0.1:3334
OFFER_TTL_SECONDS=2592000               # offer lifetime (seconds)
OFFER_MAX_BYTES=1048576                 # max decoded offer size (DoS guard)
ROOT_WINDOW_SECONDS=1209600             # known-roots retention window (14 days default)
SEEN_NULLIFIER_TTL_SECONDS=2592000      # prune unmatched nullifier rows after N seconds
```

---

## How it works (indexer overview)

```
Celestia DA                    Midnight
     │                               │
     │  every blob in namespace      │  every block: nullifiers,
     │  → decoded as zswapoffer1…    │  unshielded UTXOs, Merkle roots
     ▼                               ▼
         ┌─────────────────────────────┐
         │   ZSwap-DA indexer (node)   │
         │                             │
         │  offer_file  (live offers)  │
         │  nullifiers  (spent coins)  │
         │  known_roots (root window)  │
         └────────────┬────────────────┘
                      │  REST API  :9999
                      ▼
               your application
```

**Offer lifecycle:**

1. A maker encodes a `zswapoffer1…` blob and POSTs it to `/api/zswap/submit`.
2. The node validates it, then forwards it to the batcher which publishes it as a Celestia blob.
3. The Celestia indexer picks up the blob and re-validates it deterministically. On success the offer lands in `offer_file`.
4. When any input coin is spent on Midnight (nullifier seen or unshielded UTXO consumed), the offer moves to `offer_file_history` with `archive_reason = 'CONSUMED'`.
5. If no consumption is observed before the TTL, a scheduled cleanup archives it with `archive_reason = 'TTL'`.

---

## Node API — port 9999

Base URL: `http://<host>:9999`

---

### Health

#### `GET /health`

Framework-level liveness probe. Returns `200 OK` as soon as the HTTP server is up, regardless of sync state.

```bash
curl http://host:9999/health
```

```json
{ "status": "ok" }
```

---

#### `GET /api/health/sync`

Per-protocol sync progress. Use this to confirm the node is serving live data before submitting offers.

```bash
curl http://host:9999/api/health/sync
```

**Response**

```json
{
  "ts": 1750800000000,
  "status": "syncing",
  "ntp": {
    "current": 1270,
    "tip":     12816,
    "pct":     9.9,
    "lag_blocks":  11546,
    "lag_seconds": 6927600
  },
  "midnight": {
    "current": 127000,
    "fetched": 127500,
    "tip":     1281600,
    "pct":     9.9
  },
  "celestia": {
    "current": 12231713,
    "fetched": 12231800,
    "tip":     12233200,
    "pct":     99.8
  }
}
```

| Field | Description |
|---|---|
| `status` | `"ok"` — within 2 NTP blocks of real time (≤ 20 min lag); `"syncing"` — catching up; `"error"` — no blocks finalized yet |
| `ntp.lag_seconds` | Seconds of history remaining to process |
| `midnight.tip` | Live Midnight chain tip (cached 60 s; `null` if unreachable) |
| `celestia.tip` | Live Celestia chain tip (cached 60 s; `null` if unreachable) |

On a fresh database the initial sync of 89 days of Midnight history takes approximately 4 hours.

---

### Reading offers

#### `GET /api/zswaps`

Returns the current live offer book — offers published to Celestia, validated, and not yet consumed or expired.

**Query parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `token` | hex string | — | Filter to offers that include this token color (64 hex chars, no `0x`). Matches both giving and wanting sides. |
| `direction` | `GIVING` \| `WANTING` | any | Filter by side. Only meaningful when `token` is also set. |
| `limit` | integer | 100 | Max results (capped at 100). |
| `offset` | integer | 0 | Pagination offset. |

**Response** — array of offer objects, newest first:

```json
[
  {
    "id": 42,
    "celestia_height": "12231800",
    "transaction_hex": "zswapoffer1...",
    "metadata_created_at": "2026-06-01T12:00:00.000Z",
    "metadata_expires_at": null,
    "ttl_seconds": 3600,
    "created_at": "2026-06-01T12:00:05.123Z",
    "gives": [
      { "token": "0000000000000000000000000000000000000000000000000000000000000000", "amount": "1000000" }
    ],
    "wants": [
      { "token": "70ce552eaec9be6e009189bffbb69184b2dd008ba9bdaec6da5305fc505eb569", "amount": "500000" }
    ]
  }
]
```

| Field | Description |
|---|---|
| `transaction_hex` | The raw `zswapoffer1…` blob. Pass directly to the Midnight contract for settlement. |
| `gives` | Tokens the maker is offering |
| `wants` | Tokens the maker is requesting |
| `ttl_seconds` | Offer lifetime in seconds from `metadata_created_at` |

```bash
# All open offers giving NIGHT:
curl "http://host:9999/api/zswaps?token=0000000000000000000000000000000000000000000000000000000000000000&direction=GIVING"
```

---

#### `GET /api/zswap/status`

Single-blob status lookup. Use this to reconcile a "My Trades" list on startup without fetching the full offer book.

**Query parameter:** `blob` — the `zswapoffer1…` string.

```bash
curl "http://host:9999/api/zswap/status?blob=zswapoffer1..."
```

**Response**

```json
{ "blob": "zswapoffer1...", "status": "open" }
```

`status` is one of `"open"` | `"completed"` | `"expired"` | `"not_found"`.

---

#### `GET /api/pairs`

All known trading pairs, combining historical fill data from `pair_stats` with live open-offer counts. Use this to populate a pair picker or market list.

```bash
curl http://host:9999/api/pairs
```

```json
[
  {
    "base":       "70ce552eaec9be6e009189bffbb69184b2dd008ba9bdaec6da5305fc505eb569",
    "quote":      "0000000000000000000000000000000000000000000000000000000000000000",
    "base_name":  "TESTTOKENA",
    "quote_name": "NIGHT",
    "open_count": 6,
    "last_price": 12.5
  }
]
```

---

#### `GET /api/known-tokens`

> **⚠️ Demo endpoint — do not use as a source of truth.**
> This registry is a temporary convenience feature for this demo. The official Midnight token-metadata standard is not yet live. Names and kinds stored here are manually curated and unverified. Do not rely on this endpoint for authoritative token information.

All registered token colors.

```bash
curl http://host:9999/api/known-tokens
```

```json
[
  { "id": 1, "token_color": "0000000000000000000000000000000000000000000000000000000000000000", "name": "NIGHT", "kind": "unshielded" }
]
```

New token colors are auto-registered when a valid offer containing them is indexed.

---

#### `POST /api/known-tokens`

> **⚠️ Demo endpoint — do not use as a source of truth.**
> Registering a name here does not make it canonical. Any operator can write any name against any color. Wait for the official token-metadata standard before building user-facing trust on top of this endpoint.

Register a human-readable name for a token color before any offers appear (e.g. immediately after a browser-wallet mint).

```bash
curl -X POST http://host:9999/api/known-tokens \
  -H "Content-Type: application/json" \
  -d '{"color":"70ce552eaec9be6e009189bffbb69184b2dd008ba9bdaec6da5305fc505eb569","name":"TESTTOKENA","kind":"shielded"}'
```

**Body**

```json
{
  "color": "70ce552eaec9be6e009189bffbb69184b2dd008ba9bdaec6da5305fc505eb569",
  "name": "TESTTOKENA",
  "kind": "shielded"
}
```

`name` must be unique (max 16 chars, stored uppercased). `kind` is `"shielded"` or `"unshielded"`.

**Success `200`**

```json
{ "success": true, "color": "70ce...", "name": "TESTTOKENA", "kind": "shielded" }
```

**Conflict `409`** — name or color already registered:

```json
{ "error": "Token name \"TESTTOKENA\" is already taken" }
```

---

### Writing offers

#### `POST /api/zswap/submit`

Validate and forward a `zswapoffer1…` blob to Celestia DA via the batcher. This is the recommended submission path — structure and coin liveness are verified before any Celestia fee is incurred.

```bash
curl -X POST http://host:9999/api/zswap/submit \
  -H "Content-Type: application/json" \
  -d '{"blob":"zswapoffer1..."}'
```

**Success `200`**

```json
{ "success": true, "blob": "zswapoffer1...", "result": { ... } }
```

**Error `400`**

```json
{ "error": "ROOT_UNKNOWN", "reason": "input merkle root not a known recent chain root: abc123..." }
```

| Error code | Meaning |
|---|---|
| `INVALID_FORMAT` | Blob is not a valid `zswapoffer1…` encoding |
| `INVALID_PROOF` | Cryptographic proof verification failed |
| `NULLIFIER_SPENT` | A shielded input coin is already spent on Midnight |
| `UTXO_NOT_LIVE` | An unshielded UTXO was spent or was never created on-chain |
| `ROOT_UNKNOWN` | The shielded input proves against a Merkle root outside the `ROOT_WINDOW_SECONDS` retention window |

Validation consults the node's local state only — no live RPC calls are made. `ROOT_UNKNOWN` can fire while the node is still syncing (the root simply hasn't arrived yet). Retry once `/api/health/sync` reports `"status":"ok"`.

---

### Market data

#### `GET /api/quote`

Price quote for a token swap, backed by the `token_prices` table. On first request the deterministic fallback price is written; subsequent calls are consistent. Operators can override rows directly in the DB.

**Query parameters:** `from_token`, `to_token` (64-hex, no `0x`), `from_amount` (base units), optional `to_amount`.

```bash
curl "http://host:9999/api/quote?from_token=0000...0000&to_token=70ce...b569&from_amount=1000000"
```

---

#### `GET /api/chart/stats?base=<A>&quote=<B>`

24-hour statistics for a pair derived from consumed (filled) offers. Falls back to the mid of current open offers when no fills exist yet.

```bash
curl "http://host:9999/api/chart/stats?base=70ce...b569&quote=0000...0000"
```

```json
{
  "base": "70ce...",
  "quote": "0000...",
  "last": 12.5,
  "change24": 2.3,
  "high": 13.1,
  "low": 12.0,
  "volume_base": 10000000,
  "volume_quote": 800000
}
```

---

#### `GET /api/chart/history?base=<A>&quote=<B>`

Last 120 fills (consumed offers) for a pair, newest first.

```json
[
  { "price": 12.5, "amt": 1000000, "up": true, "at": "2026-06-01T12:00:00.000Z" }
]
```

---

### Real-time events

#### `GET /api/events`

Server-Sent Events stream for real-time offer lifecycle notifications. A comment-only keepalive (`: heartbeat`) is sent every 30 seconds.

```bash
curl -N http://host:9999/api/events
```

**Event types**

```
data: {"type":"connected","timestamp":1750800000000}

data: {"type":"offer_indexed","offerId":42,"celestiaHeight":12231800,"gives":[...],"wants":[...],"timestamp":...}

data: {"type":"offer_consumed","offerId":42,"nullifier":"abc123...","timestamp":...}

data: {"type":"offer_expired","offerId":42,"timestamp":...}

data: {"type":"offer_rejected","code":"ROOT_UNKNOWN","reason":"...","celestiaHeight":...,"timestamp":...}

data: {"type":"token_minted","name":"MYTOKEN","color":"...","kind":"shielded","timestamp":...}
```

---

### Midnight configuration

#### `GET /api/midnight/config`

Public Midnight configuration the browser contract client needs. Never includes secrets.

```bash
curl http://host:9999/api/midnight/config
```

```json
{
  "contractAddress": "mn1abc...",
  "indexerUri":      "https://indexer.midnight.network:8088/graphql",
  "indexerWsUri":    "wss://indexer.midnight.network:8088/graphql",
  "proofServerUri":  "https://proof.midnight.network",
  "networkId":       "preview"
}
```

Returns `500` if `MIDNIGHT_CONTRACT_ADDRESS` is not set.

---

## Batcher API — port 3334

The batcher accepts `zswapoffer1…` blobs, validates them, and publishes them as Celestia blobs. In normal usage you go through `/api/zswap/submit` on the node (which calls the batcher internally). Direct batcher access is for advanced integrations.

Base URL: `http://<host>:3334`  
Swagger UI: `http://<host>:3334/documentation`

---

#### `GET /health`

```json
{ "status": "ok" }
```

---

#### `GET /status`

Batcher initialization state, pending input counts, and queue targets.

---

#### `GET /queue-stats`

```json
{
  "totalPendingInputs": 3,
  "targets": [
    {
      "target": "midnight-balancer",
      "pendingInputs": 3,
      "isReady": true,
      "criteriaType": "size",
      "timeSinceLastProcess": 120
    }
  ]
}
```

---

#### `POST /send-input`

Submit a blob directly to the batcher queue. Structure and cryptographic proofs are validated before acceptance. Liveness checks (spent coins, root-known) are not repeated here — they are enforced at the node's STM ingestion step.

**Body**

```json
{
  "data": {
    "input": "zswapoffer1...",
    "target": "midnight-balancer",
    "address": "mn1...",
    "addressType": 0
  },
  "confirmationLevel": "wait-receipt"
}
```

**Success `200`**

```json
{
  "success": true,
  "message": "Input accepted",
  "inputsProcessed": 1,
  "transactionHash": "0xabc..."
}
```

**Rate-limited `429`**

```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please retry after 60 seconds.",
  "retryAfter": 60
}
```

---

## Token colors

Token colors are 32-byte (64 hex character) identifiers used throughout the Midnight shielded ledger. They appear **without** a `0x` prefix in all API fields. Amounts are always integers in the token's base unit.

The one pre-seeded native token:

| Name | Color | Kind | Notes |
|---|---|---|---|
| `NIGHT` | `0000000000000000000000000000000000000000000000000000000000000000` | `unshielded` | Native Midnight token. `nativeToken()` in the SDK returns `TokenType::Unshielded(NIGHT)`. 1 NIGHT = 10⁶ Stars (atomic units). |

Shielded and unshielded NIGHT share the same color (`0x0000…0000`) and differ only by the enum tag (`Unshielded=0`, `Shielded=1`). The API does not distinguish them by color — both appear as the all-zeros color in offer legs.

---

## Encoding offers (`zswapoffer1…`)

Offer blobs are produced by the Midnight browser SDK. The encoding bundles the ZSwap transaction structure plus the cryptographic proofs required for settlement. Use `encodeOffer` / `validateZswapOffer` from `@zswap-da/validator` rather than constructing the binary format by hand.

The decoded offer contains:

| Field | Description |
|---|---|
| `nullifiers` | Hashes of shielded input coins being spent |
| `unshieldedSpends` | `(owner, intentHash, outputNo)` triples for unshielded inputs |
| `inputRoots` | Merkle roots against which the input proofs are made |
| `gives` / `wants` | The token legs of the swap |

All of these are checked by `/api/zswap/submit` before any Celestia fee is incurred.

### Manual submission (curl)

```bash
BLOB="zswapoffer1..."

# Recommended: submit through the node (validates + forwards to batcher)
curl -s -X POST http://host:9999/api/zswap/submit \
  -H "Content-Type: application/json" \
  -d "{\"blob\":\"$BLOB\"}" | jq .

# Advanced: submit directly to the batcher (skips liveness re-check)
curl -s -X POST http://host:3334/send-input \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "input": "'"$BLOB"'",
      "target": "midnight-balancer",
      "address": "mn1...",
      "addressType": 0
    },
    "confirmationLevel": "wait-receipt"
  }' | jq .

# Confirm the offer landed in the indexer
curl -s "http://host:9999/api/zswaps?limit=5" | jq '.[0]'

# Stream lifecycle events while waiting for settlement
curl -N http://host:9999/api/events
```
