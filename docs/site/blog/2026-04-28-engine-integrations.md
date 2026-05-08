---
slug: engine-integrations
title: "Engine Integrations: From Local Development to Mobile AR"
authors: [effectstream]
tags: [game-engines, developer-tools, ar, farcaster]
---

`WRITE: EffectStream is designed to integrate with any game engine or platform. This article covers five distinct integrations — each demonstrating a different technology combination, from modern local dev tooling to social platform frames to mobile augmented reality.`

<!-- truncate -->

## Getting Started — First Engine Integration

`INVESTIGATE: Which engine/technology was the first template? What was the novel integration?`

`WRITE: Why this integration was chosen, what it demonstrates about EffectStream's flexibility`

`ADD: Link to template code`

`ADD VIDEO HERE showing the integration in action`

## Modern Local Development with Hardhat and Dolos

One of the biggest friction points for multi-chain developers is setting up a local development environment. Syncing a Cardano indexer (Carp) can take days on testnet, and even longer on mainnet — making rapid iteration nearly impossible.

We integrated [Hardhat v3](https://hardhat.org/) for EVM contract development and [Dolos](https://github.com/txpipe/dolos) with utxorpc for Cardano indexing. Together, they replace the heavy Carp sync with an instant localhost setup.

The result: spin up a full multi-chain development environment (EVM + Cardano) in minutes, not days.

`WRITE: The before/after story in more detail — what did the old workflow look like? How long did Carp sync take? What does the new Dolos-based workflow look like? How does this change developer iteration speed?`

`ADD DOCUMENTATION: Step-by-step guide for setting up the local multi-chain dev environment`

`ADD VIDEO HERE: Demo of spinning up local nodes — show the time from zero to a working multi-chain environment`

## Template #3

`INVESTIGATE: What technology does this template showcase? What's the novel integration?`

- [Source code](https://github.com/PaimaStudios/paima-game-templates/pull/87)

`ACTION: This PR is not merged. Need to migrate/merge`

`WRITE: What makes this integration novel — what technology does it bring to on-chain applications?`

`ADD VIDEO HERE`

## Farcaster Frame Integration

[Farcaster Frames](https://docs.farcaster.xyz/developers/frames/) are mini-applications that run directly inside Farcaster's social feed. We built a template that turns an EffectStream game into a Frame — playable without leaving the social feed, no app install required.

- [Template code](https://github.com/PaimaStudios/paima-game-templates/tree/main/farcaster-frame)

`WRITE: Why Farcaster Frames matter for on-chain games — distribution through social feeds is a fundamentally different growth model. Instead of "download our app", it's "play this game right here in your feed." Every share is a playable instance.`

`ADD: Get context from Tad for the technical write-up — what were the interesting challenges of fitting an EffectStream game into a Frame?`

`ADD VIDEO HERE (public version — existing internal recording exists on Slack)`

## Conclusion — Mobile AR with GPS

The most ambitious integration: a game template combining GPS location data and Augmented Reality for iOS and Android.

- [Template code](https://github.com/PaimaStudios/paima-game-templates/pull/85)

`ACTION: Deploy to Google Play`

`ACTION: Need AR feature — possibly 3D coin/asset selection overlaid on camera feed`

`WRITE: The vision — Pokemon Go meets on-chain ownership. Location-based gameplay where the assets you find, collect, and trade are real on-chain tokens. What this template demonstrates about EffectStream's flexibility beyond the browser.`

`NEEDS: User feedback from testnet participation`

`ADD VIDEO + IMAGES HERE showing the AR experience on a real device`

`WRITE: Closing — from browser games to social feed Frames to mobile AR, EffectStream adapts to wherever users are. Each integration shows a different facet of the framework's flexibility, and all templates are open-source for anyone to build on.`
