---
slug: achievement-system
title: "An Open Achievement Standard for On-Chain Games"
authors: [effectstream]
tags: [achievements, standards, cross-game, portal]
---

`WRITE: Steam has achievements. Xbox has Gamerscore. PlayStation has Trophies. But on-chain games have no standard way to track player accomplishments across games. We built one — an open standard that any EffectStream game can implement, plus a portal where players can see all their achievements in one place.`

<!-- truncate -->

## Defining the Standard

We created a PRC (Paima Request for Comment) — a community standard similar to [CIPs](https://cips.cardano.org/) for Cardano or [ERCs](https://eips.ethereum.org/erc) for Ethereum, but for the EffectStream ecosystem. The achievement PRC defines how games register, track, and expose achievements via a standard API.

- [Achievement standard documentation](https://docs.paimastudios.com/home/game-node-api/achievements)

`WRITE: Brief overview of the standard — what does a game need to implement? What API endpoints does it expose? How are achievements defined (name, description, conditions, rarity)?`

## Proof of Concept — Multiple Games, One Standard

To validate the standard, we integrated it into multiple live games:

- [Tarochi](https://tarochi.paimastudios.com/)
- [Tower Defense](https://tower-defense.paimastudios.com/)
- [Kachina Kolloseum](https://kachina.midnight.fun/)
- [Dust-2-Dust](https://dust2dust.midnight.fun/)
- [Block Kart Legends](https://blockkart.paimastudios.com/)
- [Safe Solver](https://safesolver.midnight.fun/)

Here's what achievement registration looks like in practice — it's a few lines of code in your game's entry point:

```typescript
// From Tower Defense — registering achievements
// Source: https://github.com/PaimaStudios/tower-defense-backend/blob/07bd625/backend/src/index.ts#L34
```

`WRITE: Show the actual code snippet from Tower Defense's index.ts. Explain how simple it is — you define achievements as data, the framework handles tracking and the API.`

`ADD VIDEO HERE — existing video: https://drive.google.com/file/d/1SSpY_nFAIm95b7v4LSEDhSywYgAkx0nK/view`

## Designing the Achievement Portal

With a standard API, we could build a portal that aggregates achievements from every game. Players connect their wallet and see all their accomplishments in one place — across every EffectStream game they've played.

- [Design (Figma)](https://www.figma.com/design/vC06elYvCWonA7hCC64K2g/Paima-Portal?node-id=260-2267)

`ADD: Screenshots of the portal design — the main achievement list, individual achievement detail, progress indicators`

The portal queries each game's achievement API and presents a unified view. No centralized database — the data lives in each game's node, and the portal aggregates it on the fly.

## Building and Launching the Portal

The achievement portal is live and available:

- [Portal implementation](https://github.com/PaimaStudios/paima-portal/blob/main/src/pages/Achievement.tsx)
- [Announcement](https://x.com/PaimaStudios/status/1902218101380329521)

`FIX: portal.paimastudios.com is not working — midnight.fun now shows achievements as the primary portal`

`ADD: Screenshots/video of the working portal — connect wallet, browse achievements across games, see completion progress`

`WRITE: Walk through the portal experience — connect wallet, see achievements from all games you've played, view progress toward incomplete achievements, see which games you haven't tried yet`

## Conclusion — The Achievement Ecosystem

The achievement system is now live and integrated into 6+ games, with the [achievement code built into EffectStream itself](https://github.com/search?q=repo%3APaimaStudios%2Fpaima-engine%20achievements&type=code). Any new game built with the framework gets achievement support out of the box.

`WRITE: Closing vision — as more games adopt the standard, the achievement portal becomes a cross-game player profile. Unlike platform-locked achievements (Steam, Xbox, PlayStation), these are on-chain and portable. Your gaming history follows your wallet, not your platform account. And because the standard is open, anyone can build their own portal or integrate achievement data into their application.`

`ADD VIDEO HERE showing the complete achievement ecosystem — multiple games, one portal, one player profile`
