---
slug: achievement-system
title: "An Open Achievement Standard for On-Chain Games"
authors: [effectstream]
tags: [achievements, standards, cross-game, midnight, prc]
---

Steam has achievements. Xbox has Gamerscore. PlayStation has Trophies. But on-chain games? No standard way to track player accomplishments across games. We built PRC-1, an open standard that any EffectStream game can implement, plus a portal where players see all their achievements in one place.

<!-- truncate -->

![Open achievement standard application overview](/img/blog/standards.png)

## PRC-1: the achievement standard

We created PRC-1 (Paima Request for Comment), a community standard similar to [CIPs](https://cips.cardano.org/) for Cardano or [ERCs](https://eips.ethereum.org/erc) for Ethereum, but for the EffectStream game ecosystem. PRC-1 defines how games register, track, and expose achievements through a standard HTTP API.

The spec is published at [effectstream/midnight-game-api-spec](https://github.com/effectstream/midnight-game-api-spec).

A game implementing PRC-1 exposes two endpoints:

- `GET /achievements/public/list` returns all achievements defined by the game (name, description, display metadata)
- `GET /achievements/wallet/:wallet` returns which achievements a specific player has earned, with timestamps and completion data

Any game that implements these endpoints is automatically discoverable by achievement portals, leaderboard aggregators, and third-party tools. The standard is intentionally minimal: it defines the interface, not the implementation. Games track achievements however they want internally; they just expose results through these endpoints.

## PRC-6: Midnight dApp integration extension

For games running on the [midnight.fun](https://midnight.fun/games) portal, we extended PRC-1 with PRC-6 (the Midnight dApp Integration Interface). PRC-6 adds:

- **Channels** for categorizing content within a game (modes, seasons, maps)
- **Leaderboards** with ranked player standings per channel
- **Metrics** for game-level statistics (total players, active sessions, transaction volume)
- **Identity resolution** to map session wallets to main wallets via delegation, so achievements earned through auto-sign sessions get correctly attributed to the player's primary identity

PRC-6 is what powers the rich game cards on midnight.fun. Each game tile shows live player counts, leaderboard positions, and achievement progress, all pulled from the standard API.

The full PRC-6 spec lives in the same repository: [effectstream/midnight-game-api-spec](https://github.com/effectstream/midnight-game-api-spec).

## Live implementation: three games on midnight.fun

PRC-1 and PRC-6 are implemented in three live games on the midnight.fun portal:

- [**Block Kart Legends**](https://blockkart.paimastudios.com/) - racing achievements (lap times, win streaks, distance milestones)
- [**Kachina Kolosseum**](https://kachina.midnight.fun/) - PvP combat achievements (victories, combos, rank progression)
- [**Safe Solver**](https://safesolver.midnight.fun/) - puzzle achievements (completion speed, streak bonuses, difficulty tiers)

![midnight.fun games portal showing Block Kart, Kachina, and Safe Solver with achievements and leaderboards](/img/blog/midnightfun.png)

The screenshot shows the midnight.fun portal pulling data from all three games. Each game card displays live achievement counts and leaderboard positions, sourced from the PRC-1 and PRC-6 APIs. There's no centralized database here; the data lives in each game's node, and the portal queries it on the fly.

<iframe src="https://drive.google.com/file/d/1SSpY_nFAIm95b7v4LSEDhSywYgAkx0nK/preview" width="100%" height="480" allow="autoplay"></iframe>

## How it works under the hood

When a player connects their wallet to midnight.fun, the portal queries each game's PRC-1 endpoint to fetch that player's achievements. Because the standard uses wallet addresses as the primary identifier, achievements are cross-game and cross-platform by default: any portal or app can query any PRC-1 game.

For games using auto-sign (session key delegation), PRC-6's identity resolution makes sure achievements don't get "lost" on temporary session wallets. The delegation chain maps session keys back to the player's main wallet, so everything gets attributed correctly no matter which signing method was used.

## An open ecosystem

Unlike platform-locked achievement systems (Steam, Xbox, PlayStation), PRC-1 achievements follow your wallet, not your platform account. Any app can aggregate achievements from any PRC-1 game. There's no central authority controlling the registry. And PRC-6 shows how you can extend the base standard for specific platforms without breaking compatibility.

The [achievement system code is built into EffectStream](https://github.com/effectstream/effectstream). Any new game built with the framework gets PRC-1 support out of the box: define your achievements as data, and the framework handles tracking and the API. Every new game that adopts the standard makes the whole ecosystem richer.
