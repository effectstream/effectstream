# PRC-1 — Paima Achievement Interface

## Use case

Share your game's achievements through a standard, wallet-friendly HTTP API.

## Summary

An open cross-game standard achievement specification to gamify on-chain participation. PRC-1 defines how a game (or any application) exposes its achievement catalogue and per-player completion state through a fixed set of HTTP endpoints with a typed JSON shape. Any portal, leaderboard, aggregator, or third-party tool can integrate with **any** PRC-1 game by speaking the same protocol — no per-game adapter needed.

This standard does **not** depend on a specific platform, chain, or language and can be entirely self-hosted. A game can use it internally to gate progression (unlocking new areas, granting prizes), and third parties can use it to build cross-game experiences.

## Format

### HTTP

- All requests are issued against the game node's `{BASE_URL}` via standard HTTP.
- All endpoints are `GET`; all responses are `application/json`.
- Standard HTTP status codes are used (`200`, `404`, `500`, …).
- Clients MAY send `Accept-Language` (RFC 7231) to request localized content; servers respond with `Content-Language` to indicate the language actually returned.

### Shared response interfaces

**Game metadata** — identifies the game emitting the achievements.

```ts
interface Game {
  id: string;        // Game ID
  name?: string;     // Optional game name
  version?: string;  // Optional game version
}
```

**Data validity** — lets a client confirm the snapshot's freshness and which chain it's anchored to. This is the basis for cross-game on-chain interoperability.

```ts
interface Validity {
  block: number;   // Data block height (0 = always valid)
  caip2: string;   // CAIP-2 chain identifier
  time?: string;   // Optional ISO-8601 timestamp
}
```

**Player info** — identifies the player a response is about. `userId` should be immutable (a wallet may be migrated or replaced).

```ts
interface Player {
  wallet: string;
  walletType?: "cardano" | "evm" | "polkadot" | "algorand" | string;
  userId?: string;
  userName?: string;
}
```

## Specification

### 1. Get all achievements

```
GET {BASE_URL}/achievements/public/list
GET {BASE_URL}/achievements/public/list?category=Silver
GET {BASE_URL}/achievements/public/list?isActive=true
```

Returns the catalogue of achievements the game exposes, optionally filtered by category or active state.

```ts
interface AchievementPublicList extends Game, Validity {
  achievements: Array<{
    name: string;                           // Unique identifier
    score?: number;                         // Optional relative value
    category?: string;                      // Optional grouping
    percentCompleted?: number;              // % of players who unlocked it
    isActive: boolean;                      // Currently unlockable?
    displayName: string;
    description: string;
    spoiler?: "all" | "description";        // Hide details until unlocked
    iconURI?: string;
    iconGreyURI?: string;                   // Locked-state icon
    startDate?: string;                     // ISO-8601, time-limited start
    endDate?: string;                       // ISO-8601, time-limited end
  }>;
}
```

### 2. Get completed achievements for a wallet or token

```
GET {BASE_URL}/achievements/wallet/:wallet
GET {BASE_URL}/achievements/wallet/:wallet?name=start_game,end_game,defeat_red_dragon
GET {BASE_URL}/achievements/erc/:erc/:cde/:token_id
```

- `wallet` — the wallet address.
- `erc` — any ERC standard the game supports (e.g. `erc721`, `erc6551`).
- `cde` — the game's *Chain Data Extension* name, used to identify the contract.
- `token_id` — the ERC-defined token identifier.

The response merges `Validity` and `Player` plus the per-player completion list, including incremental progress where applicable.

```ts
interface PlayerAchievements extends Validity, Player {
  completed: number;                  // Total unlocked for this game
  achievements: Array<{
    name: string;
    completed: boolean;
    completedDate?: string;           // ISO-8601
    completedRate?: {                 // For incremental achievements
      progress: number;
      total: number;
    };
  }>;
}
```

The two endpoints together — `public/list` for the catalogue, `wallet/:wallet` for the player — are the entire protocol. A portal can render any PRC-1 game with these two calls.

## Reference implementation

A reference Fastify implementation with in-memory fixtures is available at https://github.com/effectstream/midnight-game-api-spec/tree/main/demo. It covers every endpoint and is the easiest place to start when integrating PRC-1 into a new game.

---

## Integration with EffectStream

EffectStream ships first-class support for PRC-1 — the spec is part of the framework's contract with games, not an external add-on. For an application built on EffectStream, exposing PRC-1 endpoints is segmented across the standard EffectStream layers:

- **API layer** (Fastify) — register two routes that return the `AchievementPublicList` and `PlayerAchievements` shapes.
- **Database layer** — a per-game `achievement_unlocks` table backed by pgtyped queries (`insertUnlock`, `getUnlocksByWallet`).
- **State-machine layer** — an `addStateTransition` handler that detects gameplay events and writes unlock rows.
- **Achievement definitions** — a per-game data file enumerating each achievement's `name`, `displayName`, `description`, `isActive`, `score`, `category`, `iconURI`.

### Documentation

- [Achievements component](/docs/home/components/achievements) — full reference for the EffectStream achievements module.
- [Achievement system blog walkthrough](/docs/blog/achievement-system) — annotated code from the live games.

### Live PRC-1 implementations

| Game | Source | Live URL |
|---|---|---|
| Safe Solver | https://github.com/effectstream/safe-solver | https://safesolver.midnight.fun/ |
| Kachina Kolosseum | https://github.com/PaimaStudios/pvp-arena | https://kachina.midnight.fun/ |
| Block Kart Legends | https://github.com/effectstream/block-kart-legends | https://blockkart.paimastudios.com/ |

The live aggregator at https://midnight.fun/games queries each game's PRC-1 endpoints in real time. There is no central achievement database — the spec is the integration.
