# PRC-6 — Midnight dApp Integration Interface

## Use case

Expose your dApp's channels, leaderboards, and auto-sign identity behind one standard HTTP API.

## Summary

PRC-6 defines the interface a developer implements so that the Midnight platform (or any compatible aggregator) can index their dApp. It is a strict superset of [PRC-1](./prc1.md) — every PRC-6 endpoint is consistent with PRC-1, plus per-channel metric streams and identity resolution.

In this architecture the application is the **source of truth** for:

- **Metrics** — channel-specific scores per user.
- **Achievements** — unlocking and progress tracking (inherited from PRC-1).
- **Identity** — linking *session wallets* (temporary keys used during interactions) to *main wallets* (durable identity for reputation and aggregation).

The platform is an aggregator. It queries the application's endpoints and presents a unified profile across the ecosystem.

`{BASE_URL}` is the root of the application server (e.g. `https://my-game.io`). The `/metrics` path can be mounted at any base URL the implementer controls.

```
GET {BASE_URL}/metrics
GET {BASE_URL}/metrics/leaderboard
GET {BASE_URL}/metrics/volume
GET {BASE_URL}/metrics/users/mn_addr_undeployed1234567890?channel=leaderboard
```

## Authentication

All endpoints are public and read-only by default. Channels MAY be declared **private** by setting `auth: true` in their channel definition.

When a request targets a private channel — directly via `GET {BASE_URL}/metrics/{channel}` or via the `channel` query param on `GET {BASE_URL}/metrics/users/{address}` — the application MUST authenticate the caller using an API key:

| Method | Format |
|---|---|
| HTTP Header | `X-API-Key: <key>` |
| Query Param | `?api_key=<key>` |

Header takes precedence over query param.

| Status | Condition |
|---|---|
| `401` | API key missing or invalid on a request targeting a private channel. |

Private channels MAY expose sensitive data that public channels omit — e.g. exact USD volumes, granular financials, raw transaction values. The platform forwards the API key when querying private channels on behalf of authorized integrations.

## Standard channels

Each application exposes one or more **channels** — independent metric streams. The following channel IDs are recognised by the platform; applications MAY also expose custom channels.

| Channel ID | `scoreUnit` | `type` |
|---|---|---|
| `leaderboard` | app-defined (e.g. `"Points"`, `"Lap Time (s)"`) | — |
| `volume` | `"USD Volume"` | — |
| `transactions` | `"Transactions"` | — |
| `tvl` | `"USD"` | `snapshot` |
| `verifications` | `"Verifications"` | — |
| `access_grants` | `"Access Grants"` | — |
| `votes` | `"Votes"` | — |
| `proposals` | `"Proposals"` | — |
| `credentials` | `"Credentials"` | — |
| `reputation_checks` | `"Reputation Checks"` | — |
| `endorsements` | `"Endorsements"` | — |
| `buyers` | `"Buyers"` | — |
| `sellers` | `"Sellers"` | — |
| `compliance_proofs` | `"Compliance Proofs"` | — |
| `messages` | `"Messages"` | — |
| `interactions` | `"Interactions"` | — |

> `type` defaults to `cumulative`; `snapshot` channels reflect current state only and don't support `startDate` / `endDate` filtering. All channels are optional — implementers expose only those relevant to their use case.

## 1. App Metadata & Channels

```
GET {BASE_URL}/metrics
```

Returns the application's display metadata, global achievement definitions, and the list of metric channels it exposes. The platform uses this to render the application's profile and decide which channels to query.

**Response body:**

| Field | Type | Description |
|---|---|---|
| `name` | String | Display name of the application. |
| `description` | String | Short summary. |
| `achievements` | Array | Global achievement definitions (PRC-1 compatible). |
| `channels` | Array | Metric channels this application exposes. |

**Achievement object** (PRC-1-compatible; required fields listed; PRC-1 defines additional optional fields):

| Field | Type | Description |
|---|---|---|
| `name` | String | Unique identifier (e.g. `speed_demon`). |
| `displayName` | String | Display title. |
| `description` | String | How to unlock. |
| `isActive` | Boolean | Whether it can currently be unlocked. |
| `iconURI` | String | (Optional) Badge image URL, square, ≥100×100. |
| `percentCompleted` | Number | (Optional) % of main wallets that have unlocked it. |

**Channel object:**

| Field | Type | Description |
|---|---|---|
| `id` | String | Channel id; standard from the table above, or app-defined. |
| `name` | String | Display name. |
| `description` | String | What this channel measures. |
| `scoreUnit` | String | Label for the score value. |
| `sortOrder` | Enum | `DESC` (higher = better) or `ASC` (lower = better). |
| `type` | Enum | (Optional) `cumulative` (default) or `snapshot`. |
| `auth` | Boolean | (Optional) `true` if the channel requires an API key. |

**Example response:**

```json
{
  "name": "Cyber Drifter",
  "description": "High-octane neon racing.",
  "achievements": [
    {
      "name": "speed_demon",
      "displayName": "Speed Demon",
      "description": "Finish a lap under 60 seconds.",
      "isActive": true,
      "iconURI": "https://cyber-drifter.io/assets/badges/speed.png",
      "percentCompleted": 14.2
    }
  ],
  "channels": [
    { "id": "leaderboard", "name": "Lap Time",
      "scoreUnit": "Lap Time (s)", "sortOrder": "ASC" },
    { "id": "kos", "name": "Knock Outs",
      "scoreUnit": "KOs", "sortOrder": "DESC" },
    { "id": "volume", "name": "USD Volume",
      "scoreUnit": "USD Volume", "sortOrder": "DESC", "auth": true }
  ]
}
```

## 2. Channel Rankings

```
GET {BASE_URL}/metrics/{channel}
```

Returns the ordered ranking for a channel. Cumulative channels report totals within the time window; snapshot channels ignore `startDate`/`endDate`.

> **Identity-resolution requirement.** Scores MUST be aggregated such that if a user interacts via multiple session wallets that delegate to the same main wallet, only the *main wallet* appears in the ranking — with its score consolidated across all its session wallets. A session wallet defaults to delegating to itself.

**Query parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `startDate` | ISODate | No | Cumulative channels only. Default: now − 1 year. |
| `endDate` | ISODate | No | Cumulative channels only. Default: now. |
| `limit` | Integer | No | Entries to return. Default `50`, max `1000`. |
| `offset` | Integer | No | For pagination. |
| `minAchievements` | Integer | No | Only return entries with `achievementsUnlocked ≥ value`. |

**Response:**

| Field | Type | Description |
|---|---|---|
| `channel` | String | Channel id queried. |
| `startDate` / `endDate` | String | Applied date filters; omitted for snapshot channels. |
| `totalPlayers` | Integer | Total distinct ranked main wallets. |
| `totalScore` | Number | Sum of scores across the result set. |
| `entries` | Array | Ordered rankings. |

**Entry:**

| Field | Type | Description |
|---|---|---|
| `rank` | Integer | 1-based position. |
| `address` | String | Main wallet address. |
| `displayName` | String | (Optional) Chosen username. |
| `score` | Number | Score for this channel and time range. |

```json
{
  "channel": "leaderboard",
  "startDate": "2025-02-05T23:00:00.000Z",
  "endDate":   "2026-02-05T12:00:00.000Z",
  "totalPlayers": 450,
  "totalScore": 28934.6,
  "entries": [
    { "rank": 1, "address": "0xMainWalletA...", "displayName": "DriftKing", "score": 45.2 },
    { "rank": 2, "address": "0xMainWalletB...", "displayName": null,        "score": 46.8 }
  ]
}
```

## 3. User Profile

```
GET {BASE_URL}/metrics/users/{address}
```

Returns identity and (optionally) per-channel stats for a wallet.

> **Identity-resolution requirement.** Accept *either* a session wallet or a main wallet address. If the queried address is a session wallet, return the main wallet's combined stats. The `identity` object MUST explicitly show the relationship between the queried and the resolved address.

If no `channel` is supplied, only `identity` and `achievements` are returned — useful for identity-resolution lookups that don't need metric data. If any requested channel has `auth: true`, the request MUST include an API key (public channels in the same request remain unauthenticated).

**Response:**

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Identity resolution details. Always returned. |
| `achievements` | String[] | PRC-1 `name` values for all unlocked achievements. Always returned. |
| `channels` | Object | Stats keyed by channel id. Omitted if no `channel` was requested. |

**Identity:**

| Field | Type | Description |
|---|---|---|
| `address` | String | Resolved main wallet address. |
| `delegatedFrom` | String[] | Session wallets that delegate to this address. May be empty. |
| `displayName` | String | (Optional). |

**Channel entry:**

| Field | Type | Description |
|---|---|---|
| `startDate` / `endDate` | String | Applied filters; omitted for snapshot channels. |
| `stats` | Object | User metrics for this channel/range. |

**Stats:**

| Field | Type | Description |
|---|---|---|
| `score` | Number | Score for this channel and range. |
| `rank` | Integer | Dynamic rank within this channel for the range. |
| `matchesPlayed` | Integer | (Optional) Total interactions recorded. |

**Without channels (identity resolution only):**

```json
{
  "identity": {
    "address": "0x4f3a1b8e2d7c9f0a5e6b3d1c8f2a7e4b9d0c5f1a",
    "delegatedFrom": ["0xd3a7f2c9e1b4f6a8d0e5c2b9f4a1e7c3d6b0f8a2"],
    "displayName": "DriftKing"
  },
  "achievements": ["first_race", "speed_demon", "podium_finish"]
}
```

## 4. Custom channels

Applications MAY define their own channels beyond the standard table — anything passed by the `/metrics` channel list works. Custom channels follow the same shape and the same authentication rules. The platform treats them generically: it queries `/metrics/{custom-id}` exactly like a standard channel.

---

## Integration with EffectStream

EffectStream is the framework that produces PRC-6-compatible servers. For an application built on EffectStream, the integration spans the same layers as PRC-1, plus the channels and identity-resolution endpoints.

- **API layer**: register `/metrics`, `/metrics/{channel}`, `/metrics/users/{address}`. The reference [`midnight-game-api-spec/demo`](https://github.com/effectstream/midnight-game-api-spec/tree/main/demo) is a Fastify implementation covering every endpoint with in-memory fixtures.
- **Database layer**: per-channel score table, identity-resolution table that maps session wallet → main wallet (uniquely indexed on `session`).
- **State-machine layer**: handlers that emit score updates per channel as gameplay/usage events land. The same handlers that drive PRC-1 unlocks drive PRC-6 metrics.
- **Auto-sign integration**: when a user creates a new session wallet, the wallets package emits a delegation event that the state machine writes into the identity table. Subsequent `GET /metrics/users/{session}` calls then resolve back to the main wallet automatically.

### Aggregator

[`PaimaStudios/paima-portal`](https://github.com/PaimaStudios/paima-portal) is the open-source aggregator. It speaks PRC-6 and renders the live ecosystem view at [midnight.fun/games](https://midnight.fun/games).

### Walkthroughs

- [Achievement-system blog post](/docs/blog/achievement-system) — full Fastify walkthrough, TypeScript types, JSON examples.
- [Achievements component reference](/docs/home/components/achievements) — the EffectStream developer-facing entry point.
