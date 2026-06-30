# ZSwap-DA — Developer API Reference

ZSwap-DA is a dual-chain indexer and offer relay for shielded DEX swaps. It watches two chains simultaneously — **Midnight** (shielded settlement) and **Celestia** (decentralised data availability) — and presents a single REST API for reading live swap offers and writing new ones.

This document is for application developers building on top of the service. It covers the node API (port **9999**) and the batcher API (port **3334**).

---

## How it works (indexer overview)

ZSwap-DA runs two parallel indexers stitched together by a wall-clock NTP block:

```
Celestia DA (Mocha-4)          Midnight (Preview)
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
                      │  REST API
                      ▼
               your application
```

**Offer lifecycle:**

1. A maker encodes a `zswapoffer1…` blob (ZSwap binary format) and POSTs it to `/api/zswap/submit`.
2. The node validates it, then forwards it to the batcher which publishes it as a Celestia blob.
3. The Celestia indexer sees the blob and re-validates it deterministically. On success the offer lands in `offer_file`.
4. When any input coin of the offer is spent on Midnight (nullifier seen or unshielded UTXO consumed), the offer is moved to `offer_file_history` with `archive_reason = 'CONSUMED'`.
5. If no consumption is observed before the offer's TTL expires, a scheduled cleanup moves it to history with `archive_reason = 'TTL'`.

Makers do not need wallets or direct chain access to read data — the node API is fully public.

---

## Node API — port 9999

Base URL: `http://<host>:9999`

---

### Sync health

#### `GET /api/health/sync`

Shows the current sync progress of each chain indexer. Use this to know whether the node is serving live data or still catching up with history.

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
| `status` | `"ok"` — within 2 NTP blocks of real time (≤ 20 min lag); `"syncing"` — catching up with history; `"error"` — no blocks finalized yet |
| `ntp.current` | Last finalized internal (NTP) block |
| `ntp.tip` | Current wall-clock NTP block |
| `ntp.lag_seconds` | How many seconds of history remain to process |
| `midnight.current` | Last Midnight block merged into a finalized NTP block |
| `midnight.fetched` | Latest Midnight block prefetched into the buffer |
| `midnight.tip` | Live Midnight chain tip (fetched from the indexer, cached 60 s; `null` if unreachable) |
| `celestia.current` | Last Celestia block merged |
| `celestia.fetched` | Latest Celestia block in the prefetch buffer |
| `celestia.tip` | Live Celestia chain tip (fetched from QuickNode, cached 60 s; `null` if unreachable) |

During the initial sync `lag_seconds` can be several million seconds (89 days of Midnight history). Full sync takes approximately 4 hours on a fresh database.

---

### Reading offers

#### `GET /api/zswaps`

Returns the current live offer book — offers that have been published to Celestia, validated, and not yet consumed or expired.

**Query parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `token` | hex string | — | Filter to offers that include this token color (64 hex chars). Returns both GIVING and WANTING sides. |
| `direction` | `GIVING` \| `WANTING` | any | Filter by which side the token appears on. Only meaningful when `token` is also set. |
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
    "ttl_seconds": 2592000,
    "created_at": "2026-06-01T12:00:05.123Z",
    "gives": [
      { "token": "0000...0001", "amount": "1000000" }
    ],
    "wants": [
      { "token": "0000...0002", "amount": "500000" }
    ]
  }
]
```

| Field | Description |
|---|---|
| `id` | Internal offer ID |
| `celestia_height` | Celestia block where this offer was published |
| `transaction_hex` | The raw `zswapoffer1…` blob (pass directly to the Midnight contract for settlement) |
| `gives` | Tokens the maker is offering (array of `{ token, amount }`) |
| `wants` | Tokens the maker is requesting |
| `ttl_seconds` | Offer lifetime in seconds from `metadata_created_at` |

**Example — find all offers giving token A:**

```bash
curl "http://host:9999/api/zswaps?token=<64-hex-color>&direction=GIVING"
```

---

#### `GET /api/known-tokens`

Returns all token colors the indexer has seen, including the three pre-seeded native tokens.

```json
[
  { "id": 1, "token_color": "0000...0000", "name": "native_0", "kind": "shielded" },
  { "id": 2, "token_color": "0000...0001", "name": "native_1", "kind": "shielded" },
  { "id": 3, "token_color": "0000...0002", "name": "native_2", "kind": "shielded" }
]
```

New token colors are registered automatically when a valid offer containing them is indexed.

---

#### `POST /api/known-tokens`

Manually register a token name. Useful when the browser wallet mints a new token client-side and you want to give it a human-readable name before any offers appear.

**Body**

```json
{
  "color": "<64-hex-color>",
  "name": "MYTOKEN",
  "kind": "shielded"
}
```

`name` must be unique (max 16 chars, stored uppercased). `kind` is `"shielded"` or `"unshielded"`.

---

### Writing offers

#### `POST /api/zswap/submit`

Validate and forward a `zswapoffer1…` blob to Celestia DA via the batcher. This is the recommended submission path — it validates the offer structure and coin liveness before paying any Celestia fee.

**Body**

```json
{ "blob": "zswapoffer1..." }
```

**Success `200`**

```json
{ "success": true, "blob": "zswapoffer1...", "result": { ... } }
```

**Error `400`**

```json
{ "error": "NULLIFIER_SPENT", "reason": "nullifier already spent: abc123..." }
```

| Error code | Meaning |
|---|---|
| `INVALID_FORMAT` | Blob is not a valid `zswapoffer1…` encoding |
| `INVALID_PROOF` | Cryptographic proof verification failed |
| `NULLIFIER_SPENT` | A shielded input coin is already spent on Midnight |
| `UTXO_NOT_LIVE` | An unshielded input UTXO has been spent or was never created |
| `ROOT_UNKNOWN` | The shielded input proves against a Merkle root the chain never held (or that has aged out of the 14-day window) |

Validation is deterministic and requires no live chain connection. The node consults its local copy of the spent-nullifier set, the live unshielded UTXO set, and the Merkle-root window.

---

### Market data

#### `GET /api/quote`

Returns a synthetic price quote for a token swap. Useful for estimating rates in the UI without constructing a real offer.

**Query parameters:** `from_token`, `to_token` (64-hex colors), `from_amount` (base units), optional `to_amount`.

```bash
curl "http://host:9999/api/quote?from_token=<A>&to_token=<B>&from_amount=1000000"
```

---

#### `GET /api/chart/stats?base=<A>&quote=<B>`

Returns 24-hour market statistics for a token pair derived from consumed (filled) offers.

```json
{
  "base": "0000...0001",
  "quote": "0000...0002",
  "last": 0.5,
  "change24": 2.3,
  "high": 0.55,
  "low": 0.48,
  "volume_base": 10000000,
  "volume_quote": 5000000
}
```

Falls back to the mid of current open offers when there are no fills yet.

---

#### `GET /api/chart/history?base=<A>&quote=<B>`

Returns the last 120 fills (consumed offers) for a pair, newest first.

```json
[
  { "price": 0.5, "amt": 1000000, "up": true, "at": "2026-06-01T12:00:00.000Z" }
]
```

---

### Real-time events

#### `GET /api/events`

Server-Sent Events stream for real-time offer lifecycle notifications. Connect once and receive push updates without polling.

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

The stream also sends a comment-only keepalive (`: heartbeat`) every 30 seconds to prevent proxy timeouts.

---

### Midnight configuration

#### `GET /api/midnight/config`

Returns the public Midnight configuration the browser contract client needs. Never includes secrets.

```json
{
  "contractAddress": "mn1abc...",
  "indexerUri": "https://indexer.midnight.network:8088/graphql",
  "indexerWsUri": "wss://indexer.midnight.network:8088/graphql",
  "proofServerUri": "https://proof.midnight.network",
  "networkId": "preview"
}
```

---

## Batcher API — port 3334

The batcher accepts encoded offer blobs, validates them, and publishes them as Celestia blobs. In normal usage you go through `/api/zswap/submit` on the node (which calls the batcher internally). Direct batcher access is for advanced integrations.

Base URL: `http://<host>:3334`

Swagger UI: `http://<host>:3334/documentation`

---

#### `GET /health`

```json
{ "status": "ok" }
```

---

#### `GET /status`

Returns batcher initialization state, pending input counts, and queue targets.

---

#### `GET /queue-stats`

```json
{
  "totalPendingInputs": 3,
  "targets": [
    { "target": "midnight-balancer", "pendingInputs": 3, "isReady": true, "criteriaType": "...", "timeSinceLastProcess": 120 }
  ]
}
```

---

#### `POST /send-input`

Submit a blob directly to the batcher queue. The batcher validates the offer (structure + cryptographic proofs) before accepting it. Liveness checks (spent coins) are not repeated here — they are enforced at the node's STM ingestion step.

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

Token colors are 32-byte (64 hex character) identifiers used throughout the Midnight shielded ledger. They appear without a `0x` prefix in all API fields.

The three pre-seeded native tokens:

| Name | Color |
|---|---|
| `native_0` | `0000000000000000000000000000000000000000000000000000000000000000` |
| `native_1` | `0000000000000000000000000000000000000000000000000000000000000001` |
| `native_2` | `0000000000000000000000000000000000000000000000000000000000000002` |

Amounts are always integers in the token's base unit (no decimals in the API layer).

---

## Encoding offers (`zswapoffer1…`)

Offer blobs are produced by the Midnight browser SDK (`@midnight-ntwrk/...`). The encoding bundles the ZSwap transaction structure plus the cryptographic proofs required for settlement. The validator package (`@zswap-da/validator`) exposes `encodeOffer` and `validateZswapOffer` — use these rather than constructing the binary format by hand.

The decoded offer contains:
- **nullifiers** — hashes of the shielded input coins being spent
- **unshieldedSpends** — `(owner, intentHash, outputNo)` triples for unshielded inputs
- **inputRoots** — Merkle tree roots against which the input proofs are made
- **gives / wants** — the token legs of the swap

All of these are checked by `/api/zswap/submit` before any Celestia fee is incurred.
