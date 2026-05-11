---
slug: game-templates
title: "Game Template Library: On-Chain Game Patterns for Every Chain"
authors: [effectstream]
tags: [templates, games, open-source, midnight, zk]
---

The best way to learn a framework is to see it in action. We've built five game templates, each one showing a different chain integration, cryptographic technique, or architectural pattern. They're all open-source, playable live, and ready to fork.

<!-- truncate -->

## Trading Card Game: cryptographic card mechanics

How do you deal cards fairly on a public blockchain? Every transaction is visible, so a naive implementation would let opponents see your hand. We solved this with a cryptographic protocol for hidden-hand card games, no trusted dealer needed.

The protocol uses a commit-reveal scheme combined with shared secret derivation. When cards are "dealt," the deck is encrypted so that neither player can read it alone. Each card reveal requires cooperative decryption: both players contribute their share to reveal a card, which means neither side can peek ahead or manipulate the draw order. A fair deal is enforced by the math, not by trusting a server.

- [Template code](https://github.com/PaimaStudios/paima-game-templates/tree/main/trading-cards)
- [Cryptography design document](https://docs.google.com/document/d/1FTXbkeUkDAVDI45KWkmQGFHYqPuSQxiX6wW6mYv0FOY/edit)

<iframe src="https://drive.google.com/file/d/1uUQyrtCAa9R_ohqNshLnubgu0_9_dm_v/preview" width="100%" height="480" allow="autoplay"></iframe>

## Safe Solver: EffectStream L2 on Midnight

Safe Solver runs EffectStream as a Layer 2 on [Midnight](https://midnight.network/), a privacy-focused blockchain. It shows that EffectStream can work as an execution layer on top of privacy-preserving infrastructure.

The game itself is a puzzle where players solve safe combinations on-chain. Because it runs on Midnight, the solution state stays private until the player decides to reveal it (something you just can't do on fully transparent chains). EffectStream handles game logic and state transitions; Midnight provides the settlement layer with built-in privacy.

- [Source code](https://github.com/effectstream/safe-solver)
- [Play live](https://safesolver.midnight.fun/)

<iframe src="https://drive.google.com/file/d/1KhkfE4dM5dI3Wo0P3Ij8V3rOTLdHaGX1/preview" width="100%" height="480" allow="autoplay"></iframe>

## Kachina Kolosseum: ZK commit-reveal PvP

In PvP on a public blockchain, the second player has an inherent advantage: they can see the first player's move and counter it. ZK commit-reveal fixes this. Both players commit their moves privately using a hash, then reveal simultaneously. Zero-knowledge proofs make sure the revealed move matches the original commitment without exposing it early.

From the player's perspective, both sides choose their action, the game shows a brief "waiting for reveal" phase, then both moves appear at once. If someone refuses to reveal (griefing), a timeout kicks in and the non-revealing player forfeits. ZK proof generation happens client-side and completes in under a second on modern hardware.

- [Play live](https://kachina.midnight.fun/)
- [Source code](https://github.com/PaimaStudios/pvp-arena)

<iframe src="https://drive.google.com/file/d/1nWB8zxtxPLHfFZIw3trh0bAylb6DE8JT/preview" width="100%" height="480" allow="autoplay"></iframe>

## Block Kart Legends: cross-chain EVM + ZK

Block Kart Legends is a racing game that runs cross-chain on Arbitrum (EVM) with ZK proofs for race result verification. Arbitrum handles the transaction layer (race entries, rewards, leaderboard updates), while zero-knowledge proofs verify that race results are legit. This anti-cheat mechanism proves a player actually completed the race with the claimed time, without needing a centralized game server to validate every result.

- [Play live](https://blockkart.paimastudios.com/)
- [Source code](https://github.com/effectstream/block-kart-legends)

<iframe src="https://drive.google.com/file/d/1ccQkU2bNeJLPzqsURORuzctcg0kZqpSe/preview" width="100%" height="480" allow="autoplay"></iframe>

## Dust-2-Dust: complex ZK contract patterns

The most technically complex template. Dust-2-Dust uses multiple interacting zero-knowledge circuits: not just a single proof for one action, but a system of proofs that compose together for complex game logic while preserving privacy. Hidden inventory, private resource management, strategic decisions that stay secret until their effects show up in gameplay.

- [Play live](https://dust2dust.midnight.fun/)
- [Source code](https://github.com/PaimaStudios/midnight-game-2/)

<iframe src="https://drive.google.com/file/d/1FjfRFUPtxoIVSWhiFV0I7CtdS43xuM-L/preview" width="100%" height="480" allow="autoplay"></iframe>

---

## All templates at a glance

| Template | Chain | What's novel | Live URL |
|----------|-------|-------------|----------|
| **Safe Solver** | Midnight | EffectStream as an L2 on a privacy chain | [safesolver.midnight.fun](https://safesolver.midnight.fun/) |
| **Kachina Kolosseum** | Midnight | ZK commit-reveal for fair PvP | [kachina.midnight.fun](https://kachina.midnight.fun/) |
| **Block Kart Legends** | Arbitrum + ZK | Cross-chain racing with ZK anti-cheat | [blockkart.paimastudios.com](https://blockkart.paimastudios.com/) |
| **Dust-2-Dust** | Midnight | Complex multi-circuit ZK contracts | [dust2dust.midnight.fun](https://dust2dust.midnight.fun/) |

Every template is a complete, deployable game you can fork, modify, and ship. The [game templates repository](https://github.com/PaimaStudios/paima-game-templates) is the fastest way to start building with EffectStream.
