---
slug: game-templates
title: "Game Template Library: On-Chain Game Patterns for Every Chain"
authors: [effectstream]
tags: [templates, games, open-source, midnight, zk]
---

The best way to learn a framework is to see it in action. We've built five game templates, each one showing a different chain integration, cryptographic technique, or architectural pattern. They're all open-source, playable live, and ready to fork.

<!-- truncate -->

## Safe Solver: multichain L2 on Arbitrum + Midnight

Safe Solver is a fast, interactive puzzle game that runs multichain on Arbitrum and [Midnight](https://midnight.network/). It demonstrates EffectStream working as an L2 across both chains, with deterministic randomness derived per block and L2 interaction for game execution.

The game itself is a puzzle where players solve safe combinations on-chain. The random puzzle generation is deterministic per block, so all nodes reach the same result. EffectStream handles game logic and state transitions as an L2, while Arbitrum and Midnight provide the settlement layers. This is a good example of how a fast, interactive game can work on-chain without sacrificing responsiveness.

Most on-chain games either commit to a single chain or accept inconsistent state across chains. Safe Solver runs the **same** game logic over Arbitrum and Midnight blocks simultaneously, with EffectStream computing the deterministic result both chains independently agree on - and this multichain L2 pattern is the foundation the other four templates build on.

- [Source code](https://github.com/effectstream/safe-solver)
- [Play live](https://safesolver.midnight.fun/)

<iframe src="https://drive.google.com/file/d/1KhkfE4dM5dI3Wo0P3Ij8V3rOTLdHaGX1/preview" width="100%" height="480" allow="autoplay"></iframe>

## Kachina Kolosseum: multiplayer Midnight ZK game

Kachina Kolosseum is a multiplayer PvP game built entirely on Midnight, demonstrating commit-reveal schemes written in Compact (Midnight's ZK language). All proofs are generated in the browser, so players don't need any backend infrastructure to play.

In PvP on a public blockchain, the second player has an inherent advantage: they can see the first player's move and counter it. The commit-reveal scheme in Compact fixes this. Both players commit their moves privately, then reveal simultaneously. ZK proofs verify the revealed move matches the original commitment without exposing it early. If someone refuses to reveal (griefing), a timeout kicks in and they forfeit. Proof generation happens client-side and completes in under a second.

The protocol is named after the academic work it builds on - [Kachina: Foundations of Private Smart Contracts (Kerber, Kiayias, Kohlweiss; University of Edinburgh, 2020)](https://eprint.iacr.org/2020/543.pdf) and the [extended 2021 manuscript](https://www.pure.ed.ac.uk/ws/portalfiles/portal/217971659/Kachina_KERBER_DOA19042021_AFV.pdf), which formalises the model for private smart contracts that underlies Midnight's design. Kachina Kolosseum is the gameplay-shaped instantiation of those ideas: a trustless commit-reveal arena where the cryptography is the rulebook.

- [Play live](https://kachina.midnight.fun/)
- [Source code](https://github.com/PaimaStudios/pvp-arena)

<iframe src="https://drive.google.com/file/d/1nWB8zxtxPLHfFZIw3trh0bAylb6DE8JT/preview" width="100%" height="480" allow="autoplay"></iframe>

## Block Kart Legends: on-chain TypeScript simulation on Arbitrum + Midnight

Block Kart Legends is a racing game that runs **complex TypeScript on-chain code** cross-chain on Arbitrum and Midnight. It generates a deterministic L2 based on EVM + Midnight blocks, where it executes the race simulations. The entire race physics run deterministically in the L2, so every node computes the same result.

"On-chain TypeScript code" is the unusual part. Most chains run a custom VM (EVM, Move, Cairo) or expose a constrained DSL. Block Kart's game loop is plain TypeScript - collisions, friction, momentum, lap detection - running as the L2's state transition function and replayed identically by every full node. The language doesn't change between local development, testing, and on-chain execution, which is what makes it practical to ship a real physics simulation as on-chain logic rather than as a thin coordination layer over an off-chain server.

Arbitrum handles the transaction layer (race entries, rewards, leaderboard updates), while Midnight provides ZK verification of race results. This means a player's race time is provably legitimate without needing a centralized game server to validate every result.

- [Play live](https://blockkart.paimastudios.com/)
- [Source code](https://github.com/effectstream/block-kart-legends)

<iframe src="https://drive.google.com/file/d/1ccQkU2bNeJLPzqsURORuzctcg0kZqpSe/preview" width="100%" height="480" allow="autoplay"></iframe>

## Dust-2-Dust: large-scale ZK game in Compact

The most technically complex template, by a clear margin. Dust-2-Dust is a roguelike deck builder written entirely in Compact (Midnight's ZK language), proving that ZK languages can encode and execute complex game behaviors. All proofs are calculated with WASM in the browser.

This isn't a simple proof-of-concept. It's a full game with hidden inventory, private resource management, and strategic decisions that stay secret until their effects show up in gameplay. Multiple interacting ZK circuits compose together for complex game logic while preserving privacy throughout.

Where most ZK games stop at a single circuit - one private state, one reveal - Dust-2-Dust threads many circuits together: drawing cards, using items, combat resolution, level progression, each with their own private state, all composed into one game session that lasts dozens of turns. The template is deliberately pushing the limits of state-of-the-art ZK circuit complexity: how much logic can you fit in a single Compact program, how many circuits can compose without proof generation becoming impractical, how much hidden state can persist between rounds without leaking through the public commitment? Dust-2-Dust's answers to those questions are the upper bound for what's currently shippable as a browser-side ZK game.

- [Play live](https://dust2dust.midnight.fun/)
- [Source code](https://github.com/PaimaStudios/midnight-game-2/)

<iframe src="https://drive.google.com/file/d/1FjfRFUPtxoIVSWhiFV0I7CtdS43xuM-L/preview" width="100%" height="480" allow="autoplay"></iframe>

## Go Fish: ZK Mental Poker

Go Fish is a ZK implementation of "Mental Poker," the classic cryptographic problem of playing a fair card game without a trusted dealer. It's built entirely on a ZK contract, which means any card-like game can be implemented on top of the same protocol. Trustless card games, no server needed.

The protocol uses a commit-reveal scheme combined with shared secret derivation. When cards are "dealt," the deck is encrypted so that neither player can read it alone. Each card reveal requires cooperative decryption: both players contribute their share to reveal a card, which means neither side can peek ahead or manipulate the draw order. A fair deal is enforced by the math, not by trusting a server.

Once you have a trustless deck, the protocol generalises. Poker, blackjack, and trick-taking games all fall out of the same foundation. So do trading-card games with hidden hands - a Magic: The Gathering-style game, where each player has a private hand drawn from a shuffled deck and cards are revealed when played, is exactly the shape of the problem Go Fish solves. The same circuit that makes "Go Fish" trustless makes a full Magic-style card game trustless too: the only thing that changes is the card definitions and the turn rules, both of which run on top of the shared deck-and-hand primitive.

- [Template code](https://github.com/effectstream/go-fish)
- [Cryptography design document](https://docs.google.com/document/d/1FTXbkeUkDAVDI45KWkmQGFHYqPuSQxiX6wW6mYv0FOY/edit)

<iframe src="https://drive.google.com/file/d/1gpwcnFksFkytiP6G9OORXyd5aWLv51bB/preview" width="100%" height="480" allow="autoplay"></iframe>

---

## All templates at a glance

| Template | Chain | What's novel | Live URL |
|----------|-------|-------------|----------|
| **Safe Solver** | Arbitrum + Midnight | Multichain L2, deterministic random per block | [safesolver.midnight.fun](https://safesolver.midnight.fun/) |
| **Kachina Kolosseum** | Midnight | Multiplayer ZK game, browser proofs, Compact commit-reveal (based on the Kachina academic work) | [kachina.midnight.fun](https://kachina.midnight.fun/) |
| **Block Kart Legends** | Arbitrum + Midnight | On-chain TypeScript code, deterministic L2 physics | [blockkart.paimastudios.com](https://blockkart.paimastudios.com/) |
| **Dust-2-Dust** | Midnight | Full roguelike deck builder in Compact, multi-circuit ZK at the limit of the current state of the art | [dust2dust.midnight.fun](https://dust2dust.midnight.fun/) |
| **Go Fish** | Midnight | ZK Mental Poker, foundation for any trustless trading-card game (Magic-style hidden hands, poker, blackjack) | Local only |

Every template is a complete, deployable game you can fork, modify, and ship. The [game templates repository](https://github.com/PaimaStudios/paima-game-templates) is the fastest way to start building with EffectStream.
