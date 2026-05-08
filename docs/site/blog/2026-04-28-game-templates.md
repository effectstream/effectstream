---
slug: game-templates
title: "Game Template Library: On-Chain Game Patterns for Every Chain"
authors: [effectstream]
tags: [templates, games, open-source, midnight, zk]
---

`WRITE: The best way to learn a framework is to see it in action. We've built five distinct game templates — each showcasing a different chain integration, cryptographic technique, or architectural pattern. All are open-source and playable live. This article walks through each one and explains the technology behind it.`

<!-- truncate -->

## Trading Card Game — Cryptographic Card Mechanics

How do you deal cards fairly on a public blockchain? Every transaction is visible, so a naive implementation would let opponents see your hand. We solved this with a novel cryptographic protocol for hidden-hand card games.

- [Template code](https://github.com/PaimaStudios/paima-game-templates/tree/main/trading-cards)
- [Cryptography design document](https://docs.google.com/document/d/1FTXbkeUkDAVDI45KWkmQGFHYqPuSQxiX6wW6mYv0FOY/edit)

`ADD VIDEO HERE — existing video: https://drive.google.com/file/d/1uUQyrtCAa9R_ohqNshLnubgu0_9_dm_v/view`

`WRITE: Explain the cryptographic approach — is this a mental poker protocol? Commit-reveal? How does the dealing work without a trusted dealer? What guarantees does the player have that the deal is fair?`

## Safe Solver — EffectStream L2 on Midnight

Safe Solver runs EffectStream as a Layer 2 on [Midnight](https://midnight.network/), a privacy-focused blockchain. This demonstrates that EffectStream can act as an execution layer on top of privacy-preserving infrastructure.

- [Source code](https://github.com/effectstream/safe-solver)
- [Play live](https://safesolver.midnight.fun/)

`WRITE: What is Safe Solver as a game? What's the mechanic? Why does it benefit from Midnight's privacy features? How does EffectStream function as an L2 — what role does Midnight play vs. EffectStream?`

`ADD VIDEO HERE showing gameplay`

## Kachina Kolloseum — ZK Commit-Reveal PvP

In a PvP game on a public blockchain, the second player has an unfair advantage: they can see the first player's move and counter it. ZK commit-reveal eliminates this problem — both players commit their moves privately (using a hash), then reveal simultaneously. Zero-knowledge proofs ensure the revealed move matches the commitment.

- [Play live](https://kachina.midnight.fun/)
- [Source code](https://github.com/PaimaStudios/pvp-arena)

`WRITE: Walk through the commit-reveal flow in more detail. What does the player experience look like? How fast is the ZK proof generation? What happens if a player refuses to reveal?`

`ADD VIDEO HERE showing a PvP match — highlight the commit phase and reveal phase`

## Block Kart Legends — Cross-Chain EVM + ZK

Block Kart Legends is a racing game that runs cross-chain on Arbitrum (EVM) with ZK proofs for game state verification.

- [Play live](https://blockkart.paimastudios.com/)
- [Source code](https://github.com/effectstream/block-kart-legends)

`WRITE: What makes this cross-chain? What role does Arbitrum play? How are ZK proofs used in a racing game — proof of race completion? Anti-cheat? Explain the architecture.`

`ADD VIDEO HERE showing a race`

## Conclusion — Dust-2-Dust and Complex ZK Contracts

The most technically complex template is Dust-2-Dust, which pushes the boundaries of what's possible with ZK contracts on Midnight.

- [Play live](https://dust2dust.midnight.fun/)
- [Source code](https://github.com/PaimaStudios/midnight-game-2/)

`VERIFY: Is Dust-2-Dust fully functional and ready to showcase?`

`WRITE: What makes this the most complex template? What ZK techniques does it use that the others don't? More complex contract logic? Multiple interacting ZK circuits? Explain what pushes the boundary.`

`ADD VIDEO HERE`

---

Five templates, five different approaches to on-chain gaming. Each one is open-source and ready to fork:

- **Trading Cards** — cryptographic card mechanics without a trusted dealer
- **Safe Solver** — EffectStream as an L2 on Midnight
- **Kachina Kolloseum** — ZK commit-reveal for fair PvP
- **Block Kart Legends** — cross-chain EVM racing with ZK
- **Dust-2-Dust** — complex ZK contract patterns

`WRITE: Closing thought — these aren't just demos. Each template is a complete, deployable game that developers can fork, modify, and ship. The [game templates repository](https://github.com/PaimaStudios/paima-game-templates) is the fastest way to start building with EffectStream.`
